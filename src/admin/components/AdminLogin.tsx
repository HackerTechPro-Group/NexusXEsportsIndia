import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo';
import {
  AdminApiError,
  checkAdminSetupStatus,
  completeAdminInitialSetup,
  isCrossOriginWorkerUrl,
  validateWorkerApiUrl,
} from '../api/adminClient';
import type { AdminSetupStatus } from '../types';

interface AdminLoginProps {
  initialApiUrl: string;
  initialNotice?: string | null;
  onLoginSuccess: (apiUrl: string, username: string) => void;
  onAttemptLogin: (apiUrl: string, username: string, password: string) => Promise<{ username: string }>;
}

const INPUT_CLASS =
  'w-full rounded-lg bg-[#050709] border border-white/10 focus:border-[#22C55E] focus:outline-none px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500';
const LABEL_CLASS = 'block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5';

export const AdminLogin: React.FC<AdminLoginProps> = ({
  initialApiUrl,
  initialNotice,
  onLoginSuccess,
  onAttemptLogin,
}) => {
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [showApiConfig, setShowApiConfig] = useState(!initialApiUrl);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [setupStatus, setSetupStatus] = useState<AdminSetupStatus | null>(null);

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Initial setup state
  const [setupToken, setSetupToken] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialNotice ?? null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const check = validateWorkerApiUrl(apiUrl);
    if (!check.valid) {
      setSetupStatus(null);
      return;
    }
    let cancelled = false;
    checkAdminSetupStatus(check.normalized)
      .then((res) => {
        if (!cancelled) {
          setSetupStatus(res);
          setMode(res.setupRequired ? 'setup' : 'login');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSetupStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlCheck = validateWorkerApiUrl(apiUrl);
    if (!urlCheck.valid) {
      setShowApiConfig(true);
      setError(urlCheck.error || 'Enter a valid Worker API URL.');
      return;
    }
    if (!username.trim() || !password) {
      setError('Admin username and password are required.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      const result = await onAttemptLogin(urlCheck.normalized, username.trim(), password);
      setPassword('');
      onLoginSuccess(urlCheck.normalized, result.username);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to authenticate with Worker.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urlCheck = validateWorkerApiUrl(apiUrl);
    if (!urlCheck.valid) {
      setShowApiConfig(true);
      setError(urlCheck.error || 'Enter a valid Worker API URL.');
      return;
    }
    if (!setupUsername.trim() || !setupPassword) {
      setError('Choose an Admin ID and strong password (14+ characters).');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      const res = await completeAdminInitialSetup(urlCheck.normalized, {
        setupToken,
        username: setupUsername.trim(),
        password: setupPassword,
      });
      setSetupToken('');
      setSetupPassword('');
      setSetupConfirmPassword('');
      setUsername(res.username);
      setSetupStatus({
        setupRequired: false,
        setupTokenConfigured: Boolean(setupStatus?.setupTokenConfigured),
        sessionSecretConfigured: Boolean(setupStatus?.sessionSecretConfigured),
        cloudflareAccessSetupConfigured: Boolean(setupStatus?.cloudflareAccessSetupConfigured),
      });
      setMode('login');
      setSuccessMessage(`Owner account "${res.username}" provisioned cleanly. Sign in to continue.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initial owner setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060709] px-4 py-12 bg-tactical-grid">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <BrandLogo />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Public Site
          </Link>
        </div>

        <div className="nx-glass relative rounded-2xl p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.75)] space-y-6">
          <div className="space-y-2 border-b border-white/10 pb-4">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#22C55E]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {mode === 'setup' ? 'Owner Provisioning' : 'Restricted Access'}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase">
              {mode === 'setup' ? 'Initial Owner Setup' : 'Admin Dashboard Login'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {mode === 'setup'
                ? 'Provision your permanent owner Admin ID and password inside Worker KV using your deployment setup authorization.'
                : 'Sign in via your NexusX Cloudflare Worker API to manage tournaments, Google Form registrations, results, and news announcements.'}
            </p>
            {setupStatus && !setupStatus.setupRequired && (
              <div className="mt-2 inline-flex flex-wrap items-center gap-2 border border-emerald-500/35 bg-emerald-950/25 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Single-Owner Locked Access • Public Sign-Up Permanently Disabled</span>
                {(setupStatus.ownerLockEnabled || setupStatus.cloudflareAccessSetupConfigured) && (
                  <span className="border-l border-emerald-500/40 pl-2 text-emerald-200">
                    Zero Trust Lock Active
                  </span>
                )}
              </div>
            )}
          </div>

          {successMessage && (
            <div
              role="status"
              className="flex items-start gap-2.5 border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 border border-[#E11D2E]/60 bg-red-950/40 p-3 text-xs text-red-200"
            >
              <AlertCircle className="h-4 w-4 text-[#E11D2E] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {setupStatus?.setupRequired && (
            <div className="flex rounded-xl border border-white/10 bg-[#050709] p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('setup');
                  setError(null);
                }}
                className={`flex-1 rounded-lg py-2 font-mono text-[11px] uppercase tracking-wider cursor-pointer ${
                  mode === 'setup' ? 'bg-[#22C55E] text-[#050709] font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Initial Setup
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 rounded-lg py-2 font-mono text-[11px] uppercase tracking-wider cursor-pointer ${
                  mode === 'login' ? 'bg-[#22C55E] text-[#050709] font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
            </div>
          )}

          {mode === 'setup' ? (
            <form noValidate onSubmit={(e) => void handleSetupSubmit(e)} className="space-y-4">
              {setupStatus && (!setupStatus.setupTokenConfigured || setupStatus.sessionSecretConfigured === false) && (
                <div
                  role="alert"
                  className="border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200 leading-relaxed space-y-1"
                >
                  <strong className="font-mono uppercase text-amber-100 block">
                    Worker Setup Secrets Not Initialized
                  </strong>
                  <p>
                    Run <code className="text-white">npm run setup:local</code> for local dev (or set{' '}
                    <code className="text-white">SESSION_SECRET</code> and{' '}
                    <code className="text-white">ADMIN_SETUP_TOKEN</code> via Wrangler secrets in
                    production) before submitting Initial Owner Setup.
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="setup-token" className={LABEL_CLASS}>
                  Setup Authorization Token (ADMIN_SETUP_TOKEN)
                </label>
                <input
                  id="setup-token"
                  type="password"
                  autoComplete="off"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="Enter deployment setup token"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="setup-username" className={LABEL_CLASS}>
                  Owner Admin ID (4-64 chars)
                </label>
                <input
                  id="setup-username"
                  type="text"
                  autoComplete="username"
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  placeholder="Enter your Admin ID"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="setup-password" className={LABEL_CLASS}>
                  Strong Password (14+ upper, lower, number, symbol)
                </label>
                <div className="relative">
                  <input
                    id="setup-password"
                    type={showSetupPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPassword((prev) => !prev)}
                    aria-label={showSetupPassword ? 'Hide setup password' : 'Show setup password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showSetupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="setup-confirm" className={LABEL_CLASS}>
                  Confirm Password
                </label>
                <input
                  id="setup-confirm"
                  type={showSetupPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="nx-btn-neon w-full inline-flex items-center justify-center gap-2 px-6 py-3 disabled:opacity-60 text-sm cursor-pointer"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Provisioning Owner...' : 'Complete Owner Setup'}
              </button>
            </form>
          ) : (
            <form noValidate onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="admin-username" className={LABEL_CLASS}>
                  Admin Username
                </label>
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your Admin ID"
                  className={INPUT_CLASS}
                  required
                />
              </div>

              <div>
                <label htmlFor="admin-password" className={LABEL_CLASS}>
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className={`${INPUT_CLASS} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowApiConfig((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer"
                >
                  <Server className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                  {showApiConfig ? 'Hide Worker API Endpoint' : 'Configure Worker API Endpoint'}
                </button>

                {showApiConfig && (
                  <div className="mt-2.5 p-3 bg-[#080A0E] border border-slate-800 space-y-1.5">
                    <label htmlFor="admin-worker-url" className={LABEL_CLASS}>
                      Cloudflare Worker API URL
                    </label>
                    <input
                      id="admin-worker-url"
                      type="url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://nexusx-esports-admin-worker.yourname.workers.dev"
                      className={INPUT_CLASS}
                    />
                    <p className="text-[11px] text-slate-500">
                      Defaults to <code>VITE_ADMIN_API_URL</code> if built in, or override for this
                      session.
                    </p>
                  </div>
                )}

                {isCrossOriginWorkerUrl(apiUrl) && (
                  <p className="mt-2.5 border border-slate-800 bg-[#080A0E] p-2.5 text-[11px] text-slate-400 leading-relaxed">
                    Security note: Sessions use <code className="text-slate-200">HttpOnly</code>{' '}
                    cookies and an in-memory CSRF token (zero tokens in browser storage). For
                    maximum cookie resilience in Safari/Firefox, map both the public site and{' '}
                    <code className="text-slate-200">/api/*</code> Worker behind a custom domain.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="nx-btn-neon w-full inline-flex items-center justify-center gap-2 px-6 py-3 disabled:opacity-60 text-sm cursor-pointer"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Verifying Credentials...' : 'Sign In to Admin Dashboard'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
