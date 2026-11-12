import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Pin,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { TacticalBadge } from '../../components/common/StatusBadge';
import type { NewsArticle, NewsData } from '../../types/data';
import { validateImageAssetUrl, validateNewsArticle } from '../../utils/validation';

interface NewsModuleProps {
  news: NewsData;
  onChange: (next: NewsData) => void;
}

type NewsFilter = 'all' | 'published' | 'unpublished' | 'archived';

const INPUT_CLASS =
  'w-full rounded-xl bg-[#07090E] border border-slate-700/80 focus:border-[#E11D2E] focus:outline-none px-3.5 py-2 text-sm text-white placeholder:text-slate-500 transition-colors';
const LABEL_CLASS = 'block text-xs font-medium text-slate-300 mb-1.5';

const BANNER_PRESETS = [
  { label: 'Trophy Arena', value: './images/news-season.jpg' },
  { label: 'Arena Stage', value: './images/hero-arena.jpg' },
  { label: 'Solo Tactical', value: './images/solo-banner.jpg' },
  { label: 'Duo Tactical', value: './images/duo-banner.jpg' },
  { label: 'Squad Tactical', value: './images/squad-banner.jpg' },
  { label: 'Erangel Night', value: './images/map-erangel.jpg' },
  { label: 'Final Circle', value: './images/gallery-clutch.jpg' },
  { label: 'No Banner', value: '' },
];

function makeNewAnnouncement(existingIds: string[]): NewsArticle {
  let seq = existingIds.length + 1;
  let candidate = `news-${String(seq).padStart(3, '0')}`;
  while (existingIds.includes(candidate)) {
    seq += 1;
    candidate = `news-${String(seq).padStart(3, '0')}`;
  }
  return {
    id: candidate,
    title: '',
    description: '',
    publishedDate: new Date().toISOString().slice(0, 10),
    banner: '',
    externalUrl: '',
    category: 'Tournament',
    pinned: false,
    published: true,
    archived: false,
  };
}

export const NewsModule: React.FC<NewsModuleProps> = ({ news, onChange }) => {
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<NewsArticle | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<NewsArticle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<NewsArticle | null>(null);

  const deleteArticle = (article: NewsArticle) => {
    const today = new Date().toISOString().slice(0, 10);
    onChange({
      ...news,
      lastUpdated: today,
      entries: news.entries.filter((n) => n.id !== article.id),
    });
    setDeleteConfirm(null);
    if (draft?.id === article.id || editingId === article.id) {
      setDraft(null);
      setEditingId(null);
      setIsCreating(false);
    }
    setNotice(`Deleted announcement "${article.title}" from staging. Click "Publish Updates" to commit.`);
  };

  const visibleList = useMemo(() => {
    return news.entries.filter((item) => {
      const isPublished = item.published !== false;
      const isArchived = Boolean(item.archived);
      if (filter === 'archived') return isArchived;
      if (filter === 'published') return isPublished && !isArchived;
      if (filter === 'unpublished') return !isPublished && !isArchived;
      return true;
    });
  }, [news.entries, filter]);

  const startCreate = () => {
    setDraft(makeNewAnnouncement(news.entries.map((n) => n.id)));
    setEditingId(null);
    setIsCreating(true);
    setErrors([]);
    setNotice(null);
  };

  const startEdit = (article: NewsArticle) => {
    setDraft(
      structuredClone({
        ...article,
        published: article.published !== false,
        archived: Boolean(article.archived),
      })
    );
    setEditingId(article.id);
    setIsCreating(false);
    setErrors([]);
    setNotice(null);
  };

  const togglePublish = (article: NewsArticle) => {
    const nextPublished = article.published === false;
    const today = new Date().toISOString().slice(0, 10);
    onChange({
      ...news,
      lastUpdated: today,
      entries: news.entries.map((n) =>
        n.id === article.id ? { ...n, published: nextPublished } : n
      ),
    });
    setNotice(
      nextPublished
        ? `Announcement "${article.title}" marked Published.`
        : `Announcement "${article.title}" marked Unpublished.`
    );
  };

  const toggleArchive = (article: NewsArticle) => {
    const nextArchived = !article.archived;
    const today = new Date().toISOString().slice(0, 10);
    onChange({
      ...news,
      lastUpdated: today,
      entries: news.entries.map((n) =>
        n.id === article.id
          ? {
              ...n,
              archived: nextArchived,
              pinned: nextArchived ? false : n.pinned,
            }
          : n
      ),
    });
    setArchiveConfirm(null);
    setNotice(
      nextArchived
        ? `Archived announcement "${article.title}" (hidden from public News page).`
        : `Restored announcement "${article.title}" from archive.`
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;

    const cleaned: NewsArticle = {
      ...draft,
      id: draft.id.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      publishedDate: draft.publishedDate.trim(),
      banner: draft.banner.trim(),
      externalUrl: draft.externalUrl.trim(),
      published: draft.published !== false,
      archived: Boolean(draft.archived),
    };

    const validationErrors = validateNewsArticle(cleaned);
    const duplicate = news.entries.some(
      (n) => n.id === cleaned.id && (isCreating || n.id !== editingId)
    );
    if (duplicate) {
      validationErrors.push(`Duplicate announcement ID "${cleaned.id}".`);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const nextEntries = isCreating
      ? [cleaned, ...news.entries]
      : news.entries.map((n) => (n.id === editingId ? cleaned : n));

    onChange({
      ...news,
      lastUpdated: today,
      entries: nextEntries,
    });
    setDraft(null);
    setEditingId(null);
    setIsCreating(false);
    setErrors([]);
    setNotice(`Saved announcement "${cleaned.title}" to staging.`);
  };

  const bannerCheck = draft ? validateImageAssetUrl(draft.banner, 'Banner') : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase tracking-tight">
            News &amp; Updates
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Create, publish, pin, or archive community and tournament announcements.
          </p>
        </div>

        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Announcement
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
              {isCreating ? 'New Announcement' : `Editing ${draft.id}`}
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
                Announcement Validation Errors
              </div>
              <ul className="list-disc pl-5 text-xs text-red-200 space-y-0.5">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="news-id" className={LABEL_CLASS}>
                Announcement ID
              </label>
              <input
                id="news-id"
                type="text"
                className={INPUT_CLASS}
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="news-cat" className={LABEL_CLASS}>
                Category
              </label>
              <select
                id="news-cat"
                className={INPUT_CLASS}
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as NewsArticle['category'] })
                }
              >
                <option value="Tournament">Tournament</option>
                <option value="Rules">Rules</option>
                <option value="Community">Community</option>
                <option value="Updates">Updates</option>
              </select>
            </div>

            <div>
              <label htmlFor="news-date" className={LABEL_CLASS}>
                Published Date
              </label>
              <input
                id="news-date"
                type="text"
                className={INPUT_CLASS}
                value={draft.publishedDate}
                onChange={(e) => setDraft({ ...draft, publishedDate: e.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </div>

            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.published !== false}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                  className="accent-[#E11D2E] h-4 w-4"
                />
                Published
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                  className="accent-[#E11D2E] h-4 w-4"
                />
                Pin Announcement
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="news-title" className={LABEL_CLASS}>
              Headline / Title
            </label>
            <input
              id="news-title"
              type="text"
              className={INPUT_CLASS}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="news-desc" className={LABEL_CLASS}>
              Description
            </label>
            <textarea
              id="news-desc"
              rows={4}
              className={INPUT_CLASS}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-2">
              <label htmlFor="news-banner" className={LABEL_CLASS}>
                Featured Image Path or HTTPS URL
              </label>
              <input
                id="news-banner"
                type="text"
                className={INPUT_CLASS}
                value={draft.banner}
                onChange={(e) => setDraft({ ...draft, banner: e.target.value })}
                placeholder="./images/hero-arena.jpg"
              />
              <div className="flex flex-wrap gap-1.5">
                {BANNER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDraft({ ...draft, banner: preset.value })}
                    className="px-2 py-1 border border-slate-700 hover:border-white bg-[#080A0E] font-mono text-[10px] uppercase text-slate-300 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="news-ext-url" className={LABEL_CLASS}>
                External Reference URL (Optional HTTPS)
              </label>
              <input
                id="news-ext-url"
                type="url"
                className={INPUT_CLASS}
                value={draft.externalUrl}
                onChange={(e) => setDraft({ ...draft, externalUrl: e.target.value })}
                placeholder="https://..."
              />
              {bannerCheck?.valid && bannerCheck.normalized && (
                <div className="h-20 border border-slate-800 bg-[#080A0E] overflow-hidden">
                  <img
                    src={bannerCheck.normalized}
                    alt="Announcement preview"
                    className="h-full w-full object-cover opacity-80"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-800 pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Announcement
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Announcement status filter">
        {(
          [
            { id: 'all', label: `All (${news.entries.length})` },
            {
              id: 'published',
              label: `Published (${news.entries.filter((n) => n.published !== false && !n.archived).length})`,
            },
            {
              id: 'unpublished',
              label: `Unpublished (${news.entries.filter((n) => n.published === false && !n.archived).length})`,
            },
            {
              id: 'archived',
              label: `Archived (${news.entries.filter((n) => n.archived).length})`,
            },
          ] as { id: NewsFilter; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-xl px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider border cursor-pointer ${
              filter === tab.id
                ? 'bg-[#22C55E] border-[#22C55E] text-[#031107] font-bold'
                : 'bg-[#0D0F14] border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Announcements List */}
      <div className="space-y-3">
        {visibleList.map((article) => {
          const isPublished = article.published !== false;
          const isArchived = Boolean(article.archived);

          return (
            <article
              key={article.id}
              className="border border-slate-800 bg-[#0D0F14] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <TacticalBadge variant="crimson">{article.category}</TacticalBadge>
                  <TacticalBadge variant={isPublished && !isArchived ? 'emerald' : 'amber'}>
                    {isArchived ? 'Archived' : isPublished ? 'Published' : 'Unpublished'}
                  </TacticalBadge>
                  {article.pinned && !isArchived && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-[#E11D2E]">
                      <Pin className="h-3 w-3" aria-hidden="true" />
                      Pinned
                    </span>
                  )}
                  <span className="font-mono text-xs text-slate-400">{article.publishedDate}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white uppercase">
                  {article.title}
                </h3>
                <p className="text-sm text-slate-300 line-clamp-2">{article.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(article)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 hover:border-white bg-[#131722] text-xs font-mono uppercase text-white cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => togglePublish(article)}
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
                  onClick={() => setArchiveConfirm(article)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-mono uppercase cursor-pointer ${
                    isArchived
                      ? 'border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/30'
                      : 'border-amber-700/60 text-amber-300 hover:bg-amber-950/30'
                  }`}
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                      Restore
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
                  onClick={() => setDeleteConfirm(article)}
                  aria-label={`Delete announcement ${article.title || article.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-800/60 hover:border-red-500 text-xs font-mono uppercase text-red-300 hover:bg-red-950/30 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          );
        })}

        {visibleList.length === 0 && (
          <div className="border border-slate-800 bg-[#0D0F14] p-10 text-center text-sm text-slate-400">
            No announcements match this filter.
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(archiveConfirm)}
        title={archiveConfirm?.archived ? 'Restore Announcement' : 'Archive Announcement'}
        description={
          archiveConfirm?.archived
            ? `Restore "${archiveConfirm?.title}" from the archive?`
            : `Archive "${archiveConfirm?.title}"? Archived announcements are hidden from the public News & Updates page.`
        }
        confirmLabel={archiveConfirm?.archived ? 'Restore' : 'Confirm Archive'}
        variant={archiveConfirm?.archived ? 'primary' : 'danger'}
        onCancel={() => setArchiveConfirm(null)}
        onConfirm={() => {
          if (archiveConfirm) toggleArchive(archiveConfirm);
        }}
      />

      <ConfirmModal
        open={Boolean(deleteConfirm)}
        variant="danger"
        title="Delete Announcement Permanently"
        description={`Remove "${deleteConfirm?.title || deleteConfirm?.id}" from staging? Publishing updates will permanently delete this announcement from public/data/news.json.`}
        confirmLabel="Confirm Delete"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) deleteArticle(deleteConfirm);
        }}
      />
    </div>
  );
};
