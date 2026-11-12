import crypto from 'node:crypto';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const BLOCKED_PREDICTABLE_SLUGS = new Set([
  '',
  'admin',
  'dashboard',
  'administrator',
  'login',
  'portal',
  'signin',
  'sign-in',
  'wp-admin',
  'gamingclub',
]);

function resolveBuildAdminRouteHash(env: Record<string, string>): string {
  const explicitHash = (env.VITE_ADMIN_PATH_HASH ?? '').trim().toLowerCase();
  if (explicitHash) {
    if (!/^[a-f0-9]{64}$/.test(explicitHash)) {
      throw new Error('VITE_ADMIN_PATH_HASH must be a 64-character lowercase SHA-256 hex string.');
    }
    return explicitHash;
  }

  const rawPath = (env.VITE_ADMIN_PATH ?? '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!rawPath) {
    return '';
  }

  const firstSegment = rawPath.split('/')[0] ?? '';
  if (BLOCKED_PREDICTABLE_SLUGS.has(rawPath) || BLOCKED_PREDICTABLE_SLUGS.has(firstSegment)) {
    throw new Error(
      `Refusing predictable VITE_ADMIN_PATH "/${rawPath}". Choose a private non-predictable path.`
    );
  }

  return crypto
    .createHash('sha256')
    .update(`nexusx:admin-route:v1:${rawPath}`, 'utf8')
    .digest('hex');
}

/**
 * Injects a strict Content Security Policy meta tag on production builds only
 * (kept out of `vite dev` so React Fast Refresh inline preambles still work locally).
 */
function productionCspPlugin(): Plugin {
  // Note: 'unsafe-inline' is restricted to style-src for Tailwind/Google Fonts inline styles;
  // script-src remains strictly 'self' with zero inline execution or eval().
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return {
    name: 'nexusx-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const adminRouteHash = resolveBuildAdminRouteHash(env);

  return {
    plugins: [react(), tailwindcss(), productionCspPlugin()],
    define: {
      __NEXUSX_ADMIN_ROUTE_HASH__: JSON.stringify(adminRouteHash),
    },
    // Relative base ensures assets resolve reliably on GitHub Pages project sites,
    // custom domains, and local previews without hardcoding a repository name.
    base: './',
  };
});
