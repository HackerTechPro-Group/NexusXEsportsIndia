import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { TacticalBadge } from '../../components/common/StatusBadge';
import type {
  ResultRankingRow,
  ResultsData,
  TournamentFormat,
  TournamentResultEntry,
  TournamentsData,
} from '../../types/data';
import { validateResultEntry } from '../../utils/validation';

interface ResultsModuleProps {
  results: ResultsData;
  tournaments: TournamentsData;
  onChange: (next: ResultsData) => void;
}

const INPUT_CLASS =
  'w-full rounded-xl bg-[#07090E] border border-slate-700/80 focus:border-[#E11D2E] focus:outline-none px-3.5 py-2 text-sm text-white placeholder:text-slate-500 transition-colors';
const LABEL_CLASS = 'block text-xs font-medium text-slate-300 mb-1.5';

function makeNewResult(existingIds: string[]): TournamentResultEntry {
  let seq = existingIds.length + 1;
  let candidate = `res-${String(seq).padStart(3, '0')}`;
  while (existingIds.includes(candidate)) {
    seq += 1;
    candidate = `res-${String(seq).padStart(3, '0')}`;
  }
  return {
    id: candidate,
    tournamentId: '',
    tournamentName: '',
    division: 'Squad',
    date: new Date().toISOString().slice(0, 10),
    winner: '',
    finalRankings: [
      { rank: 1, teamOrPlayer: '', totalPoints: 0, prize: '' },
      { rank: 2, teamOrPlayer: '', totalPoints: 0, prize: '' },
      { rank: 3, teamOrPlayer: '', totalPoints: 0, prize: '' },
    ],
    prizeDistribution: '',
    summary: '',
    published: false,
  };
}

export const ResultsModule: React.FC<ResultsModuleProps> = ({
  results,
  tournaments,
  onChange,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<TournamentResultEntry | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TournamentResultEntry | null>(null);

  const deleteEntry = (entry: TournamentResultEntry) => {
    const today = new Date().toISOString().slice(0, 10);
    onChange({
      ...results,
      lastUpdated: today,
      entries: results.entries.filter((r) => r.id !== entry.id),
    });
    setDeleteConfirm(null);
    if (draft?.id === entry.id || editingId === entry.id) {
      setDraft(null);
      setEditingId(null);
      setIsCreating(false);
    }
    setNotice(`Deleted result "${entry.tournamentName}" from staging. Click "Publish Updates" to commit.`);
  };

  const startCreate = () => {
    setDraft(makeNewResult(results.entries.map((r) => r.id)));
    setEditingId(null);
    setIsCreating(true);
    setErrors([]);
    setNotice(null);
  };

  const startEdit = (entry: TournamentResultEntry) => {
    setDraft(structuredClone({ ...entry, published: entry.published !== false }));
    setEditingId(entry.id);
    setIsCreating(false);
    setErrors([]);
    setNotice(null);
  };

  const togglePublish = (entry: TournamentResultEntry) => {
    const nextPublished = entry.published === false;
    const today = new Date().toISOString().slice(0, 10);
    onChange({
      ...results,
      lastUpdated: today,
      entries: results.entries.map((r) =>
        r.id === entry.id ? { ...r, published: nextPublished } : r
      ),
    });
    setNotice(
      nextPublished
        ? `Marked result "${entry.tournamentName}" as Published (live upon GitHub publish).`
        : `Unpublished result "${entry.tournamentName}" (hidden from public Results page).`
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;

    const cleanedRankings = draft.finalRankings.filter((r) => r.teamOrPlayer.trim().length > 0);
    const cleaned: TournamentResultEntry = {
      ...draft,
      id: draft.id.trim(),
      tournamentId: draft.tournamentId?.trim() || '',
      tournamentName: draft.tournamentName.trim(),
      winner: draft.winner.trim(),
      date: draft.date.trim(),
      prizeDistribution: draft.prizeDistribution.trim(),
      summary: draft.summary.trim(),
      finalRankings: cleanedRankings,
      published: draft.published !== false,
    };

    const validationErrors = validateResultEntry(cleaned);
    const duplicateId = results.entries.some(
      (r) => r.id === cleaned.id && (isCreating || r.id !== editingId)
    );
    if (duplicateId) {
      validationErrors.push(`Duplicate Result ID "${cleaned.id}".`);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const nextEntries = isCreating
      ? [cleaned, ...results.entries]
      : results.entries.map((r) => (r.id === editingId ? cleaned : r));

    onChange({
      ...results,
      lastUpdated: today,
      entries: nextEntries,
    });
    setDraft(null);
    setEditingId(null);
    setIsCreating(false);
    setErrors([]);
    setNotice(`Saved tournament result "${cleaned.tournamentName}" to staging.`);
  };

  const updateRankingRow = (idx: number, field: keyof ResultRankingRow, value: string | number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      finalRankings: draft.finalRankings.map((row, i) =>
        i === idx ? { ...row, [field]: value } : row
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase tracking-tight">
            Results
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Add, edit, associate with tournaments, and publish or unpublish verified match winners.
          </p>
        </div>

        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Tournament Result
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-200 font-mono"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className="text-emerald-300 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {draft && (
        <form
          noValidate
          onSubmit={handleSave}
          className="border border-[#E11D2E]/50 bg-[#0D0F14] p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-display text-xl font-bold text-white uppercase">
              {isCreating ? 'New Tournament Result' : `Editing Result ${draft.id}`}
            </h3>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
                setIsCreating(false);
                setErrors([]);
              }}
              className="px-3 py-1.5 border border-slate-700 hover:border-white text-xs font-mono uppercase text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {errors.length > 0 && (
            <div role="alert" className="border border-red-500/60 bg-red-950/40 p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-red-200 font-bold">
                <AlertCircle className="h-4 w-4 text-[#E11D2E]" aria-hidden="true" />
                Result Validation Errors
              </div>
              <ul className="list-disc pl-5 text-xs text-red-200 space-y-0.5">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-3">
              <label htmlFor="res-assoc-tour" className={LABEL_CLASS}>
                Associate with Tournament (Optional)
              </label>
              <select
                id="res-assoc-tour"
                className={INPUT_CLASS}
                value={draft.tournamentId ?? ''}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const match = tournaments.tournaments.find((t) => t.id === selectedId);
                  setDraft({
                    ...draft,
                    tournamentId: selectedId,
                    tournamentName: match ? match.title : draft.tournamentName,
                    division: match ? match.format : draft.division,
                  });
                }}
              >
                <option value="">Standalone / Custom Event Name</option>
                {tournaments.tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.id} • {t.format})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="res-id" className={LABEL_CLASS}>
                Result ID
              </label>
              <input
                id="res-id"
                type="text"
                className={INPUT_CLASS}
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="res-name" className={LABEL_CLASS}>
                Tournament Name
              </label>
              <input
                id="res-name"
                type="text"
                className={INPUT_CLASS}
                value={draft.tournamentName}
                onChange={(e) => setDraft({ ...draft, tournamentName: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="res-div" className={LABEL_CLASS}>
                Category / Division
              </label>
              <select
                id="res-div"
                className={INPUT_CLASS}
                value={draft.division}
                onChange={(e) => setDraft({ ...draft, division: e.target.value as TournamentFormat })}
              >
                <option value="Solo">Solo</option>
                <option value="Duo">Duo</option>
                <option value="Squad">Squad</option>
              </select>
            </div>

            <div>
              <label htmlFor="res-date" className={LABEL_CLASS}>
                Completion Date
              </label>
              <input
                id="res-date"
                type="text"
                className={INPUT_CLASS}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </div>

            <div>
              <label htmlFor="res-winner" className={LABEL_CLASS}>
                Winner / Champion Name
              </label>
              <input
                id="res-winner"
                type="text"
                className={INPUT_CLASS}
                value={draft.winner}
                onChange={(e) => setDraft({ ...draft, winner: e.target.value })}
                placeholder="Team / Player Winner"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.published !== false}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                  className="accent-[#E11D2E] h-4 w-4"
                />
                Publish on Public Results Page
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="res-prize" className={LABEL_CLASS}>
                Prize Distribution Notes
              </label>
              <input
                id="res-prize"
                type="text"
                className={INPUT_CLASS}
                value={draft.prizeDistribution}
                onChange={(e) => setDraft({ ...draft, prizeDistribution: e.target.value })}
                placeholder="e.g., 1st: ₹2,500 | 2nd: ₹1,500"
              />
            </div>

            <div>
              <label htmlFor="res-summary" className={LABEL_CLASS}>
                Match Summary / Notes
              </label>
              <input
                id="res-summary"
                type="text"
                className={INPUT_CLASS}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </div>
          </div>

          {/* Final Rankings Editor */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <span className={LABEL_CLASS}>Final Positions &amp; Standings</span>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    finalRankings: [
                      ...draft.finalRankings,
                      {
                        rank: draft.finalRankings.length + 1,
                        teamOrPlayer: '',
                        totalPoints: 0,
                        prize: '',
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-700 hover:border-white bg-[#131722] text-xs font-mono uppercase text-white cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Position
              </button>
            </div>

            <div className="space-y-2">
              {draft.finalRankings.map((row, idx) => (
                <div
                  key={`${idx}-${row.rank}`}
                  className="grid grid-cols-12 gap-2 items-center bg-[#080A0E] border border-slate-800 p-2.5"
                >
                  <div className="col-span-2">
                    <input
                      type="number"
                      min={1}
                      aria-label={`Position rank row ${idx + 1}`}
                      className={INPUT_CLASS}
                      value={row.rank}
                      onChange={(e) =>
                        updateRankingRow(idx, 'rank', Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="text"
                      aria-label={`Team or player row ${idx + 1}`}
                      placeholder="Team or Player Name"
                      className={INPUT_CLASS}
                      value={row.teamOrPlayer}
                      onChange={(e) => updateRankingRow(idx, 'teamOrPlayer', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      aria-label={`Total points row ${idx + 1}`}
                      placeholder="Pts"
                      className={INPUT_CLASS}
                      value={row.totalPoints}
                      onChange={(e) =>
                        updateRankingRow(idx, 'totalPoints', Number(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      aria-label={`Prize row ${idx + 1}`}
                      placeholder="Prize"
                      className={INPUT_CLASS}
                      value={row.prize}
                      onChange={(e) => updateRankingRow(idx, 'prize', e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          finalRankings: draft.finalRankings.filter((_, i) => i !== idx),
                        })
                      }
                      aria-label={`Remove ranking row ${idx + 1}`}
                      className="p-1.5 text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-800 pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Result
            </button>
          </div>
        </form>
      )}

      {/* Results List */}
      <div className="space-y-3">
        {results.entries.map((entry) => {
          const isPublished = entry.published !== false;
          return (
            <article
              key={entry.id}
              className="border border-slate-800 bg-[#0D0F14] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <TacticalBadge variant="crimson">{entry.division}</TacticalBadge>
                  <TacticalBadge variant={isPublished ? 'emerald' : 'amber'}>
                    {isPublished ? 'Published' : 'Unpublished'}
                  </TacticalBadge>
                  {entry.tournamentId && (
                    <TacticalBadge variant="silver">{entry.tournamentId}</TacticalBadge>
                  )}
                  <span className="font-mono text-xs text-slate-400">{entry.date}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white uppercase">
                  {entry.tournamentName}
                </h3>
                <p className="text-xs font-mono text-slate-300">
                  Winner: <strong className="text-white">{entry.winner}</strong> •{' '}
                  {entry.finalRankings.length} ranked entries
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 hover:border-white bg-[#131722] text-xs font-mono uppercase text-white cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => togglePublish(entry)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-mono uppercase cursor-pointer ${
                    isPublished
                      ? 'border-amber-700/60 text-amber-300 hover:bg-amber-950/30'
                      : 'border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/30'
                  }`}
                >
                  {isPublished ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      Publish
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(entry)}
                  aria-label={`Delete result ${entry.tournamentName || entry.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-800/60 hover:border-red-500 text-xs font-mono uppercase text-red-300 hover:bg-red-950/30 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          );
        })}

        {results.entries.length === 0 && (
          <div className="border border-slate-800 bg-[#0D0F14] p-10 text-center text-sm text-slate-400">
            No tournament results recorded yet. Click &quot;Add Tournament Result&quot; to publish
            your first tournament outcome.
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteConfirm)}
        variant="danger"
        title="Delete Result Entry Permanently"
        description={`Remove "${deleteConfirm?.tournamentName || deleteConfirm?.id}" from staging? Publishing updates will permanently remove this result from public/data/results.json.`}
        confirmLabel="Confirm Delete"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) deleteEntry(deleteConfirm);
        }}
      />
    </div>
  );
};
