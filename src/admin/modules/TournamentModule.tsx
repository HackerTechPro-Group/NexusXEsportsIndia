import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { RegistrationStatusBadge, TacticalBadge } from '../../components/common/StatusBadge';
import type {
  PerspectiveMode,
  RegistrationStatus,
  TournamentFormat,
  TournamentLifecycleStatus,
  TournamentRecord,
  TournamentsData,
} from '../../types/data';
import {
  validateGoogleFormUrl,
  validateImageAssetUrl,
  validateTournamentRecord,
} from '../../utils/validation';

export type TournamentListFilter = 'active' | 'draft' | 'archived' | 'all';

interface TournamentModuleProps {
  tournaments: TournamentsData;
  onChange: (next: TournamentsData) => void;
  onGenerateId?: (format: TournamentFormat, existingIds: string[]) => Promise<string>;
  activeFilter?: TournamentListFilter;
  activeFormat?: TournamentFormat | 'all';
  onFilterChange?: (filter: TournamentListFilter) => void;
  onFormatChange?: (format: TournamentFormat | 'all') => void;
}

const INPUT_CLASS =
  'w-full rounded-xl bg-[#07090E] border border-slate-700/80 focus:border-[#E11D2E] focus:outline-none px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition-colors';
const LABEL_CLASS = 'block text-xs font-medium text-slate-300 mb-1.5';

const MAP_PRESETS = ['Erangel', 'Miramar', 'Livik', 'Sanhok', 'Erangel / Miramar'];
const BANNER_PRESETS = [
  { label: 'Solo Tactical', value: './images/solo-banner.jpg' },
  { label: 'Duo Tactical', value: './images/duo-banner.jpg' },
  { label: 'Squad Tactical', value: './images/squad-banner.jpg' },
  { label: 'Arena Stage', value: './images/hero-arena.jpg' },
  { label: 'Erangel Night', value: './images/map-erangel.jpg' },
  { label: 'Final Circle', value: './images/gallery-clutch.jpg' },
  { label: 'Trophy Arena', value: './images/news-season.jpg' },
];

const DEFAULT_TEAM_SIZE_BY_FORMAT: Record<TournamentFormat, string> = {
  Solo: '1 Player (Solo)',
  Duo: '2 Players (Duo)',
  Squad: '4 Players + Optional 1 Sub',
};

const DEFAULT_BANNER_BY_FORMAT: Record<TournamentFormat, string> = {
  Solo: './images/solo-banner.jpg',
  Duo: './images/duo-banner.jpg',
  Squad: './images/squad-banner.jpg',
};

const LIFECYCLE_OPTIONS: { value: TournamentLifecycleStatus; label: string }[] = [
  { value: 'draft', label: 'Draft (Hidden)' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'registration_open', label: 'Registration Open' },
  { value: 'registration_closed', label: 'Registration Closed' },
  { value: 'live', label: 'Live Now' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'archived', label: 'Archived (Hidden)' },
];

function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function makeUniqueSlug(baseTitle: string, existingSlugs: string[]): string {
  const base = slugifyTitle(baseTitle);
  if (!base) return '';
  if (!existingSlugs.includes(base)) return base;
  let seq = 2;
  while (existingSlugs.includes(`${base}-${seq}`)) {
    seq += 1;
  }
  return `${base}-${seq}`;
}

function buildFallbackId(format: TournamentFormat, existingIds: string[]): string {
  const prefix =
    format === 'Solo' ? 'NX-SOLO-' : format === 'Duo' ? 'NX-DUO-' : 'NX-SQUAD-';
  const taken = new Set(existingIds.map((id) => id.trim().toUpperCase()));
  let seq = 1;
  while (taken.has(`${prefix}${String(seq).padStart(3, '0')}`)) {
    seq += 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function makeTemplateTournament(
  format: TournamentFormat,
  existingIds: string[],
  existingSlugs: string[]
): TournamentRecord {
  const candidateId = buildFallbackId(format, existingIds);
  let seq = existingSlugs.length + 1;
  let candidateSlug = `${format.toLowerCase()}-tournament-${seq}`;
  while (existingSlugs.includes(candidateSlug)) {
    seq += 1;
    candidateSlug = `${format.toLowerCase()}-tournament-${seq}`;
  }

  const defaultBanner = DEFAULT_BANNER_BY_FORMAT[format];

  return {
    id: candidateId,
    slug: candidateSlug,
    title: '',
    game: 'BGMI',
    format,
    mode: 'TPP',
    season: '',
    matchFormat: '',
    map: '',
    banner: defaultBanner,
    thumbnail: defaultBanner,
    description: '',
    matchesCount: 1,
    teamSize: DEFAULT_TEAM_SIZE_BY_FORMAT[format],
    eligibleDevices: 'Mobile Smartphones Only (Android / iOS)',
    status: 'draft',
    published: false,
    featured: false,
    schedule: {
      date: '',
      reportingTime: '',
      startTime: '',
      timezone: 'Asia/Kolkata',
    },
    prizes: {
      entryFee: 'Free Entry',
      totalPrizePool: '',
      first: '',
      second: '',
      third: '',
      other: '',
    },
    registration: {
      status: 'closed',
      formUrl: '',
      buttonText: 'Register Now',
      closingMessage: '',
      openingDate: '',
      closingDate: '',
      whatsappCommunityUrl: '',
      instructions: '',
      additionalInstructions: '',
    },
    rules: [],
    eligibility: [],
  };
}

export const TournamentModule: React.FC<TournamentModuleProps> = ({
  tournaments,
  onChange,
  onGenerateId,
  activeFilter,
  activeFormat,
  onFilterChange,
  onFormatChange,
}) => {
  const [internalFilter, setInternalFilter] = useState<TournamentListFilter>('all');
  const [internalFormat, setInternalFormat] = useState<TournamentFormat | 'all'>('all');
  const filter = activeFilter ?? internalFilter;
  const formatFilter = activeFormat ?? internalFormat;
  const setFilter = (next: TournamentListFilter) => {
    setInternalFilter(next);
    onFilterChange?.(next);
  };
  const setFormatFilter = (next: TournamentFormat | 'all') => {
    setInternalFormat(next);
    onFormatChange?.(next);
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draft, setDraft] = useState<TournamentRecord | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');
  const [newEligibility, setNewEligibility] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState<TournamentRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TournamentRecord | null>(null);
  const [idBusy, setIdBusy] = useState(false);

  const filteredList = useMemo(() => {
    return tournaments.tournaments.filter((t) => {
      if (formatFilter !== 'all' && t.format !== formatFilter) return false;
      if (filter === 'active') return t.status !== 'archived' && t.status !== 'draft';
      if (filter === 'draft') return t.status === 'draft';
      if (filter === 'archived') return t.status === 'archived';
      return true;
    });
  }, [tournaments.tournaments, filter, formatFilter]);

  const startCreate = (format: TournamentFormat) => {
    const ids = tournaments.tournaments.map((t) => t.id);
    const slugs = tournaments.tournaments.map((t) => t.slug);
    const created = makeTemplateTournament(format, ids, slugs);
    setDraft(created);
    setEditingId(null);
    setIsCreatingNew(true);
    setSlugTouched(false);
    setErrors([]);
    setNotice(null);

    if (onGenerateId) {
      const initialId = created.id;
      void onGenerateId(format, ids)
        .then((serverId) => {
          if (serverId) {
            setDraft((prev) =>
              prev && prev.id === initialId ? { ...prev, id: serverId } : prev
            );
          }
        })
        .catch(() => {
          // Keep deterministic sequential fallback ID
        });
    }
  };

  const handleManualGenerateId = async () => {
    if (!draft) return;
    const existingOtherIds = tournaments.tournaments
      .filter((t) => (isCreatingNew ? true : t.id !== editingId))
      .map((t) => t.id);
    setIdBusy(true);
    try {
      const nextId = onGenerateId
        ? await onGenerateId(draft.format, existingOtherIds)
        : buildFallbackId(draft.format, existingOtherIds);
      setDraft((prev) => (prev ? { ...prev, id: nextId } : prev));
    } finally {
      setIdBusy(false);
    }
  };

  const startEdit = (record: TournamentRecord) => {
    setDraft(structuredClone(record));
    setEditingId(record.id);
    setIsCreatingNew(false);
    setSlugTouched(true);
    setErrors([]);
    setNotice(null);
  };

  const duplicateRecord = (source: TournamentRecord) => {
    const ids = tournaments.tournaments.map((t) => t.id);
    const slugs = tournaments.tournaments.map((t) => t.slug);
    let idx = 1;
    let newId = `${source.id}-COPY-${idx}`;
    while (ids.includes(newId)) {
      idx += 1;
      newId = `${source.id}-COPY-${idx}`;
    }
    let newSlug = `${source.slug}-copy-${idx}`;
    while (slugs.includes(newSlug)) {
      idx += 1;
      newSlug = `${source.slug}-copy-${idx}`;
    }

    const cloned: TournamentRecord = {
      ...structuredClone(source),
      id: newId,
      slug: newSlug,
      title: `${source.title} (Copy)`,
      status: 'draft',
      published: false,
      featured: false,
      registration: {
        ...source.registration,
        status: 'closed',
      },
    };

    const nextList = [...tournaments.tournaments, cloned];
    onChange({
      ...tournaments,
      lastUpdated: new Date().toISOString().slice(0, 10),
      tournaments: nextList,
    });
    setFilter('draft');
    startEdit(cloned);
    setNotice(`Duplicated "${source.title}" into draft "${cloned.title}". Remember to publish updates.`);
  };

  const toggleArchive = (record: TournamentRecord) => {
    const isCurrentlyArchived = record.status === 'archived';
    const nextStatus: TournamentLifecycleStatus = isCurrentlyArchived ? 'draft' : 'archived';
    const nextList = tournaments.tournaments.map((t) =>
      t.id === record.id
        ? {
            ...t,
            status: nextStatus,
            published: false,
            featured: isCurrentlyArchived ? t.featured : false,
            registration: isCurrentlyArchived
              ? t.registration
              : { ...t.registration, status: 'closed' as RegistrationStatus },
          }
        : t
    );

    onChange({
      ...tournaments,
      lastUpdated: new Date().toISOString().slice(0, 10),
      tournaments: nextList,
    });
    setArchiveConfirm(null);
    if (draft?.id === record.id) {
      setDraft(null);
      setEditingId(null);
    }
    setNotice(
      isCurrentlyArchived
        ? `Restored "${record.title}" as Draft.`
        : `Archived "${record.title}" (hidden from public website & registration closed).`
    );
  };

  const togglePublish = (record: TournamentRecord) => {
    const isCurrentlyPublished =
      record.status !== 'draft' && record.status !== 'archived' && record.published !== false;
    if (isCurrentlyPublished) {
      const nextList = tournaments.tournaments.map((t) =>
        t.id === record.id
          ? {
              ...t,
              status: 'draft' as TournamentLifecycleStatus,
              published: false,
              featured: false,
            }
          : t
      );
      onChange({
        ...tournaments,
        lastUpdated: new Date().toISOString().slice(0, 10),
        tournaments: nextList,
      });
      setFilter('draft');
      setNotice(`Unpublished "${record.title}" to Draft (hidden from public site).`);
      return;
    }

    const candidate: TournamentRecord = {
      ...record,
      teamSize: record.teamSize.trim() || DEFAULT_TEAM_SIZE_BY_FORMAT[record.format],
      eligibleDevices:
        record.eligibleDevices.trim() || 'Mobile Smartphones Only (Android / iOS)',
      status: record.status === 'draft' || record.status === 'archived' ? 'upcoming' : record.status,
      published: true,
    };
    const otherIds = tournaments.tournaments.filter((t) => t.id !== record.id).map((t) => t.id);
    const publishErrors = validateTournamentRecord(candidate, otherIds);
    if (publishErrors.length > 0) {
      setDraft(structuredClone(candidate));
      setEditingId(record.id);
      setIsCreatingNew(false);
      setSlugTouched(true);
      setErrors(publishErrors);
      setNotice(null);
      return;
    }

    const nextList = tournaments.tournaments.map((t) => (t.id === record.id ? candidate : t));
    onChange({
      ...tournaments,
      lastUpdated: new Date().toISOString().slice(0, 10),
      tournaments: nextList,
    });
    setFilter('active');
    setNotice(`Marked "${candidate.title}" as Published. Click "Publish Updates" to commit to GitHub.`);
  };

  const deleteRecord = (record: TournamentRecord) => {
    const nextList = tournaments.tournaments.filter((t) => t.id !== record.id);
    onChange({
      ...tournaments,
      lastUpdated: new Date().toISOString().slice(0, 10),
      tournaments: nextList,
    });
    setDeleteConfirm(null);
    if (draft?.id === record.id || editingId === record.id) {
      setDraft(null);
      setEditingId(null);
      setIsCreatingNew(false);
    }
    setNotice(`Deleted tournament "${record.title}" from staging. Click "Publish Updates" to commit.`);
  };

  const handleTitleChange = (value: string) => {
    if (!draft) return;
    const otherSlugs = tournaments.tournaments
      .filter((t) => (isCreatingNew ? true : t.id !== editingId))
      .map((t) => t.slug);
    const autoSlug = !slugTouched
      ? makeUniqueSlug(value, otherSlugs) || draft.slug
      : draft.slug;
    setDraft({ ...draft, title: value, slug: autoSlug });
  };

  const handleFormatChange = (nextFormat: TournamentFormat) => {
    if (!draft) return;
    const prevDefaults = Object.values(DEFAULT_TEAM_SIZE_BY_FORMAT);
    const prevBanners = Object.values(DEFAULT_BANNER_BY_FORMAT);
    const shouldSwapTeamSize = !draft.teamSize.trim() || prevDefaults.includes(draft.teamSize);
    const shouldSwapBanner = !draft.banner.trim() || prevBanners.includes(draft.banner);
    const nextBanner = shouldSwapBanner ? DEFAULT_BANNER_BY_FORMAT[nextFormat] : draft.banner;

    setDraft({
      ...draft,
      format: nextFormat,
      teamSize: shouldSwapTeamSize ? DEFAULT_TEAM_SIZE_BY_FORMAT[nextFormat] : draft.teamSize,
      banner: nextBanner,
      thumbnail: nextBanner,
    });
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;

    const prepared: TournamentRecord = {
      ...draft,
      id: draft.id.trim() || buildFallbackId(draft.format, []),
      slug:
        draft.slug.trim() ||
        makeUniqueSlug(
          draft.title,
          tournaments.tournaments
            .filter((t) => (isCreatingNew ? true : t.id !== editingId))
            .map((t) => t.slug)
        ) ||
        `${draft.format.toLowerCase()}-event`,
      game: draft.game.trim() || 'BGMI',
      teamSize: draft.teamSize.trim() || DEFAULT_TEAM_SIZE_BY_FORMAT[draft.format],
      eligibleDevices:
        draft.eligibleDevices.trim() || 'Mobile Smartphones Only (Android / iOS)',
      schedule: {
        ...draft.schedule,
        timezone: draft.schedule.timezone.trim() || 'Asia/Kolkata',
      },
      prizes: {
        ...draft.prizes,
        entryFee: draft.prizes.entryFee.trim() || 'Free Entry',
      },
    };

    const existingOtherIds = tournaments.tournaments
      .filter((t) => (isCreatingNew ? true : t.id !== editingId))
      .map((t) => t.id);

    const validationErrors = validateTournamentRecord(prepared, existingOtherIds);
    const existingOtherSlugs = tournaments.tournaments
      .filter((t) => (isCreatingNew ? true : t.id !== editingId))
      .map((t) => t.slug);
    if (existingOtherSlugs.includes(prepared.slug.trim())) {
      validationErrors.push(`Duplicate slug "${prepared.slug.trim()}" already exists.`);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const isLiveLifecycle = prepared.status !== 'draft' && prepared.status !== 'archived';
    const finalized: TournamentRecord = {
      ...prepared,
      title: prepared.title.trim(),
      season: prepared.season?.trim() || '',
      matchFormat: prepared.matchFormat?.trim() || '',
      map: prepared.map.trim(),
      description: prepared.description.trim(),
      published: isLiveLifecycle ? prepared.published !== false : false,
      schedule: {
        date: prepared.schedule.date.trim(),
        reportingTime: prepared.schedule.reportingTime.trim(),
        startTime: prepared.schedule.startTime.trim(),
        timezone: prepared.schedule.timezone.trim() || 'Asia/Kolkata',
      },
      prizes: {
        entryFee: prepared.prizes.entryFee.trim() || 'Free Entry',
        totalPrizePool: prepared.prizes.totalPrizePool.trim(),
        first: prepared.prizes.first.trim(),
        second: prepared.prizes.second.trim(),
        third: prepared.prizes.third.trim(),
        other: prepared.prizes.other.trim(),
      },
      registration: {
        ...prepared.registration,
        formUrl: prepared.registration.formUrl.trim(),
        closingMessage: prepared.registration.closingMessage?.trim() || '',
        openingDate: prepared.registration.openingDate.trim(),
        closingDate: prepared.registration.closingDate.trim(),
        instructions: prepared.registration.instructions.trim(),
        additionalInstructions: prepared.registration.additionalInstructions?.trim() || '',
      },
    };

    const nextList = isCreatingNew
      ? [...tournaments.tournaments, finalized]
      : tournaments.tournaments.map((t) => (t.id === editingId ? finalized : t));

    onChange({
      ...tournaments,
      lastUpdated: today,
      tournaments: nextList,
    });
    setFilter(
      finalized.status === 'draft' ? 'draft' : finalized.status === 'archived' ? 'archived' : 'active'
    );
    setDraft(null);
    setEditingId(null);
    setIsCreatingNew(false);
    setErrors([]);
    setNotice(`Saved tournament "${finalized.title}" to staging. Click "Publish Updates" when ready.`);
  };

  return (
    <div className="space-y-6">
      {/* Clean Single-Row Studio Header */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase tracking-tight">
            Tournaments
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Create and manage Solo, Duo &amp; Squad events with essential details only.
          </p>
        </div>

        <div
          className="inline-flex items-center rounded-xl border border-white/10 bg-[#07090E] p-1 gap-1 shrink-0 self-start md:self-auto"
          role="group"
          aria-label="Create new tournament"
        >
          <button
            type="button"
            aria-label="New Solo Tournament"
            onClick={() => startCreate('Solo')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Solo
          </button>
          <button
            type="button"
            aria-label="New Duo Tournament"
            onClick={() => startCreate('Duo')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg hover:bg-white/[0.08] text-slate-200 hover:text-white font-display font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
            Duo
          </button>
          <button
            type="button"
            aria-label="New Squad Tournament"
            onClick={() => startCreate('Squad')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg hover:bg-white/[0.08] text-slate-200 hover:text-white font-display font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
            Squad
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-xl flex items-center justify-between gap-3 border border-emerald-500/35 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-200 font-mono"
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

      {/* Streamlined Essential-Only Tournament Builder */}
      {draft && (
        <form
          noValidate
          autoComplete="off"
          onSubmit={handleSaveDraft}
          className="rounded-2xl border border-[#E11D2E]/45 bg-[#0B0E15] p-5 sm:p-6 space-y-6 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
        >
          {/* Form Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#FF2D3F]">
                  {isCreatingNew ? 'New Tournament' : `Editing ${draft.id}`}
                </span>
                <span className="font-mono text-[11px] text-slate-500 truncate">
                  {draft.id} • /{draft.slug || 'auto-slug'}
                </span>
              </div>
              <h3 className="font-display text-xl font-bold text-white uppercase truncate">
                {draft.title || 'Untitled Tournament'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
                setIsCreatingNew(false);
                setErrors([]);
              }}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-slate-700 hover:border-white text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel Edit
            </button>
          </div>

          {errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-red-500/60 bg-red-950/40 p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-red-200 font-bold">
                <AlertCircle className="h-4 w-4 text-[#E11D2E]" aria-hidden="true" />
                Please Check ({errors.length})
              </div>
              <ul className="list-disc pl-5 text-xs text-red-200 space-y-0.5">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 1. Core Event Identity */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-6">
                <label htmlFor="tour-title" className={LABEL_CLASS}>
                  Tournament Name <span className="text-[#FF2D3F]">*</span>
                </label>
                <input
                  id="tour-title"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g., NexusX Sunday Solo Cup"
                  className={INPUT_CLASS}
                  value={draft.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                />
              </div>

              <div className="lg:col-span-3">
                <span className={LABEL_CLASS}>Format</span>
                <div
                  role="group"
                  aria-label="Category / Format"
                  className="grid grid-cols-3 rounded-xl border border-slate-700/80 bg-[#07090E] p-1 gap-1"
                >
                  {(['Solo', 'Duo', 'Squad'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handleFormatChange(fmt)}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        draft.format === fmt
                          ? 'bg-[#E11D2E] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-3">
                <label htmlFor="tour-status" className={LABEL_CLASS}>
                  Status
                </label>
                <select
                  id="tour-status"
                  className={INPUT_CLASS}
                  value={draft.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as TournamentLifecycleStatus;
                    setDraft({
                      ...draft,
                      status: nextStatus,
                      published: nextStatus !== 'draft' && nextStatus !== 'archived',
                    });
                  }}
                >
                  {LIFECYCLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-6">
                <label htmlFor="tour-map" className={LABEL_CLASS}>
                  Map <span className="text-slate-500 font-normal">(required to publish)</span>
                </label>
                <input
                  id="tour-map"
                  type="text"
                  autoComplete="off"
                  list="nexusx-map-presets"
                  placeholder="Erangel / Miramar"
                  className={INPUT_CLASS}
                  value={draft.map}
                  onChange={(e) => setDraft({ ...draft, map: e.target.value })}
                />
                <datalist id="nexusx-map-presets">
                  {MAP_PRESETS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {MAP_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDraft({ ...draft, map: preset })}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors cursor-pointer ${
                        draft.map === preset
                          ? 'border-[#E11D2E]/80 bg-[#E11D2E]/15 text-red-200'
                          : 'border-slate-800 bg-[#07090E] text-slate-400 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-3">
                <span className={LABEL_CLASS}>Perspective Mode</span>
                <div
                  role="group"
                  aria-label="Perspective Mode"
                  className="grid grid-cols-2 rounded-xl border border-slate-700/80 bg-[#07090E] p-1 gap-1"
                >
                  {(['TPP', 'FPP'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDraft({ ...draft, mode: mode as PerspectiveMode })}
                      className={`py-2 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                        draft.mode === mode
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-3">
                <label htmlFor="tour-date" className={LABEL_CLASS}>
                  Match Date
                </label>
                <input
                  id="tour-date"
                  type="text"
                  autoComplete="off"
                  placeholder="YYYY-MM-DD or TBA"
                  className={INPUT_CLASS}
                  value={draft.schedule.date}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule: { ...draft.schedule, date: e.target.value } })
                  }
                />
              </div>
            </div>
          </div>

          {/* 2. Essential Prizes, Time & Registration Link */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.08]">
            <div>
              <label htmlFor="tour-start" className={LABEL_CLASS}>
                Match Start Time (IST)
              </label>
              <input
                id="tour-start"
                type="text"
                autoComplete="off"
                placeholder="e.g., 20:00"
                className={INPUT_CLASS}
                value={draft.schedule.startTime}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, startTime: e.target.value },
                  })
                }
              />
            </div>

            <div>
              <label htmlFor="tour-pool" className={LABEL_CLASS}>
                Total Prize Pool
              </label>
              <input
                id="tour-pool"
                type="text"
                autoComplete="off"
                placeholder="e.g., INR 10,000"
                className={INPUT_CLASS}
                value={draft.prizes.totalPrizePool}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    prizes: { ...draft.prizes, totalPrizePool: e.target.value },
                  })
                }
              />
            </div>

            <div>
              <label htmlFor="tour-fee" className={LABEL_CLASS}>
                Entry Fee
              </label>
              <input
                id="tour-fee"
                type="text"
                autoComplete="off"
                placeholder="Free Entry or INR 50"
                className={INPUT_CLASS}
                value={draft.prizes.entryFee}
                onChange={(e) =>
                  setDraft({ ...draft, prizes: { ...draft.prizes, entryFee: e.target.value } })
                }
              />
            </div>

            <div>
              <label htmlFor="tour-reg-status" className={LABEL_CLASS}>
                Registration Status
              </label>
              <select
                id="tour-reg-status"
                className={INPUT_CLASS}
                value={draft.registration.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    registration: {
                      ...draft.registration,
                      status: e.target.value as RegistrationStatus,
                    },
                  })
                }
              >
                <option value="open">Open</option>
                <option value="full">Full (Slots Filled)</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label htmlFor="tour-reg-url" className={LABEL_CLASS}>
                Google Form Registration Link
              </label>
              <input
                id="tour-reg-url"
                type="url"
                autoComplete="off"
                className={INPUT_CLASS}
                value={draft.registration.formUrl}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    registration: { ...draft.registration, formUrl: e.target.value },
                  })
                }
                placeholder="https://forms.gle/... or https://docs.google.com/forms/..."
              />
              {draft.registration.formUrl.trim() && (
                <p
                  className={`mt-1.5 font-mono text-[11px] ${
                    validateGoogleFormUrl(draft.registration.formUrl, false).valid
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  {validateGoogleFormUrl(draft.registration.formUrl, false).valid
                    ? 'Valid Google Forms HTTPS URL'
                    : validateGoogleFormUrl(draft.registration.formUrl, false).error}
                </p>
              )}
            </div>
          </div>

          {/* 3. Description & Visual Banner */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 border-t border-white/[0.08]">
            <div className="lg:col-span-7 space-y-3">
              <div>
                <label htmlFor="tour-desc" className={LABEL_CLASS}>
                  Tournament Description{' '}
                  <span className="text-slate-500 font-normal">(required to publish)</span>
                </label>
                <textarea
                  id="tour-desc"
                  rows={3}
                  autoComplete="off"
                  placeholder="Write a crisp 1–2 line summary about matches, format, and verification..."
                  className={INPUT_CLASS}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      draft.published !== false && draft.status !== 'draft' && draft.status !== 'archived'
                    }
                    disabled={draft.status === 'draft' || draft.status === 'archived'}
                    onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                    className="accent-[#E11D2E] h-4 w-4 rounded"
                  />
                  Published to Public Website
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
                    className="accent-[#E11D2E] h-4 w-4 rounded"
                  />
                  Feature on Home Page
                </label>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-2.5">
              <span className={LABEL_CLASS}>Cover Banner</span>
              <div className="grid grid-cols-3 gap-2">
                {BANNER_PRESETS.map((preset) => {
                  const selected = draft.banner === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, banner: preset.value, thumbnail: preset.value })
                      }
                      className={`group rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-[#E11D2E] ring-2 ring-[#E11D2E]/35'
                          : 'border-slate-800 hover:border-slate-500'
                      }`}
                    >
                      <div className="h-14 w-full bg-[#07090E] overflow-hidden">
                        <img
                          src={preset.value}
                          alt={preset.label}
                          className="h-full w-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                      <div className="px-2 py-1 bg-[#080A0E] font-mono text-[10px] text-slate-300 truncate">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>
              <input
                id="tour-banner"
                type="text"
                autoComplete="off"
                aria-label="Custom Banner Image Path or HTTPS URL"
                placeholder="./images/solo-banner.jpg or https://..."
                className="w-full rounded-xl bg-[#07090E] border border-slate-800 focus:border-[#22C55E] focus:outline-none px-3 py-1.5 text-xs font-mono text-slate-300"
                value={draft.banner}
                onChange={(e) =>
                  setDraft({ ...draft, banner: e.target.value, thumbnail: e.target.value })
                }
              />
            </div>
          </div>

          {/* 4. Collapsed Optional / Advanced Details (Hidden by default!) */}
          <details className="group rounded-xl border border-white/[0.08] bg-[#080A0E]/80 overflow-hidden">
            <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none select-none hover:bg-white/[0.03] transition-colors">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-300">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#E11D2E]" aria-hidden="true" />
                Optional &amp; Advanced Fields (ID, Slug, Prize Split, Times &amp; Rules)
              </span>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] text-slate-500">
                <span>
                  {draft.id} • {draft.rules.length} Rules
                </span>
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </span>
            </summary>

            <div className="p-4 pt-2 border-t border-white/[0.06] space-y-5">
              {/* IDs & Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="tour-id" className="text-xs font-medium text-slate-300">
                      Tournament ID
                    </label>
                    <button
                      type="button"
                      disabled={idBusy}
                      onClick={() => void handleManualGenerateId()}
                      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-[#FF2D3F] hover:underline cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      {idBusy ? 'Generating...' : 'Generate ID'}
                    </button>
                  </div>
                  <input
                    id="tour-id"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.id}
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="tour-slug" className="text-xs font-medium text-slate-300">
                      URL Slug
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setSlugTouched(true);
                        setDraft({ ...draft, slug: slugifyTitle(draft.title) || draft.slug });
                      }}
                      className="font-mono text-[10px] uppercase text-[#FF2D3F] hover:underline cursor-pointer"
                    >
                      Auto-Generate
                    </button>
                  </div>
                  <input
                    id="tour-slug"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setDraft({ ...draft, slug: e.target.value });
                    }}
                  />
                </div>

                <div>
                  <label htmlFor="tour-game" className={LABEL_CLASS}>
                    Game
                  </label>
                  <input
                    id="tour-game"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.game}
                    onChange={(e) => setDraft({ ...draft, game: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="tour-season" className={LABEL_CLASS}>
                    Season / Series
                  </label>
                  <input
                    id="tour-season"
                    type="text"
                    placeholder="e.g., Season 1"
                    className={INPUT_CLASS}
                    value={draft.season ?? ''}
                    onChange={(e) => setDraft({ ...draft, season: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="tour-match-format" className={LABEL_CLASS}>
                    Match Format
                  </label>
                  <input
                    id="tour-match-format"
                    type="text"
                    placeholder="e.g., Classic 4-Match Lobby"
                    className={INPUT_CLASS}
                    value={draft.matchFormat ?? ''}
                    onChange={(e) => setDraft({ ...draft, matchFormat: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="tour-matches" className={LABEL_CLASS}>
                    Match Count
                  </label>
                  <input
                    id="tour-matches"
                    type="number"
                    min={1}
                    className={INPUT_CLASS}
                    value={draft.matchesCount}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        matchesCount: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="tour-team-size" className={LABEL_CLASS}>
                    Team / Player Format
                  </label>
                  <input
                    id="tour-team-size"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.teamSize}
                    onChange={(e) => setDraft({ ...draft, teamSize: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="tour-devices" className={LABEL_CLASS}>
                    Eligible Devices
                  </label>
                  <input
                    id="tour-devices"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.eligibleDevices}
                    onChange={(e) => setDraft({ ...draft, eligibleDevices: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="tour-report" className={LABEL_CLASS}>
                    Reporting Time
                  </label>
                  <input
                    id="tour-report"
                    type="text"
                    placeholder="e.g., 19:30"
                    className={INPUT_CLASS}
                    value={draft.schedule.reportingTime}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        schedule: { ...draft.schedule, reportingTime: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="tour-1st" className={LABEL_CLASS}>
                    1st Place Prize
                  </label>
                  <input
                    id="tour-1st"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.prizes.first}
                    onChange={(e) =>
                      setDraft({ ...draft, prizes: { ...draft.prizes, first: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="tour-2nd" className={LABEL_CLASS}>
                    2nd Place Prize
                  </label>
                  <input
                    id="tour-2nd"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.prizes.second}
                    onChange={(e) =>
                      setDraft({ ...draft, prizes: { ...draft.prizes, second: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="tour-3rd" className={LABEL_CLASS}>
                    3rd Place Prize
                  </label>
                  <input
                    id="tour-3rd"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.prizes.third}
                    onChange={(e) =>
                      setDraft({ ...draft, prizes: { ...draft.prizes, third: e.target.value } })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="tour-reg-closing" className={LABEL_CLASS}>
                    Registration Closing Date
                  </label>
                  <input
                    id="tour-reg-closing"
                    type="text"
                    placeholder="YYYY-MM-DD (or blank)"
                    className={INPUT_CLASS}
                    value={draft.registration.closingDate}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        registration: { ...draft.registration, closingDate: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="tour-reg-closing-msg" className={LABEL_CLASS}>
                    Closing / Full Notice Message
                  </label>
                  <input
                    id="tour-reg-closing-msg"
                    type="text"
                    placeholder="e.g., Slots filled for Season 1."
                    className={INPUT_CLASS}
                    value={draft.registration.closingMessage ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        registration: { ...draft.registration, closingMessage: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="tour-tz" className={LABEL_CLASS}>
                    Timezone
                  </label>
                  <input
                    id="tour-tz"
                    type="text"
                    className={INPUT_CLASS}
                    value={draft.schedule.timezone}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        schedule: { ...draft.schedule, timezone: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tour-reg-instructions" className={LABEL_CLASS}>
                    Registration Instructions
                  </label>
                  <input
                    id="tour-reg-instructions"
                    type="text"
                    placeholder="How competitors receive room ID / password..."
                    className={INPUT_CLASS}
                    value={draft.registration.instructions}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        registration: { ...draft.registration, instructions: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="tour-additional-instructions" className={LABEL_CLASS}>
                    Additional Competitor Instructions
                  </label>
                  <input
                    id="tour-additional-instructions"
                    type="text"
                    placeholder="Check-in window or POV requirements..."
                    className={INPUT_CLASS}
                    value={draft.registration.additionalInstructions ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        registration: {
                          ...draft.registration,
                          additionalInstructions: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>

              {/* Rules & Eligibility Builders */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <span className={LABEL_CLASS}>Tournament Rules ({draft.rules.length})</span>
                  <ul className="space-y-1.5">
                    {draft.rules.map((rule, idx) => (
                      <li
                        key={`${idx}-${rule.slice(0, 12)}`}
                        className="flex items-center gap-2 rounded-lg bg-[#07090E] border border-slate-800 px-3 py-2 text-xs text-slate-200"
                      >
                        <span className="flex-1">{rule}</span>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            const copy = [...draft.rules];
                            [copy[idx], copy[idx - 1]] = [copy[idx - 1], copy[idx]];
                            setDraft({ ...draft, rules: copy });
                          }}
                          aria-label="Move rule up"
                          className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === draft.rules.length - 1}
                          onClick={() => {
                            const copy = [...draft.rules];
                            [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                            setDraft({ ...draft, rules: copy });
                          }}
                          aria-label="Move rule down"
                          className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== idx) })
                          }
                          aria-label="Delete rule"
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      placeholder="Add rule line..."
                      aria-label="New tournament rule"
                      className={INPUT_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newRule.trim();
                        if (!trimmed) return;
                        setDraft({ ...draft, rules: [...draft.rules, trimmed] });
                        setNewRule('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#131722] border border-slate-700 hover:border-white text-xs font-medium text-white cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className={LABEL_CLASS}>Eligibility ({draft.eligibility.length})</span>
                  <ul className="space-y-1.5">
                    {draft.eligibility.map((item, idx) => (
                      <li
                        key={`${idx}-${item.slice(0, 12)}`}
                        className="flex items-center gap-2 rounded-lg bg-[#07090E] border border-slate-800 px-3 py-2 text-xs text-slate-200"
                      >
                        <span className="flex-1">{item}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              eligibility: draft.eligibility.filter((_, i) => i !== idx),
                            })
                          }
                          aria-label="Delete eligibility criterion"
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newEligibility}
                      onChange={(e) => setNewEligibility(e.target.value)}
                      placeholder="Add eligibility rule..."
                      aria-label="New eligibility rule"
                      className={INPUT_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newEligibility.trim();
                        if (!trimmed) return;
                        setDraft({ ...draft, eligibility: [...draft.eligibility, trimmed] });
                        setNewEligibility('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#131722] border border-slate-700 hover:border-white text-xs font-medium text-white cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <div className="flex justify-end gap-3 border-t border-white/[0.08] pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Tournament Changes
            </button>
          </div>
        </form>
      )}

      {/* Filter & Format Pills */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tournament status filter">
          {(
            [
              { id: 'all', label: `All (${tournaments.tournaments.length})` },
              {
                id: 'active',
                label: `Published (${tournaments.tournaments.filter((t) => t.status !== 'archived' && t.status !== 'draft').length})`,
              },
              {
                id: 'draft',
                label: `Drafts (${tournaments.tournaments.filter((t) => t.status === 'draft').length})`,
              },
              {
                id: 'archived',
                label: `Archived (${tournaments.tournaments.filter((t) => t.status === 'archived').length})`,
              },
            ] as { id: TournamentListFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#22C55E] border-[#22C55E] text-[#031107] font-bold shadow-[0_4px_14px_rgba(34,197,94,0.28)]'
                  : 'bg-[#0B0E15] border-white/[0.08] text-slate-300 hover:text-white hover:border-emerald-500/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tournament format filter">
          {(['all', 'Solo', 'Duo', 'Squad'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setFormatFilter(fmt)}
              className={`px-3 py-1.5 rounded-xl font-mono text-[11px] uppercase tracking-wider border transition-all duration-150 cursor-pointer ${
                formatFilter === fmt
                  ? 'border-[#22C55E]/80 bg-[#22C55E]/15 text-[#16FF6E] font-semibold'
                  : 'border-white/[0.08] bg-[#07090E] text-slate-400 hover:text-white hover:border-emerald-500/40'
              }`}
            >
              {fmt === 'all' ? 'All Modes' : fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Tournament Cards List */}
      <div className="space-y-3">
        {filteredList.map((item) => {
          const isPublished =
            item.status !== 'draft' && item.status !== 'archived' && item.published !== false;
          const thumbCheck = validateImageAssetUrl(item.banner, 'Banner');
          const thumbSrc =
            thumbCheck.valid && thumbCheck.normalized ? thumbCheck.normalized : './images/hero-arena.jpg';

          return (
            <article
              key={item.id}
              className="rounded-2xl border border-white/[0.08] hover:border-white/20 bg-[#0B0E15] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors"
            >
              <div className="flex items-start gap-4 min-w-0">
                <img
                  src={thumbSrc}
                  alt=""
                  className="hidden sm:block h-16 w-24 rounded-xl object-cover border border-white/10 shrink-0"
                />
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TacticalBadge variant="crimson">{item.format}</TacticalBadge>
                    <TacticalBadge variant="silver">{item.mode}</TacticalBadge>
                    <TacticalBadge variant="silver">{item.status.replace(/_/g, ' ')}</TacticalBadge>
                    <TacticalBadge variant={isPublished ? 'emerald' : 'silver'}>
                      {isPublished ? 'Published' : 'Hidden'}
                    </TacticalBadge>
                    <RegistrationStatusBadge
                      status={item.registration.status}
                      lifecycleStatus={item.status}
                      hasValidUrl={validateGoogleFormUrl(item.registration.formUrl, false).valid}
                    />
                  </div>
                  <h3 className="font-display text-lg sm:text-xl font-bold text-white uppercase truncate">
                    {item.title}
                  </h3>
                  <p className="font-mono text-xs text-slate-400">
                    {item.id} • Map: {item.map || 'TBA'} • Date: {item.schedule.date || 'TBA'} •
                    Prize: {item.prizes.totalPrizePool || 'TBA'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 hover:border-white bg-[#121622] text-xs font-medium text-white cursor-pointer transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => duplicateRecord(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 hover:border-white bg-[#121622] text-xs font-medium text-slate-200 cursor-pointer transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Duplicate
                </button>
                {item.status !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => togglePublish(item)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                      isPublished
                        ? 'border-slate-700/80 text-slate-200 hover:border-white'
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
                )}
                <button
                  type="button"
                  onClick={() => setArchiveConfirm(item)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                    item.status === 'archived'
                      ? 'border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/30'
                      : 'border-amber-700/60 text-amber-300 hover:bg-amber-950/30'
                  }`}
                >
                  {item.status === 'archived' ? (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                      Restore Draft
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archive
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(item)}
                  aria-label={`Delete ${item.title || item.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-800/60 hover:border-red-500 text-xs font-medium text-red-300 hover:bg-red-950/30 cursor-pointer transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          );
        })}

        {filteredList.length === 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-10 text-center text-sm text-slate-400">
            No tournaments match this filter.
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(archiveConfirm)}
        title={archiveConfirm?.status === 'archived' ? 'Restore Tournament' : 'Archive Tournament'}
        description={
          archiveConfirm?.status === 'archived'
            ? `Restore "${archiveConfirm?.title}" back to Draft status? It will remain hidden from public pages until switched to Upcoming or Registration Open.`
            : `Archive "${archiveConfirm?.title}"? Archiving closes registration and hides the event from public tournament listings without deleting history.`
        }
        confirmLabel={archiveConfirm?.status === 'archived' ? 'Restore to Draft' : 'Confirm Archive'}
        variant={archiveConfirm?.status === 'archived' ? 'primary' : 'danger'}
        onCancel={() => setArchiveConfirm(null)}
        onConfirm={() => {
          if (archiveConfirm) toggleArchive(archiveConfirm);
        }}
      />

      <ConfirmModal
        open={Boolean(deleteConfirm)}
        variant="danger"
        title="Delete Tournament Permanently"
        description={`Remove "${deleteConfirm?.title || deleteConfirm?.id}" from staging? Once you click Publish Updates, this tournament will be permanently removed from public/data/tournaments.json. Consider Archiving if you only want to hide it.`}
        confirmLabel="Confirm Delete"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) deleteRecord(deleteConfirm);
        }}
      />
    </div>
  );
};
