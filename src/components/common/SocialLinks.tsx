import React from 'react';
import { ArrowRight, ExternalLink, Gamepad2, Globe, Radio, Send, Share2 } from 'lucide-react';
import type { CmsSocialLink } from '../../types/cms';
import type { CommunityConfig } from '../../types/data';
import { validateHttpsUrl } from '../../utils/validation';

interface SocialLinksProps {
  community: CommunityConfig;
  cmsSocialLinks?: CmsSocialLink[];
  variant?: 'cards' | 'compact' | 'icons';
  hideMissing?: boolean;
}

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.78 14.07c-.24.67-1.4 1.28-1.95 1.36-.5.08-1.14.11-1.84-.11-.43-.14-.98-.32-1.69-.63-2.97-1.28-4.91-4.29-5.06-4.49-.15-.2-1.21-1.61-1.21-3.07 0-1.46.76-2.18 1.03-2.47.27-.3.59-.37.79-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.6.84 2.05.91 2.2.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.45.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.64-.08.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.96.3.15.5.22.57.34.08.13.08.73-.16 1.4z" />
  </svg>
);

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M21.58 7.19a2.75 2.75 0 0 0-1.94-1.94C17.93 4.8 12 4.8 12 4.8s-5.93 0-7.64.45A2.75 2.75 0 0 0 2.42 7.2 28.8 28.8 0 0 0 2 12a28.8 28.8 0 0 0 .42 4.81 2.75 2.75 0 0 0 1.94 1.94C6.07 19.2 12 19.2 12 19.2s5.93 0 7.64-.45a2.75 2.75 0 0 0 1.94-1.94A28.8 28.8 0 0 0 22 12a28.8 28.8 0 0 0-.42-4.81zM10 15.1V8.9l5.2 3.1L10 15.1z" />
  </svg>
);

function resolveIcon(platform: string, iconName: string): React.ComponentType<{ className?: string }> {
  const key = (iconName || platform).toLowerCase();
  if (key.includes('radio') || key.includes('channel')) return Radio;
  if (key.includes('whatsapp') || key.includes('message') || platform === 'whatsapp') return WhatsAppIcon;
  if (key.includes('instagram') || platform === 'instagram') return InstagramIcon;
  if (key.includes('youtube') || platform === 'youtube') return YouTubeIcon;
  if (key.includes('discord') || platform === 'discord') return Gamepad2;
  if (key.includes('telegram') || platform === 'telegram') return Send;
  if (key === 'x') return Share2;
  return Globe;
}

function resolveTint(platform: string, label: string): string {
  if (platform === 'whatsapp' && label.toLowerCase().includes('channel')) {
    return 'text-[#22C55E] border-[#22C55E]/35 bg-[#22C55E]/10 group-hover:bg-[#22C55E]/20';
  }
  if (platform === 'whatsapp') {
    return 'text-[#25D366] border-[#25D366]/35 bg-[#25D366]/10 group-hover:bg-[#25D366]/20';
  }
  if (platform === 'instagram') {
    return 'text-pink-400 border-pink-500/35 bg-pink-500/10 group-hover:bg-pink-500/20';
  }
  if (platform === 'youtube') {
    return 'text-rose-400 border-rose-500/35 bg-rose-500/10 group-hover:bg-rose-500/20';
  }
  if (platform === 'discord') {
    return 'text-indigo-400 border-indigo-500/35 bg-indigo-500/10 group-hover:bg-indigo-500/20';
  }
  if (platform === 'telegram') {
    return 'text-sky-400 border-sky-500/35 bg-sky-500/10 group-hover:bg-sky-500/20';
  }
  return 'text-[#22C55E] border-emerald-500/35 bg-emerald-500/10 group-hover:bg-emerald-500/20';
}

interface NormalizedSocialChannel {
  id: string;
  name: string;
  subtitle: string;
  ctaLabel: string;
  url: string;
  tint: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SocialLinks: React.FC<SocialLinksProps> = ({
  community,
  cmsSocialLinks,
  variant = 'cards',
}) => {
  const configuredChannels: NormalizedSocialChannel[] = React.useMemo(() => {
    if (cmsSocialLinks && cmsSocialLinks.length > 0) {
      return [...cmsSocialLinks]
        .filter((s) => s.visible)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((s) => {
          const check = validateHttpsUrl(s.url, s.label);
          return {
            id: s.id,
            name: s.label,
            subtitle: s.subtitle || 'Follow our official NexusX channel.',
            ctaLabel:
              s.platform === 'youtube'
                ? 'Subscribe'
                : s.platform === 'instagram'
                  ? 'Follow Us'
                  : s.platform === 'discord'
                    ? 'Join Server'
                    : s.platform === 'whatsapp' && s.label.toLowerCase().includes('channel')
                      ? 'Follow Channel'
                      : s.platform === 'whatsapp'
                        ? 'Join Group'
                        : 'Connect',
            url: check.valid ? check.normalized : '',
            tint: resolveTint(s.platform, s.label),
            icon: resolveIcon(s.platform, s.iconName),
          };
        })
        .filter((c) => Boolean(c.url));
    }

    const legacy: Array<{
      id: string;
      platform: string;
      name: string;
      subtitle: string;
      ctaLabel: string;
      rawUrl: string;
      iconName: string;
    }> = [
      {
        id: 'whatsapp-group',
        platform: 'whatsapp',
        name: 'WhatsApp Group',
        subtitle: 'Join our tournament community.',
        ctaLabel: 'Join Group',
        rawUrl: community.whatsappCommunityUrl ?? '',
        iconName: 'whatsapp',
      },
      {
        id: 'whatsapp-channel',
        platform: 'whatsapp',
        name: 'WhatsApp Channel',
        subtitle: 'Get official announcements and updates.',
        ctaLabel: 'Follow Channel',
        rawUrl: community.whatsappChannelUrl ?? '',
        iconName: 'radio',
      },
      {
        id: 'instagram',
        platform: 'instagram',
        name: 'Instagram',
        subtitle: 'Follow us for tournament highlights and updates.',
        ctaLabel: 'Follow Us',
        rawUrl: community.instagramUrl ?? '',
        iconName: 'instagram',
      },
      {
        id: 'youtube',
        platform: 'youtube',
        name: 'YouTube',
        subtitle: 'Watch our esports videos and content.',
        ctaLabel: 'Subscribe',
        rawUrl: community.youtubeUrl ?? '',
        iconName: 'youtube',
      },
      {
        id: 'discord',
        platform: 'discord',
        name: 'Discord',
        subtitle: 'Coordinate lobbies and squad check-ins.',
        ctaLabel: 'Join Server',
        rawUrl: community.discordUrl ?? '',
        iconName: 'discord',
      },
    ];

    return legacy
      .map((item) => {
        const check = validateHttpsUrl(item.rawUrl, item.name);
        return {
          id: item.id,
          name: item.name,
          subtitle: item.subtitle,
          ctaLabel: item.ctaLabel,
          url: check.valid ? check.normalized : '',
          tint: resolveTint(item.platform, item.name),
          icon: resolveIcon(item.platform, item.iconName),
        };
      })
      .filter((c) => Boolean(c.url));
  }, [cmsSocialLinks, community]);

  if (variant === 'icons') {
    if (configuredChannels.length === 0) {
      return (
        <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
          Official community links can be configured in Website Content Manager.
        </p>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {configuredChannels.map((ch) => {
          const Icon = ch.icon;
          return (
            <a
              key={ch.id}
              href={ch.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${ch.name} — ${ch.ctaLabel}`}
              className="group rounded-2xl border border-white/10 hover:border-[#22C55E]/50 bg-[#060B0D]/90 p-4 flex items-center gap-3.5 transition-all hover:-translate-y-0.5"
            >
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border shrink-0 transition-colors ${ch.tint}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-bold text-white uppercase truncate">
                  {ch.name}
                </div>
                <div className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#22C55E]">
                  <span>{ch.ctaLabel}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    );
  }

  if (variant === 'compact') {
    if (configuredChannels.length === 0) {
      return <span className="text-xs text-slate-500">No social channels configured.</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {configuredChannels.map((ch) => {
          const Icon = ch.icon;
          return (
            <a
              key={ch.id}
              href={ch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-mono bg-[#0B1214] hover:bg-[#22C55E] border border-emerald-500/25 hover:border-[#22C55E] text-slate-200 hover:text-[#031107] hover:font-semibold transition-colors"
            >
              <Icon className="h-3.5 w-3.5 text-[#22C55E] group-hover:text-[#031107]" />
              <span>{ch.name}</span>
              <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {configuredChannels.map((ch) => {
        const Icon = ch.icon;
        return (
          <a
            key={ch.id}
            href={ch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl nx-glass nx-glass-hover p-5 flex flex-col justify-between transition-all"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/35 p-2.5 text-[#22C55E]">
                  <Icon className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-[#22C55E] transition-colors" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-white uppercase tracking-wide">
                {ch.name}
              </h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">{ch.subtitle}</p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#22C55E]">
              <span>{ch.ctaLabel}</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </div>
          </a>
        );
      })}
    </div>
  );
};
