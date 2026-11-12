import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldAlert, UserPlus } from 'lucide-react';
import { usePlayerAuth } from '../context/PlayerAuthContext';
import { BrandLogo } from '../components/common/BrandLogo';
import { PageMeta } from '../components/common/PageMeta';

export const PlayerAuthPage: React.FC<{ initialMode?: 'login' | 'register' }> = ({
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const { playerUser, login, register } = usePlayerAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regIgn, setRegIgn] = useState('');
  const [regCharId, setRegCharId] = useState('');
  const [regRoleTag, setRegRoleTag] = useState('Assaulter');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (playerUser) {
      navigate('/player/dashboard', { replace: true });
    }
  }, [playerUser, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(identifier.trim(), password);
      } else {
        await register({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password,
          bgmiIgn: regIgn.trim(),
          bgmiCharId: regCharId.trim(),
          roleTag: regRoleTag,
        });
      }
      navigate('/player/dashboard');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <PageMeta
        title={mode === 'login' ? 'Player Login | NexusX Esports India' : 'Player Registration | NexusX Esports India'}
        description="Sign in or create your verified BGMI competitor profile on NexusX Esports India."
      />

      <div className="w-full max-w-md rounded-2xl nx-glass p-7 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase pt-2">
            {mode === 'login' ? 'Player Sign In' : 'Create BGMI Player Profile'}
          </h1>
          <p className="text-xs text-slate-400">
            Manage your squad roster, BGMI ID, and tournament entries in one place.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#050809] border border-white/10">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
            }}
            className={`py-2 rounded-lg font-mono text-xs uppercase cursor-pointer transition-colors ${
              mode === 'login' ? 'bg-[#22C55E] text-[#050809] font-bold' : 'text-slate-300'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg('');
            }}
            className={`py-2 rounded-lg font-mono text-xs uppercase cursor-pointer transition-colors ${
              mode === 'register' ? 'bg-[#22C55E] text-[#050809] font-bold' : 'text-slate-300'
            }`}
          >
            Register
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 flex items-center gap-2.5 text-xs text-red-200"
          >
            <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'login' ? (
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
                Username or Email
              </label>
              <input
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="your_username or email"
                className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 text-sm text-white focus:outline-none"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
                    Username *
                  </label>
                  <input
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="vanguard_01"
                    className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
                    Role Tag
                  </label>
                  <select
                    value={regRoleTag}
                    onChange={(e) => setRegRoleTag(e.target.value)}
                    className="w-full rounded-xl bg-[#050809] border border-white/15 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="IGL">IGL</option>
                    <option value="Assaulter">Assaulter</option>
                    <option value="Fragger">Fragger</option>
                    <option value="Sniper">Sniper</option>
                    <option value="Support">Support</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="player@example.com"
                  className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-2.5 text-sm text-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
                    BGMI IGN *
                  </label>
                  <input
                    required
                    value={regIgn}
                    onChange={(e) => setRegIgn(e.target.value)}
                    placeholder="In-Game Name"
                    className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
                    BGMI Char ID *
                  </label>
                  <input
                    required
                    value={regCharId}
                    onChange={(e) => setRegCharId(e.target.value)}
                    placeholder="5123456789"
                    className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5">
              Password {mode === 'register' ? '(10+ characters)' : ''}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 pr-11 text-sm text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 nx-btn-neon font-display font-bold text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
          >
            {mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {submitting
              ? 'Authenticating...'
              : mode === 'login'
              ? 'Sign In'
              : 'Create Player Account'}
          </button>
        </form>

        <div className="pt-2 border-t border-white/10 text-center text-xs text-slate-500">
          Mobile smartphone compliance applies to all NexusX BGMI events.{' '}
          <Link to="/terms" className="text-emerald-400 hover:underline">
            View Rules
          </Link>
        </div>
      </div>
    </div>
  );
};
