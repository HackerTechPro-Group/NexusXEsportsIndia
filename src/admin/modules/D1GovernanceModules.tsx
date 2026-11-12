import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import {
  createAdminD1User,
  fetchAdminD1ActivityLogs,
  fetchAdminD1Reports,
  fetchAdminD1Roles,
  fetchAdminD1Users,
  updateAdminD1User,
  type AdminD1ActivityLogRow,
  type AdminD1ReportsData,
  type AdminD1RoleInfo,
  type AdminD1UserRow,
} from '../api/adminD1Client';

const INPUT_CLASS =
  'w-full rounded-lg bg-[#050709] border border-white/10 focus:border-[#22C55E] focus:outline-none px-3 py-2 text-xs text-white placeholder:text-slate-500';

export const AdminReportsModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [data, setData] = useState<AdminD1ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminD1Reports(apiUrl);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            Verified D1 Telemetry &amp; Ratios
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            Reports &amp; Analytics
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 font-mono text-xs text-slate-200 hover:border-[#22C55E] cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
          {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="nx-glass rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white uppercase flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#22C55E]" /> Registrations by Status
            </h3>
            {data.registrationsByStatus.length === 0 ? (
              <p className="text-xs text-slate-400">No registration records yet.</p>
            ) : (
              <div className="space-y-2.5">
                {data.registrationsByStatus.map((item) => (
                  <div key={item.status} className="space-y-1">
                    <div className="flex justify-between font-mono text-xs">
                      <span className="uppercase text-slate-300">{item.status}</span>
                      <span className="text-[#16FF6E] font-bold">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-[#22C55E]"
                        style={{ width: `${Math.min(100, Math.max(10, item.count * 10))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="nx-glass rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white uppercase">
              Registrations by BGMI Format
            </h3>
            {data.registrationsByFormat.length === 0 ? (
              <p className="text-xs text-slate-400">No division registrations yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-center">
                {data.registrationsByFormat.map((f) => (
                  <div key={f.format} className="rounded-xl bg-[#050709] border border-white/10 p-4">
                    <div className="font-mono text-[10px] uppercase text-slate-400">{f.format}</div>
                    <div className="font-display text-2xl font-bold text-[#16FF6E] mt-1">
                      {f.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="nx-glass rounded-2xl p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-white uppercase">Top Ranked Teams</h3>
            {data.topTeams.length === 0 ? (
              <p className="text-xs text-slate-400">No verified team standings yet.</p>
            ) : (
              <div className="divide-y divide-white/5 text-xs">
                {data.topTeams.map((t, i) => (
                  <div key={t.id} className="py-2.5 flex justify-between items-center">
                    <span className="text-white font-medium">
                      #{i + 1} {t.name} [{t.tag}]
                    </span>
                    <span className="font-mono text-[#16FF6E] font-bold">
                      {t.total_points} pts ({t.total_kills} kills)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="nx-glass rounded-2xl p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-white uppercase">Top Ranked Players</h3>
            {data.topPlayers.length === 0 ? (
              <p className="text-xs text-slate-400">No verified player standings yet.</p>
            ) : (
              <div className="divide-y divide-white/5 text-xs">
                {data.topPlayers.map((p, i) => (
                  <div key={p.id} className="py-2.5 flex justify-between items-center">
                    <span className="text-white font-medium">
                      #{i + 1} {p.bgmi_ign}
                    </span>
                    <span className="font-mono text-[#16FF6E] font-bold">
                      {p.total_points} pts ({p.total_kills} kills)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminUsersModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [users, setUsers] = useState<AdminD1UserRow[]>([]);
  const [roles, setRoles] = useState<AdminD1RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('moderator');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [uRes, rRes] = await Promise.all([
        fetchAdminD1Users(apiUrl),
        fetchAdminD1Roles(apiUrl),
      ]);
      setUsers(uRes.users);
      setRoles(rRes.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createAdminD1User(apiUrl, { username, email, password, roleId });
      setUsername('');
      setEmail('');
      setPassword('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create user.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            Account &amp; RBAC Directory
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase flex items-center gap-2">
            <UserCog className="h-5 w-5 text-[#22C55E]" /> User Management ({users.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="nx-btn-neon inline-flex items-center gap-1.5 px-4 py-2 text-xs cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Provision Staff / User
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="nx-glass rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-white uppercase">
            Provision Staff Member or User Account
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Initial Password
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Assigned Role
              </label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={INPUT_CLASS}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-mono uppercase text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button type="submit" className="nx-btn-neon px-4 py-2 text-xs cursor-pointer">
              Create Account
            </button>
          </div>
        </form>
      )}

      {!loading && users.length === 0 ? (
        <div className="nx-glass rounded-2xl p-10 text-center text-sm text-slate-400">
          No user accounts in D1 yet.
        </div>
      ) : (
        <div className="nx-glass rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 font-mono uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4 font-semibold text-white">{u.username}</td>
                  <td className="py-3 px-4 text-slate-300">{u.email}</td>
                  <td className="py-3 px-4">
                    <select
                      aria-label={`Role for ${u.username}`}
                      value={u.role_id}
                      onChange={(e) =>
                        void updateAdminD1User(apiUrl, u.id, { roleId: e.target.value }).then(load)
                      }
                      className="rounded bg-[#050709] border border-white/15 px-2 py-1 text-xs text-white"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.displayName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      aria-label={`Status for ${u.username}`}
                      value={u.account_status}
                      onChange={(e) =>
                        void updateAdminD1User(apiUrl, u.id, {
                          accountStatus: e.target.value as AdminD1UserRow['account_status'],
                        }).then(load)
                      }
                      className="rounded bg-[#050709] border border-white/15 px-2 py-1 text-xs text-white"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="banned">Banned</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">{u.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AdminRolesModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [roles, setRoles] = useState<AdminD1RoleInfo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchAdminD1Roles(apiUrl)
      .then((res) => setRoles(res.roles))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load roles.'));
  }, [apiUrl]);

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
          Server-Side RBAC Matrix
        </div>
        <h2 className="font-display text-2xl font-bold text-white uppercase flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#22C55E]" /> Admin Roles &amp; Permissions
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          All staff permissions are enforced server-side inside the Cloudflare Worker before every D1 query or mutation.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => (
          <div key={r.id} className="nx-glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white uppercase">{r.displayName}</h3>
              <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase bg-[#22C55E]/15 text-[#16FF6E]">
                {r.id}
              </span>
            </div>
            <p className="text-xs text-slate-400">{r.description}</p>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/10">
              {r.permissions.map((perm) => (
                <span
                  key={perm}
                  className="rounded px-2 py-0.5 font-mono text-[10px] bg-white/5 text-slate-200 border border-white/10"
                >
                  {perm}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AdminActivityLogsModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [logs, setLogs] = useState<AdminD1ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminD1ActivityLogs(apiUrl);
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            Immutable D1 Audit Trail
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#22C55E]" /> Activity Logs ({logs.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/15 px-3 py-2 font-mono text-xs text-slate-200 hover:border-[#22C55E] cursor-pointer"
        >
          Refresh Logs
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && logs.length === 0 ? (
        <div className="nx-glass rounded-2xl p-10 text-center text-sm text-slate-400">
          No activity log events recorded yet.
        </div>
      ) : (
        <div className="nx-glass rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 font-mono uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Actor (Role)</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {log.timestamp.slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="py-3 px-4 text-white font-medium whitespace-nowrap">
                    {log.actor_username} <span className="text-[#22C55E]">({log.actor_role})</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">{log.action}</td>
                  <td className="py-3 px-4 text-slate-300">{log.summary}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{log.ip_masked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
