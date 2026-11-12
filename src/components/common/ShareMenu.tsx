import React, { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import {
  buildWhatsAppShareUrl,
  buildXShareUrl,
  copyToClipboard,
  getCurrentShareUrl,
  triggerNativeShare,
} from '../../utils/share';

interface ShareMenuProps {
  title: string;
  text: string;
}

export const ShareMenu: React.FC<ShareMenuProps> = ({ title, text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(getCurrentShareUrl());
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    const result = await triggerNativeShare({ title, text });
    if (result === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void handleShare()}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-mono uppercase tracking-wider bg-[#0A1013] hover:bg-[#111C21] border border-emerald-500/25 text-slate-200 transition-colors cursor-pointer"
      >
        <Share2 className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
        Share
      </button>

      <a
        href={buildWhatsAppShareUrl({ title, text })}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-3 py-2 text-xs font-mono uppercase tracking-wider bg-[#131722] hover:bg-[#1B2130] border border-slate-700 text-slate-200 transition-colors"
      >
        WhatsApp
      </a>

      <a
        href={buildXShareUrl({ title, text })}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-3 py-2 text-xs font-mono uppercase tracking-wider bg-[#131722] hover:bg-[#1B2130] border border-slate-700 text-slate-200 transition-colors"
      >
        Share on X
      </a>

      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider bg-[#131722] hover:bg-[#1B2130] border border-slate-700 text-slate-200 transition-colors cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            Copy Link
          </>
        )}
      </button>
    </div>
  );
};
