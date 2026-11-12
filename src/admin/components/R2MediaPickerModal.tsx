import React, { useRef, useState } from 'react';
import { Check, ImagePlus, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import {
  deleteAdminMediaAsset,
  replaceAdminMediaAsset,
  uploadAdminMediaAsset,
} from '../api/cmsClient';
import { resolveMediaAssetUrl, type MediaAssetRecord } from '../../types/cms';

interface R2MediaPickerModalProps {
  open: boolean;
  apiUrl: string;
  assets: MediaAssetRecord[];
  defaultFolder?: string;
  onClose: () => void;
  onSelect: (publicUrl: string) => void;
  onAssetsChanged: () => Promise<void> | void;
}

const PRESET_LOCAL_ASSETS = [
  { label: 'Hero Arena', url: './images/hero-arena.jpg' },
  { label: 'Trophy Arena', url: './images/nexusx-trophy-arena.jpg' },
  { label: 'Tactical Vista', url: './images/tactical-night-vista.jpg' },
  { label: 'Final Circle', url: './images/battle-royale-clutch.jpg' },
  { label: 'Squad Banner', url: './images/squad-banner.jpg' },
  { label: 'Duo Banner', url: './images/duo-banner.jpg' },
  { label: 'Solo Banner', url: './images/solo-banner.jpg' },
  { label: 'Erangel Vista', url: './images/map-erangel.jpg' },
  { label: 'Season Visual', url: './images/news-season.jpg' },
  { label: 'Official Logo', url: './images/nexusx-logo.png' },
];

export const R2MediaPickerModal: React.FC<R2MediaPickerModalProps> = ({
  open,
  apiUrl,
  assets,
  defaultFolder = 'uploads',
  onClose,
  onSelect,
  onAssetsChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const handleUploadFile = async (file: File | undefined) => {
    if (!file || !apiUrl) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await uploadAdminMediaAsset(apiUrl, file, defaultFolder);
      await onAssetsChanged();
      setNotice(`Uploaded "${res.asset.originalName}" to Cloudflare R2.`);
      onSelect(res.asset.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image to Cloudflare R2.');
    } finally {
      setBusy(false);
    }
  };

  const handleReplaceFile = async (file: File | undefined) => {
    if (!file || !replaceTargetId || !apiUrl) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await replaceAdminMediaAsset(apiUrl, replaceTargetId, file);
      await onAssetsChanged();
      setNotice(`Replaced asset "${res.asset.originalName}" in R2.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace R2 image.');
    } finally {
      setBusy(false);
      setReplaceTargetId(null);
    }
  };

  const handleDeleteAsset = async (asset: MediaAssetRecord) => {
    if (!apiUrl) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminMediaAsset(apiUrl, asset.id, false);
      await onAssetsChanged();
      setNotice(`Deleted "${asset.originalName}" from R2 & asset registry.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete asset because it may be referenced by active content.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="r2-media-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl border border-[#22C55E]/40 bg-[#070B0E] p-6 space-y-5 shadow-[0_0_55px_rgba(34,197,94,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2
              id="r2-media-picker-title"
              className="font-display text-xl font-bold text-white uppercase flex items-center gap-2"
            >
              <ImagePlus className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
              Cloudflare R2 &amp; Visual Media Library
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload JPEG, PNG, WebP, or AVIF images (up to 5 MB) directly into Cloudflare R2, or select a built-in BGMI visual.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => void handleUploadFile(e.target.files?.[0])}
            />
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(e) => void handleReplaceFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy || !apiUrl}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl nx-btn-neon px-4 py-2 text-xs font-mono font-bold uppercase cursor-pointer disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Uploading...' : 'Upload to R2'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close media library"
              className="rounded-xl border border-white/15 bg-black/50 p-2 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/35 px-4 py-3 text-xs text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/35 px-4 py-3 text-xs text-emerald-200">
            {notice}
          </div>
        )}

        {/* Uploaded Cloudflare R2 Assets */}
        <div className="space-y-2.5">
          <h3 className="font-mono text-xs uppercase tracking-wider text-[#22C55E]">
            Cloudflare R2 Uploaded Assets ({assets.length})
          </h3>
          {assets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-6 text-center text-xs text-slate-400">
              No images uploaded to Cloudflare R2 yet. Click &ldquo;Upload to R2&rdquo; above to add custom banners or hero artwork.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-2xl border border-white/10 bg-[#0A1114] overflow-hidden flex flex-col justify-between"
                >
                  <div className="relative h-32 bg-black">
                    <img
                      src={resolveMediaAssetUrl(asset.publicUrl)}
                      alt={asset.altText || asset.originalName}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute top-2 right-2 rounded-md bg-black/80 border border-white/15 px-2 py-0.5 font-mono text-[10px] text-slate-200">
                      {(asset.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="text-xs font-medium text-white truncate" title={asset.originalName}>
                      {asset.originalName}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {asset.referenceCount && asset.referenceCount > 0
                        ? `In use (${asset.referenceCount} ref)`
                        : 'Unused asset'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onSelect(asset.publicUrl)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[#22C55E]/20 hover:bg-[#22C55E] border border-[#22C55E]/40 text-[#16FF6E] hover:text-[#050709] px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase cursor-pointer transition-colors"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" /> Select
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setReplaceTargetId(asset.id);
                          replaceInputRef.current?.click();
                        }}
                        title="Replace image in R2"
                        className="rounded-lg border border-white/15 hover:border-cyan-400/60 bg-black/40 p-1.5 text-slate-300 hover:text-cyan-300 cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDeleteAsset(asset)}
                        title="Delete from R2"
                        className="rounded-lg border border-white/15 hover:border-red-400/60 bg-black/40 p-1.5 text-slate-300 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Built-in BGMI Artwork Library */}
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-300">
            Built-in BGMI Visual Assets
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {PRESET_LOCAL_ASSETS.map((preset) => (
              <button
                key={preset.url}
                type="button"
                onClick={() => onSelect(preset.url)}
                className="group rounded-xl border border-white/10 hover:border-[#22C55E] bg-[#0B1215] overflow-hidden text-left cursor-pointer transition-colors"
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="h-16 w-full object-cover opacity-85 group-hover:opacity-100"
                />
                <div className="p-2 font-mono text-[10px] text-slate-200 truncate">{preset.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
