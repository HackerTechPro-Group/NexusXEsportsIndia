import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  RefreshCw,
  Shield,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import {
  AdminApiError,
  changeAdminId,
  changeAdminPassword,
  fetchActiveAdminSessions,
  fetchSecurityAuditLog,
  revokeAllAdminSessions,
  revokeAdminSession,
} from '../api/adminClient';
import type { AdminSecurityAuditEntry, AdminSessionInfo } from '../types';

export type SecurityTab = 'account' | 'sessions' | 'activity';

interface SecuritySettingsPanelProps {
  apiUrl: string;
  currentUsername: string;
  onRequireReauth: (notice: string) => void;
  onClose: () => void;
  activeTab?: SecurityTab;
  onTabChange?: (tab: SecurityTab) => void;
}

const INPUT_CLASS =
  'w-full rounded-xl bg-[#07090E] border border-slate-700/80 focus:border-[#22C55E] focus:outline-none px-3.5 py-2 text-sm text-white placeholder:text-slate-500 transition-colors';
const LABEL_CLASS = 'block text-xs font-medium text-slate-300 mb-1.5';

export const SecuritySettingsPanel: React.FC<SecuritySettingsPanelProps> = ({
  apiUrl,
  currentUsername,
  onRequireReauth,
  onClose,
  activeTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<SecurityTab>('account');
  const tab = activeTab ?? internalTab;
  const setTab = (next: SecurityTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Account forms
  const [idCurrentPass, setIdCurrentPass] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [showIdCurrentPass, setShowIdCurrentPass] = useState(false);
  const [pwCurrentPass, setPwCurrentPass] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwFields, setShowPwFields] = useState(false);

  const pwChecks = {
    length: newPassword.length >= 14 && newPassword.length <= 256,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    digit: /[0-9]/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
    matches: Boolean(confirmPassword) && newPassword === confirmPassword,
  };

  // Sessions & audit
  const [sessions, setSessions] = useState<AdminSessionInfo[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminSecurityAuditEntry[]>([]);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState<null | 'others' | 'all'>(null);

  const loadSecurityTelemetry = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [sessRes, auditRes] = await Promise.all([
        fetchActiveAdminSessions(apiUrl),
        fetchSecurityAuditLog(apiUrl),
      ]);
      setSessions(sessRes.sessions);
      setAuditEntries(auditRes.entries);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        onRequireReauth('Your Admin session expired or was revoked. Please sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load security telemetry.');
    } finally {
      setBusy(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (tab === 'sessions' || tab === 'activity') {
      void loadSecurityTelemetry();
    }
  }, [tab, loadSecurityTelemetry]);

  const handleChangeId = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!idCurrentPass || !newUsername.trim()) {
      setError('Current password and new Admin ID are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await changeAdminId(apiUrl, idCurrentPass, newUsername.trim());
      setIdCurrentPass('');
      setNewUsername('');
      if (res.requiresReauth) {
        onRequireReauth(
          `Admin ID updated to "${res.username}". All previous sessions were terminated—sign in with your new Admin ID.`
        );
      }
    } catch (err) {
      if (
        err instanceof AdminApiError &&
        err.status === 401 &&
        !err.message.toLowerCase().includes('current password')
      ) {
        onRequireReauth('Your Admin session expired or was revoked. Please sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to update Admin ID.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!pwCurrentPass || !newPassword) {
      setError('Current password and new strong password are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await changeAdminPassword(apiUrl, pwCurrentPass, newPassword);
      setPwCurrentPass('');
      setNewPassword('');
      setConfirmPassword('');
      if (res.requiresReauth) {
        onRequireReauth(
          'Password updated cleanly and all sessions were revoked. Sign in with your new password.'
        );
      }
    } catch (err) {
      if (
        err instanceof AdminApiError &&
        err.status === 401 &&
        !err.message.toLowerCase().includes('current password')
      ) {
        onRequireReauth('Your Admin session expired or was revoked. Please sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to rotate Admin password.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeSession = async (jti: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await revokeAdminSession(apiUrl, jti);
      if (res.currentRevoked) {
        onRequireReauth('Current session was revoked. Please sign in again.');
        return;
      }
      setNotice('Selected session revoked cleanly.');
      await loadSecurityTelemetry();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        onRequireReauth('Your Admin session expired or was revoked. Please sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to revoke session.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeAll = async (includeCurrent: boolean) => {
    setConfirmRevokeAll(null);
    setBusy(true);
    setError(null);
    try {
      const res = await revokeAllAdminSessions(apiUrl, includeCurrent);
      if (res.requiresReauth) {
        onRequireReauth('All active Admin sessions have been terminated.');
        return;
      }
      setNotice(`Revoked ${res.revokedCount} other active session(s).`);
      await loadSecurityTelemetry();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        onRequireReauth('Your Admin session expired or was revoked. Please sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Admin Security Settings"
      className="rounded-2xl border border-[#22C55E]/35 bg-[#0B0E15] backdrop-blur-xl p-6 space-y-6 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-xl font-bold text-white uppercase">
              Security &amp; Owner Account Controls
            </h2>
            <p className="text-xs text-slate-400">
              Signed in as <strong className="text-slate-200">{currentUsername}</strong> • Cookie
              + CSRF sessions are stored exclusively on the Worker.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-white text-xs font-medium text-slate-300 cursor-pointer transition-colors"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Close
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Security Settings Sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'account'}
          onClick={() => setTab('account')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-colors ${
            tab === 'account'
              ? 'bg-[#22C55E] border-[#22C55E] text-[#031107] font-semibold'
              : 'bg-[#07090E] border-white/[0.08] text-slate-300 hover:text-white'
          }`}
        >
          <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
          Account Security
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sessions'}
          onClick={() => setTab('sessions')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-colors ${
            tab === 'sessions'
              ? 'bg-[#22C55E] border-[#22C55E] text-[#031107] font-semibold'
              : 'bg-[#07090E] border-white/[0.08] text-slate-300 hover:text-white'
          }`}
        >
          <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
          Active Sessions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'activity'}
          onClick={() => setTab('activity')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-mono text-xs uppercase border cursor-pointer transition-colors ${
            tab === 'activity'
              ? 'bg-[#22C55E] border-[#22C55E] text-[#031107] font-bold'
              : 'bg-[#080A0E] border-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Security Activity
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 border border-red-500/60 bg-red-950/40 p-3 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 text-[#E11D2E] shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-start gap-2 border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {tab === 'account' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Change Admin ID */}
            <form
              noValidate
              onSubmit={(e) => void handleChangeId(e)}
              className="border border-slate-800 bg-[#080A0E] p-5 space-y-4"
            >
              <div className="font-mono text-xs uppercase tracking-wider text-white font-bold flex items-center gap-2">
                <UserCog className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                Change Admin ID
              </div>
              <div>
                <label htmlFor="sec-id-current-pass" className={LABEL_CLASS}>
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="sec-id-current-pass"
                    type={showIdCurrentPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={idCurrentPass}
                    onChange={(e) => setIdCurrentPass(e.target.value)}
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowIdCurrentPass((prev) => !prev)}
                    aria-label={showIdCurrentPass ? 'Hide current password' : 'Show current password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showIdCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="sec-new-admin-id" className={LABEL_CLASS}>
                  New Admin ID (4-64 chars, letters/numbers/._-)
                </label>
                <input
                  id="sec-new-admin-id"
                  type="text"
                  autoComplete="username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter new Admin ID"
                  className={INPUT_CLASS}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="nx-btn-neon px-4 py-2 rounded-xl disabled:opacity-50 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Update Admin ID
              </button>
            </form>

            {/* Change Password */}
            <form
              noValidate
              onSubmit={(e) => void handleChangePassword(e)}
              className="border border-slate-800 bg-[#080A0E] p-5 space-y-4 rounded-xl"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs uppercase tracking-wider text-white font-bold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                  Change Owner Password
                </div>
                <button
                  type="button"
                  onClick={() => setShowPwFields((prev) => !prev)}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPwFields ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPwFields ? 'Hide' : 'Show'}
                </button>
              </div>
              <div>
                <label htmlFor="sec-pw-current" className={LABEL_CLASS}>
                  Current Password
                </label>
                <input
                  id="sec-pw-current"
                  type={showPwFields ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pwCurrentPass}
                  onChange={(e) => setPwCurrentPass(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="sec-pw-new" className={LABEL_CLASS}>
                  New Password (14+ chars, upper + lower + number + symbol)
                </label>
                <input
                  id="sec-pw-new"
                  type={showPwFields ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="sec-pw-confirm" className={LABEL_CLASS}>
                  Confirm New Password
                </label>
                <input
                  id="sec-pw-confirm"
                  type={showPwFields ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              {newPassword && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] font-mono">
                  <span className={pwChecks.length ? 'text-emerald-400' : 'text-slate-500'}>
                    • 14+ Chars
                  </span>
                  <span className={pwChecks.upper ? 'text-emerald-400' : 'text-slate-500'}>
                    • Uppercase (A-Z)
                  </span>
                  <span className={pwChecks.lower ? 'text-emerald-400' : 'text-slate-500'}>
                    • Lowercase (a-z)
                  </span>
                  <span className={pwChecks.digit ? 'text-emerald-400' : 'text-slate-500'}>
                    • Number (0-9)
                  </span>
                  <span className={pwChecks.symbol ? 'text-emerald-400' : 'text-slate-500'}>
                    • Symbol (!@#$)
                  </span>
                  <span className={pwChecks.matches ? 'text-emerald-400' : 'text-slate-500'}>
                    • Confirmed Match
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="nx-btn-neon px-4 py-2 rounded-xl disabled:opacity-50 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Rotate Password &amp; Revoke Sessions
              </button>
            </form>
          </div>

          <div className="border border-slate-800 bg-[#080A0E] p-4 space-y-2 text-xs text-slate-400">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-200 font-bold">
              Owner-Controlled Password Hashing &amp; Emergency Recovery
            </div>
            <p className="leading-relaxed">
              Worker-side authentication uses WebCrypto PBKDF2-SHA256 at 100,000 iterations with
              random 16-byte salts (Cloudflare Workers isolate CPU cap), combined with minimum
              14-character mixed passphrases and strict KV brute-force lockouts. If you ever lose
              access, clear KV <code>auth:owner</code> via Cloudflare Wrangler CLI or dashboard and
              re-provision with a fresh <code>ADMIN_SETUP_TOKEN</code> / hashed fallback secret.
            </p>
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-xs text-slate-400">
              Active Worker sessions ({sessions.length})
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadSecurityTelemetry()}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-700 hover:border-white text-xs font-mono uppercase text-slate-200 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                disabled={busy || sessions.length <= 1}
                onClick={() => setConfirmRevokeAll('others')}
                className="px-3 py-1.5 border border-amber-700/60 text-amber-300 hover:bg-amber-950/30 disabled:opacity-40 text-xs font-mono uppercase cursor-pointer"
              >
                Revoke Other Sessions
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmRevokeAll('all')}
                className="px-3 py-1.5 border border-red-900/60 text-red-300 hover:bg-red-950/30 text-xs font-mono uppercase cursor-pointer"
              >
                Sign Out Everywhere
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.jti}
                className="border border-slate-800 bg-[#080A0E] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-white">{s.username}</span>
                    <span className="font-mono text-[11px] text-slate-400">IP: {s.ipMasked}</span>
                    {s.isCurrent && (
                      <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 font-mono text-[10px] uppercase text-emerald-300">
                        Current Session
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    Client: {s.userAgentSummary}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">
                    Issued: {new Date(s.issuedAt * 1000).toISOString()} • Expires:{' '}
                    {new Date(s.expiresAt * 1000).toISOString()}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRevokeSession(s.jti)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-900/60 text-red-300 hover:bg-red-950/30 text-xs font-mono uppercase cursor-pointer shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Revoke
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="border border-slate-800 bg-[#080A0E] p-6 text-center text-xs text-slate-400">
                No active session records found.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-400">
              Recent sanitized Worker security events (never logs tokens or passwords)
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadSecurityTelemetry()}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-700 hover:border-white text-xs font-mono uppercase text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="border border-slate-800 bg-[#080A0E] p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase font-bold text-[#22C55E]">
                    {entry.event.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{entry.timestamp}</span>
                </div>
                <p className="text-slate-300">{entry.summary}</p>
                <div className="font-mono text-[10px] text-slate-500">
                  Actor: {entry.actor} • IP: {entry.ipMasked}
                </div>
              </div>
            ))}
            {auditEntries.length === 0 && (
              <div className="border border-slate-800 bg-[#080A0E] p-6 text-center text-xs text-slate-400">
                No security events recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmRevokeAll)}
        title={confirmRevokeAll === 'all' ? 'Sign Out Everywhere' : 'Revoke All Other Sessions'}
        description={
          confirmRevokeAll === 'all'
            ? 'Revoke every active session including your current browser session? You will need to sign in again immediately.'
            : 'Revoke all other active Admin sessions while keeping this session active?'
        }
        confirmLabel={confirmRevokeAll === 'all' ? 'Revoke All Sessions' : 'Revoke Others'}
        variant="danger"
        onCancel={() => setConfirmRevokeAll(null)}
        onConfirm={() => {
          if (confirmRevokeAll) {
            void handleRevokeAll(confirmRevokeAll === 'all');
          }
        }}
      />
    </section>
  );
};
