import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Lock,
  Save,
  Shield,
  Unlock,
  UsersRound,
} from 'lucide-react';
import { RegistrationButton } from '../../components/common/RegistrationButton';
import { RegistrationStatusBadge, TacticalBadge } from '../../components/common/StatusBadge';
import type {
  RegistrationStatus,
  TournamentLifecycleStatus,
  TournamentRecord,
  TournamentsData,
} from '../../types/data';
import { getRegistrationButtonState } from '../../utils/registration';
import { validateGoogleFormUrl, validateGoogleSheetUrl } from '../../utils/validation';
import type { PrivateSheetEntry, PrivateSheetsConfig } from '../types';

interface RegistrationModuleProps {
  tournaments: TournamentsData;
  onChange: (next: TournamentsData) => void;
  privateSheets?: Record<string, PrivateSheetEntry>;
  privateSheetsUpdatedAt?: string;
  privateSheetsError?: string | null;
  onSavePrivateSheets?: (
    nextMap: Record<string, PrivateSheetEntry>
  ) => Promise<PrivateSheetsConfig>;
}

const INPUT_CLASS =
  'w-full rounded-xl bg-[#07090E] border border-slate-700/80 focus:border-[#22C55E] focus:outline-none px-3.5 py-2 text-sm text-white placeholder:text-slate-500 transition-colors';

function updateTournamentRow(
  tournaments: TournamentsData,
  id: string,
  updater: (t: TournamentRecord) => TournamentRecord
): TournamentsData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...tournaments,
    lastUpdated: today,
    tournaments: tournaments.tournaments.map((t) => (t.id === id ? updater(t) : t)),
  };
}

export const RegistrationModule: React.FC<RegistrationModuleProps> = ({
  tournaments,
  onChange,
  privateSheets = {},
  privateSheetsUpdatedAt,
  privateSheetsError,
  onSavePrivateSheets,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [sheetDrafts, setSheetDrafts] = useState<Record<string, PrivateSheetEntry>>(privateSheets);
  const [sheetBusyId, setSheetBusyId] = useState<string | null>(null);
  const [sheetRowErrors, setSheetRowErrors] = useState<Record<string, string>>({});
  const [sheetRowNotices, setSheetRowNotices] = useState<Record<string, string>>({});

  useEffect(() => {
    setSheetDrafts(privateSheets);
  }, [privateSheets]);

  const handleSaveTournamentSheet = async (tournamentId: string) => {
    if (!onSavePrivateSheets) return;
    const entry = sheetDrafts[tournamentId] ?? { sheetUrl: '', notes: '' };
    const urlCheck = validateGoogleSheetUrl(entry.sheetUrl ?? '', true);
    if (!urlCheck.valid) {
      setSheetRowErrors((prev) => ({
        ...prev,
        [tournamentId]: urlCheck.error ?? 'Invalid Google Sheet URL.',
      }));
      return;
    }

    setSheetBusyId(tournamentId);
    setSheetRowErrors((prev) => {
      const next = { ...prev };
      delete next[tournamentId];
      return next;
    });
    setSheetRowNotices((prev) => {
      const next = { ...prev };
      delete next[tournamentId];
      return next;
    });

    try {
      const nextMap: Record<string, PrivateSheetEntry> = { ...sheetDrafts };
      if (!urlCheck.normalized && !(entry.notes ?? '').trim()) {
        delete nextMap[tournamentId];
      } else {
        nextMap[tournamentId] = {
          sheetUrl: urlCheck.normalized,
          notes: (entry.notes ?? '').trim(),
          updatedAt: new Date().toISOString(),
        };
      }
      await onSavePrivateSheets(nextMap);
      setSheetRowNotices((prev) => ({
        ...prev,
        [tournamentId]: urlCheck.normalized
          ? 'Saved private Google Sheet link securely in Worker KV.'
          : 'Cleared private Google Sheet link from Worker KV.',
      }));
    } catch (err) {
      setSheetRowErrors((prev) => ({
        ...prev,
        [tournamentId]:
          err instanceof Error ? err.message : 'Failed to save private Google Sheet config.',
      }));
    } finally {
      setSheetBusyId(null);
    }
  };

  const visibleTournaments = useMemo(
    () =>
      tournaments.tournaments.filter((t) =>
        showArchived ? true : t.status !== 'archived'
      ),
    [tournaments.tournaments, showArchived]
  );

  const stats = useMemo(() => {
    const active = tournaments.tournaments.filter((t) => t.status !== 'archived');
    const readyCount = active.filter((t) => getRegistrationButtonState(t).isEnabled).length;
    const validUrls = active.filter((t) =>
      validateGoogleFormUrl(t.registration.formUrl, false).valid
    ).length;
    return {
      total: active.length,
      readyCount,
      validUrls,
      unavailableCount: active.length - readyCount,
    };
  }, [tournaments.tournaments]);

  const setRegistrationOpenState = (record: TournamentRecord, nextRegStatus: RegistrationStatus) => {
    let nextLifecycle: TournamentLifecycleStatus = record.status;
    if (nextRegStatus === 'open' && record.status === 'registration_closed') {
      nextLifecycle = 'registration_open';
    } else if (nextRegStatus !== 'open' && record.status === 'registration_open') {
      nextLifecycle = 'registration_closed';
    }

    onChange(
      updateTournamentRow(tournaments, record.id, (t) => ({
        ...t,
        status: nextLifecycle,
        registration: {
          ...t.registration,
          status: nextRegStatus,
        },
      }))
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase tracking-tight">
            Registrations
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Attach Google Forms links, toggle Open / Full / Closed states, and store private
            organizer spreadsheets in Worker KV.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 font-mono text-xs uppercase text-slate-300 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-[#22C55E] h-4 w-4 rounded"
          />
          Show Archived
        </label>
      </div>

      {/* Private Sheet Architecture Callout */}
      <div className="rounded-xl border border-white/[0.08] bg-[#080A0E] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-300">
        <div className="flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-[#22C55E] shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong className="text-white">Zero Participant PII on Website:</strong> Registration
            forms write to your private Google Account. Organizer Google Sheets linked below stay
            encrypted inside Cloudflare Worker <code>SECURITY_KV</code> and are never published to
            GitHub or public JSON.
          </span>
        </div>
        {privateSheetsUpdatedAt && (
          <span className="font-mono text-[10px] text-slate-400 shrink-0">
            KV Synced: {privateSheetsUpdatedAt.slice(0, 10)}
          </span>
        )}
      </div>

      {privateSheetsError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-3 flex items-center gap-2 text-xs text-amber-200 font-mono"
        >
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span>Private Sheet KV status: {privateSheetsError}</span>
        </div>
      )}

      {/* Quick Telemetry */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Active Tournaments
          </div>
          <div className="font-display text-2xl font-bold text-white mt-1">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Live Register Ready
          </div>
          <div className="font-display text-2xl font-bold text-emerald-400 mt-1">
            {stats.readyCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Valid Form URLs
          </div>
          <div className="font-display text-2xl font-bold text-white mt-1">{stats.validUrls}</div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Closed / Unavailable
          </div>
          <div className="font-display text-2xl font-bold text-amber-400 mt-1">
            {stats.unavailableCount}
          </div>
        </div>
      </div>

      {/* Per-Tournament Registration Editors */}
      <div className="space-y-4">
        {visibleTournaments.map((record) => {
          const urlCheck = validateGoogleFormUrl(record.registration.formUrl, false);
          const hasText = Boolean(record.registration.formUrl.trim());
          const btnState = getRegistrationButtonState(record);
          const sheetEntry = sheetDrafts[record.id] ?? { sheetUrl: '', notes: '' };
          const sheetCheck = validateGoogleSheetUrl(sheetEntry.sheetUrl ?? '', true);
          const hasSheetUrl = Boolean((sheetEntry.sheetUrl ?? '').trim());
          const sheetRowError = sheetRowErrors[record.id];
          const sheetRowNotice = sheetRowNotices[record.id];

          return (
            <article
              key={record.id}
              className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-5 space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <TacticalBadge variant="crimson">{record.format}</TacticalBadge>
                    <TacticalBadge variant="silver">{record.id}</TacticalBadge>
                    <RegistrationStatusBadge
                      status={record.registration.status}
                      lifecycleStatus={record.status}
                      hasValidUrl={urlCheck.valid}
                    />
                  </div>
                  <h3 className="font-display text-xl font-bold text-white uppercase">
                    {record.title}
                  </h3>
                </div>

                {/* Open / Full / Closed Quick Controls */}
                <div
                  className="inline-flex border border-slate-700 bg-[#080A0E]"
                  role="group"
                  aria-label={`Registration status for ${record.title}`}
                >
                  <button
                    type="button"
                    disabled={record.status === 'archived' || record.status === 'cancelled'}
                    onClick={() => setRegistrationOpenState(record, 'open')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-mono text-xs uppercase cursor-pointer disabled:opacity-40 ${
                      record.registration.status === 'open'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                    Open
                  </button>
                  <button
                    type="button"
                    disabled={record.status === 'archived' || record.status === 'cancelled'}
                    onClick={() => setRegistrationOpenState(record, 'full')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-mono text-xs uppercase cursor-pointer disabled:opacity-40 ${
                      record.registration.status === 'full'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                    Full
                  </button>
                  <button
                    type="button"
                    disabled={record.status === 'archived' || record.status === 'cancelled'}
                    onClick={() => setRegistrationOpenState(record, 'closed')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-mono text-xs uppercase cursor-pointer disabled:opacity-40 ${
                      record.registration.status === 'closed'
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Closed
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <div className="lg:col-span-7 space-y-2">
                  <label
                    htmlFor={`reg-url-${record.id}`}
                    className="block font-mono text-[11px] uppercase tracking-wider text-slate-300"
                  >
                    Google Form HTTPS URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`reg-url-${record.id}`}
                      type="url"
                      value={record.registration.formUrl}
                      onChange={(e) =>
                        onChange(
                          updateTournamentRow(tournaments, record.id, (t) => ({
                            ...t,
                            registration: {
                              ...t.registration,
                              formUrl: e.target.value,
                            },
                          }))
                        )
                      }
                      placeholder="https://docs.google.com/forms/d/e/... or https://forms.gle/..."
                      className={INPUT_CLASS}
                    />
                    {urlCheck.valid && urlCheck.normalized && (
                      <a
                        href={urlCheck.normalized}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-2 border border-slate-700 hover:border-white bg-[#131722] text-xs font-mono uppercase text-white shrink-0"
                        title="Open Google Form in new tab"
                      >
                        Test
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  <div className="text-xs font-mono">
                    {!hasText ? (
                      <span className="text-amber-300">
                        URL empty — public site renders &quot;Registration Opening Soon&quot;.
                      </span>
                    ) : urlCheck.valid ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Validated Google Forms link ({new URL(urlCheck.normalized).hostname}).
                      </span>
                    ) : (
                      <span className="text-red-400">{urlCheck.error}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label
                        htmlFor={`reg-btn-text-${record.id}`}
                        className="block font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1"
                      >
                        Button Text
                      </label>
                      <input
                        id={`reg-btn-text-${record.id}`}
                        type="text"
                        value={record.registration.buttonText}
                        onChange={(e) =>
                          onChange(
                            updateTournamentRow(tournaments, record.id, (t) => ({
                              ...t,
                              registration: { ...t.registration, buttonText: e.target.value },
                            }))
                          )
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`reg-close-date-${record.id}`}
                        className="block font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1"
                      >
                        Registration Deadline
                      </label>
                      <input
                        id={`reg-close-date-${record.id}`}
                        type="text"
                        value={record.registration.closingDate}
                        onChange={(e) =>
                          onChange(
                            updateTournamentRow(tournaments, record.id, (t) => ({
                              ...t,
                              registration: { ...t.registration, closingDate: e.target.value },
                            }))
                          )
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`reg-closing-msg-${record.id}`}
                        className="block font-mono text-[10px] uppercase tracking-wider text-slate-400 mb-1"
                      >
                        Closing / Full Message
                      </label>
                      <input
                        id={`reg-closing-msg-${record.id}`}
                        type="text"
                        placeholder="Optional message shown when Full/Closed"
                        value={record.registration.closingMessage ?? ''}
                        onChange={(e) =>
                          onChange(
                            updateTournamentRow(tournaments, record.id, (t) => ({
                              ...t,
                              registration: { ...t.registration, closingMessage: e.target.value },
                            }))
                          )
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </div>

                {/* Live Public Website Button State Simulation */}
                <div className="lg:col-span-5 border border-slate-800 bg-[#080A0E] p-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    <Link2 className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    Public Website CTA Preview
                  </div>
                  <RegistrationButton tournament={record} showHelper />
                  <div className="font-mono text-[11px] text-slate-500">
                    Resolved State: <span className="text-slate-300">{btnState.reason}</span>
                  </div>
                </div>
              </div>

              {/* Organizer-Only Private Google Sheet Tracking (Worker SECURITY_KV) */}
              <div className="border-t border-slate-800/80 pt-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-300">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    Private Organizer Google Sheet (Worker KV Only — Never Public)
                  </div>
                  {sheetCheck.valid && sheetCheck.normalized && (
                    <a
                      href={sheetCheck.normalized}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-emerald-300 hover:text-white"
                    >
                      Open Sheet
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-start">
                  <div className="md:col-span-6">
                    <input
                      id={`priv-sheet-${record.id}`}
                      type="url"
                      aria-label={`Private Organizer Google Sheet URL for ${record.title}`}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetEntry.sheetUrl ?? ''}
                      onChange={(e) =>
                        setSheetDrafts((prev) => ({
                          ...prev,
                          [record.id]: {
                            ...prev[record.id],
                            sheetUrl: e.target.value,
                            notes: prev[record.id]?.notes ?? '',
                          },
                        }))
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <input
                      id={`priv-sheet-notes-${record.id}`}
                      type="text"
                      aria-label={`Private Sheet Notes for ${record.title}`}
                      placeholder="Internal organizer notes (optional)"
                      value={sheetEntry.notes ?? ''}
                      onChange={(e) =>
                        setSheetDrafts((prev) => ({
                          ...prev,
                          [record.id]: {
                            ...prev[record.id],
                            sheetUrl: prev[record.id]?.sheetUrl ?? '',
                            notes: e.target.value,
                          },
                        }))
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      disabled={sheetBusyId === record.id || !onSavePrivateSheets}
                      onClick={() => void handleSaveTournamentSheet(record.id)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-700 hover:border-white bg-[#131722] text-xs font-mono uppercase text-white cursor-pointer disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      {sheetBusyId === record.id ? 'Saving...' : 'Save Sheet'}
                    </button>
                  </div>
                </div>

                {hasSheetUrl && !sheetCheck.valid && (
                  <p className="font-mono text-[11px] text-red-400">{sheetCheck.error}</p>
                )}
                {sheetRowError && (
                  <p role="alert" className="font-mono text-[11px] text-red-300">
                    {sheetRowError}
                  </p>
                )}
                {sheetRowNotice && (
                  <p role="status" className="font-mono text-[11px] text-emerald-300">
                    {sheetRowNotice}
                  </p>
                )}
              </div>
            </article>
          );
        })}

        {visibleTournaments.length === 0 && (
          <div className="border border-slate-800 bg-[#0D0F14] p-10 text-center text-sm text-slate-400">
            No tournaments available to configure. Create a tournament first.
          </div>
        )}
      </div>
    </div>
  );
};
