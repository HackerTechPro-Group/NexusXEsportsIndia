import { adminRequest } from './adminClient';
import type {
  CmsPublicationState,
  CmsRevisionRecord,
  CmsSnapshotPayload,
  MediaAssetRecord,
} from '../../types/cms';
import type { PlatformTournament } from '../../api/platformClient';

export interface AdminCmsWorkspaceResponse {
  draft: CmsSnapshotPayload;
  published: CmsSnapshotPayload;
  publication: CmsPublicationState;
  revisions: CmsRevisionRecord[];
  mediaAssets: MediaAssetRecord[];
  availableTournaments: PlatformTournament[];
}

export async function fetchAdminCmsWorkspace(apiBaseUrl: string): Promise<AdminCmsWorkspaceResponse> {
  return adminRequest<AdminCmsWorkspaceResponse>(apiBaseUrl, '/api/admin/cms/workspace', {
    method: 'GET',
  });
}

export async function fetchAdminCmsPreview(
  apiBaseUrl: string
): Promise<{ preview: boolean; draft: CmsSnapshotPayload }> {
  return adminRequest<{ preview: boolean; draft: CmsSnapshotPayload }>(
    apiBaseUrl,
    '/api/admin/cms/preview',
    { method: 'GET' }
  );
}

export async function saveAdminCmsDraft(
  apiBaseUrl: string,
  snapshot: CmsSnapshotPayload,
  expectedDraftVersion?: number
): Promise<{ ok: true; draftVersion: number; publication: CmsPublicationState }> {
  return adminRequest(apiBaseUrl, '/api/admin/cms/draft', {
    method: 'PUT',
    body: JSON.stringify({ snapshot, expectedDraftVersion }),
  });
}

export async function publishAdminCmsLive(
  apiBaseUrl: string,
  summary?: string
): Promise<{ ok: true; version: number; etag: string; publication: CmsPublicationState }> {
  return adminRequest(apiBaseUrl, '/api/admin/cms/publish', {
    method: 'POST',
    body: JSON.stringify({ summary: summary || undefined }),
  });
}

export async function rollbackAdminCmsRevision(
  apiBaseUrl: string,
  revisionId: string
): Promise<{
  ok: true;
  version: number;
  etag: string;
  publication: CmsPublicationState;
  snapshot: CmsSnapshotPayload;
}> {
  return adminRequest(apiBaseUrl, '/api/admin/cms/rollback', {
    method: 'POST',
    body: JSON.stringify({ revisionId }),
  });
}

export async function fetchAdminMediaAssets(
  apiBaseUrl: string
): Promise<{ assets: MediaAssetRecord[] }> {
  return adminRequest<{ assets: MediaAssetRecord[] }>(apiBaseUrl, '/api/admin/media', {
    method: 'GET',
  });
}

export async function uploadAdminMediaAsset(
  apiBaseUrl: string,
  file: File,
  folder = 'uploads',
  altText = ''
): Promise<{ asset: MediaAssetRecord }> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  form.append('altText', altText);
  return adminRequest<{ asset: MediaAssetRecord }>(apiBaseUrl, '/api/admin/media/upload', {
    method: 'POST',
    body: form,
  });
}

export async function replaceAdminMediaAsset(
  apiBaseUrl: string,
  assetId: string,
  file: File,
  altText = ''
): Promise<{ asset: MediaAssetRecord }> {
  const form = new FormData();
  form.append('file', file);
  if (altText) form.append('altText', altText);
  return adminRequest<{ asset: MediaAssetRecord }>(
    apiBaseUrl,
    `/api/admin/media/${encodeURIComponent(assetId)}/replace`,
    {
      method: 'POST',
      body: form,
    }
  );
}

export async function deleteAdminMediaAsset(
  apiBaseUrl: string,
  assetId: string,
  force = false
): Promise<{ deleted: true }> {
  const qs = force ? '?force=1' : '';
  return adminRequest<{ deleted: true }>(
    apiBaseUrl,
    `/api/admin/media/${encodeURIComponent(assetId)}${qs}`,
    { method: 'DELETE' }
  );
}
