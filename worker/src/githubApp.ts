import { base64ToBytes, base64UrlEncode } from './auth.ts';
import type { AdminContentBundle, WorkerEnv } from './types.ts';
import {
  ALLOWED_CONTENT_FILES,
  assertPermittedRepoPath,
  validateAdminContentBundle,
} from './validators.ts';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_FETCH_TIMEOUT_MS = 15_000;
const REPO_SEGMENT_REGEX = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_REGEX = /^[A-Za-z0-9_./-]{1,100}$/;

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'NexusX-Esports-Admin-Worker/1.0',
};

export class GitHubIntegrationError extends Error {
  statusCode: number;
  upstreamStatus?: number;

  constructor(safePublicMessage: string, statusCode = 502, upstreamStatus?: number) {
    super(safePublicMessage);
    this.name = 'GitHubIntegrationError';
    this.statusCode = statusCode;
    this.upstreamStatus = upstreamStatus;
  }
}

function encodeDerLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  const bytes: number[] = [];
  let rem = len;
  while (rem > 0) {
    bytes.unshift(rem & 0xff);
    rem >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Wraps a PKCS#1 RSA private key (`BEGIN RSA PRIVATE KEY`, GitHub's default export format)
 * inside a PKCS#8 PrivateKeyInfo envelope required by WebCrypto `importKey('pkcs8', ...)`.
 */
function wrapPkcs1InPkcs8(pkcs1Bytes: Uint8Array): Uint8Array {
  const versionZero = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithmId = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  const keyOctetString = concatBytes(
    new Uint8Array([0x04]),
    encodeDerLength(pkcs1Bytes.length),
    pkcs1Bytes
  );
  const body = concatBytes(versionZero, rsaAlgorithmId, keyOctetString);
  return concatBytes(new Uint8Array([0x30]), encodeDerLength(body.length), body);
}

/**
 * Converts either PKCS#8 (`BEGIN PRIVATE KEY`) or PKCS#1 (`BEGIN RSA PRIVATE KEY`) PEM text
 * into PKCS#8 DER bytes ready for WebCrypto RS256 signing.
 */
export function pemToPkcs8Der(rawPem: string): ArrayBuffer {
  const normalized = rawPem.replace(/\\n/g, '\n').trim();
  const isPkcs1 = normalized.includes('BEGIN RSA PRIVATE KEY');
  const isPkcs8 = normalized.includes('BEGIN PRIVATE KEY');

  if (!isPkcs1 && !isPkcs8) {
    throw new GitHubIntegrationError('Invalid GitHub App key format configured.', 503);
  }

  const base64Body = normalized
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const derBytes = base64ToBytes(base64Body);
  const pkcs8Bytes = isPkcs1 ? wrapPkcs1InPkcs8(derBytes) : derBytes;
  return pkcs8Bytes.buffer.slice(
    pkcs8Bytes.byteOffset,
    pkcs8Bytes.byteOffset + pkcs8Bytes.byteLength
  ) as ArrayBuffer;
}

/**
 * Creates a short-lived RS256 JWT authenticated as the configured GitHub App.
 */
export async function createGitHubAppJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  if (!appId?.trim() || !/^\d+$/.test(appId.trim())) {
    throw new GitHubIntegrationError('GITHUB_APP_ID is missing or invalid.', 503);
  }

  const pkcs8 = pemToPkcs8Der(privateKeyPem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: appId.trim(),
    })
  );

  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput)
    )
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function githubJson<T>(
  fetchFn: typeof fetch,
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  if (!url.startsWith(`${GITHUB_API_BASE}/`)) {
    throw new GitHubIntegrationError('Disallowed repository endpoint host.', 502);
  }

  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchFn(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...GITHUB_HEADERS,
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new GitHubIntegrationError('Repository API request timed out.', 504);
    }
    throw new GitHubIntegrationError('Unable to reach repository API.', 502);
  } finally {
    globalThis.clearTimeout(timerId);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`[GitHub API error] HTTP ${res.status} on ${url}`);
    throw new GitHubIntegrationError('Repository synchronization failed upstream.', 502, res.status);
  }

  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new GitHubIntegrationError('Malformed JSON response from repository API.', 502);
  }
}

function getRepoConfig(env: WorkerEnv): { owner: string; repo: string; branch: string } {
  const owner = env.GITHUB_OWNER?.trim() ?? '';
  const repo = env.GITHUB_REPO?.trim() ?? '';
  const branch = (env.GITHUB_BRANCH?.trim() || 'main');

  if (!owner || !repo || owner.includes('YOUR_') || repo.includes('YOUR_')) {
    throw new GitHubIntegrationError('Repository configuration variables are incomplete.', 503);
  }
  if (!REPO_SEGMENT_REGEX.test(owner) || !REPO_SEGMENT_REGEX.test(repo)) {
    throw new GitHubIntegrationError('Configured repository owner or name is invalid.', 503);
  }
  if (!BRANCH_REGEX.test(branch) || branch.includes('..')) {
    throw new GitHubIntegrationError('Configured repository branch name is invalid.', 503);
  }

  if (env.ALLOWED_GITHUB_OWNER?.trim() && owner !== env.ALLOWED_GITHUB_OWNER.trim()) {
    throw new GitHubIntegrationError('Configured GitHub owner is outside the allowed target policy.', 503);
  }
  if (env.ALLOWED_GITHUB_REPO?.trim() && repo !== env.ALLOWED_GITHUB_REPO.trim()) {
    throw new GitHubIntegrationError('Configured GitHub repository is outside the allowed target policy.', 503);
  }

  return { owner, repo, branch };
}

/**
 * Exchanges a signed GitHub App JWT for a short-lived installation token scoped
 * strictly to the single repository where the App is installed (`contents: write`).
 */
export async function getInstallationToken(
  env: WorkerEnv,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const installId = env.GITHUB_APP_INSTALLATION_ID?.trim() ?? '';
  if (!installId || !/^\d+$/.test(installId)) {
    throw new GitHubIntegrationError('GITHUB_APP_INSTALLATION_ID is missing or invalid.', 503);
  }

  const { repo } = getRepoConfig(env);
  const appJwt = await createGitHubAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const url = `${GITHUB_API_BASE}/app/installations/${encodeURIComponent(installId)}/access_tokens`;

  const response = await githubJson<{ token?: string }>(fetchFn, url, appJwt, {
    method: 'POST',
    body: JSON.stringify({
      repositories: [repo],
      permissions: { contents: 'write' },
    }),
  });

  if (!response.token) {
    throw new GitHubIntegrationError('Repository provider did not issue an access token.', 502);
  }
  return response.token;
}

async function fetchRepoJsonFile<T>(
  fetchFn: typeof fetch,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  repoPath: string
): Promise<T> {
  assertPermittedRepoPath(repoPath);
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const payload = await githubJson<{ content?: string; encoding?: string }>(fetchFn, url, token);
  if (!payload.content || payload.encoding !== 'base64') {
    throw new GitHubIntegrationError('Unexpected repository file payload format.', 502);
  }

  try {
    const decoded = new TextDecoder().decode(base64ToBytes(payload.content));
    return JSON.parse(decoded) as T;
  } catch {
    throw new GitHubIntegrationError('Repository content JSON could not be parsed.', 502);
  }
}

async function fetchOptionalRepoJsonFile<T>(
  fetchFn: typeof fetch,
  token: string,
  owner: string,
  repo: string,
  branch: string,
  repoPath: string
): Promise<T | undefined> {
  try {
    return await fetchRepoJsonFile<T>(fetchFn, token, owner, repo, branch, repoPath);
  } catch (err) {
    if (err instanceof GitHubIntegrationError && err.upstreamStatus === 404) {
      return undefined;
    }
    throw err;
  }
}

export async function readAdminContentFromGitHub(
  env: WorkerEnv,
  fetchFn: typeof fetch = fetch
): Promise<{
  bundle: AdminContentBundle;
  repository: string;
  branch: string;
}> {
  const { owner, repo, branch } = getRepoConfig(env);
  const token = await getInstallationToken(env, fetchFn);

  const [tournaments, results, news, siteConfig] = await Promise.all([
    fetchRepoJsonFile<AdminContentBundle['tournaments']>(
      fetchFn,
      token,
      owner,
      repo,
      branch,
      ALLOWED_CONTENT_FILES.tournaments
    ),
    fetchRepoJsonFile<AdminContentBundle['results']>(
      fetchFn,
      token,
      owner,
      repo,
      branch,
      ALLOWED_CONTENT_FILES.results
    ),
    fetchRepoJsonFile<AdminContentBundle['news']>(
      fetchFn,
      token,
      owner,
      repo,
      branch,
      ALLOWED_CONTENT_FILES.news
    ),
    fetchOptionalRepoJsonFile<NonNullable<AdminContentBundle['siteConfig']>>(
      fetchFn,
      token,
      owner,
      repo,
      branch,
      ALLOWED_CONTENT_FILES.siteConfig
    ),
  ]);

  const check = validateAdminContentBundle({
    tournaments,
    results,
    news,
    ...(siteConfig !== undefined ? { siteConfig } : {}),
  });
  if (!check.valid || !check.bundle) {
    throw new GitHubIntegrationError('Repository data failed schema validation.', 502);
  }

  return {
    bundle: check.bundle,
    repository: `${owner}/${repo}`,
    branch,
  };
}

export interface PublishCommitResult {
  commitSha: string;
  commitUrl: string;
  repository: string;
  branch: string;
  updatedFiles: string[];
  committedAt: string;
}

/**
 * Publishes validated tournaments, results, and news JSON files in a single atomic commit
 * via GitHub's Git Data API, triggering one GitHub Actions Pages build.
 */
export async function commitAdminContentToGitHub(
  env: WorkerEnv,
  bundle: AdminContentBundle,
  commitMessage: string,
  fetchFn: typeof fetch = fetch
): Promise<PublishCommitResult> {
  const { owner, repo, branch } = getRepoConfig(env);
  const token = await getInstallationToken(env, fetchFn);
  const committedAt = new Date().toISOString();
  const dateStamp = committedAt.slice(0, 10);

  const fileEntries: { path: string; content: string }[] = [
    {
      path: ALLOWED_CONTENT_FILES.tournaments,
      content: `${JSON.stringify({ ...bundle.tournaments, lastUpdated: dateStamp }, null, 2)}\n`,
    },
    {
      path: ALLOWED_CONTENT_FILES.results,
      content: `${JSON.stringify({ ...bundle.results, lastUpdated: dateStamp }, null, 2)}\n`,
    },
    {
      path: ALLOWED_CONTENT_FILES.news,
      content: `${JSON.stringify({ ...bundle.news, lastUpdated: dateStamp }, null, 2)}\n`,
    },
  ];
  if (bundle.siteConfig) {
    fileEntries.push({
      path: ALLOWED_CONTENT_FILES.siteConfig,
      content: `${JSON.stringify({ ...bundle.siteConfig, lastUpdated: dateStamp }, null, 2)}\n`,
    });
  }

  for (const entry of fileEntries) {
    assertPermittedRepoPath(entry.path);
  }

  const repoBase = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const refData = await githubJson<{ object: { sha: string } }>(
    fetchFn,
    `${repoBase}/git/ref/heads/${encodeURIComponent(branch)}`,
    token
  );
  const headSha = refData.object?.sha;
  if (!headSha) {
    throw new GitHubIntegrationError('Unable to locate target branch reference.', 502);
  }

  const headCommit = await githubJson<{ tree: { sha: string } }>(
    fetchFn,
    `${repoBase}/git/commits/${encodeURIComponent(headSha)}`,
    token
  );

  const treeEntries = await Promise.all(
    fileEntries.map(async (file) => {
      assertPermittedRepoPath(file.path);
      const blob = await githubJson<{ sha: string }>(fetchFn, `${repoBase}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({
          content: file.content,
          encoding: 'utf-8',
        }),
      });
      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      };
    })
  );

  const newTree = await githubJson<{ sha: string }>(fetchFn, `${repoBase}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: treeEntries,
    }),
  });

  const newCommit = await githubJson<{ sha: string; html_url?: string }>(
    fetchFn,
    `${repoBase}/git/commits`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        message: commitMessage,
        tree: newTree.sha,
        parents: [headSha],
      }),
    }
  );

  const updatedRef = await githubJson<{ object?: { sha?: string } }>(
    fetchFn,
    `${repoBase}/git/refs/heads/${encodeURIComponent(branch)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sha: newCommit.sha,
        force: false,
      }),
    }
  );

  if (updatedRef.object?.sha !== newCommit.sha) {
    throw new GitHubIntegrationError('Branch reference update confirmation failed.', 502);
  }

  return {
    commitSha: newCommit.sha,
    commitUrl: newCommit.html_url || `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
    repository: `${owner}/${repo}`,
    branch,
    updatedFiles: fileEntries.map((f) => f.path),
    committedAt,
  };
}
