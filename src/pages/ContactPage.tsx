import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Mail, MessageCircle, Send } from 'lucide-react';
import { useSiteData } from '../context/SiteDataContext';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { SocialLinks } from '../components/common/SocialLinks';
import { copyToClipboard } from '../utils/share';
import { validateHttpsUrl } from '../utils/validation';

export const ContactPage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const { community } = bundle.siteConfig;
  const whatsappContactCheck = validateHttpsUrl(
    community.whatsappContactUrl,
    'WhatsApp Contact'
  );
  const whatsappCommunityCheck = validateHttpsUrl(
    community.whatsappCommunityUrl,
    'WhatsApp Community'
  );

  const [name, setName] = useState('');
  const [ign, setIgn] = useState('');
  const [topic, setTopic] = useState('Tournament Registration');
  const [message, setMessage] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedTicket, setCopiedTicket] = useState(false);

  const formattedMessage = [
    `[NexusX Esports India Support]`,
    `Topic: ${topic}`,
    `Name: ${name.trim() || 'Not specified'}`,
    `BGMI IGN / Character ID: ${ign.trim() || 'Not specified'}`,
    ``,
    message.trim() || '(Write your question here)',
  ].join('\n');

  const mailtoHref = community.contactEmail
    ? `mailto:${community.contactEmail}?subject=${encodeURIComponent(
        `[NexusX Support] ${topic}${ign.trim() ? ` - ${ign.trim()}` : ''}`
      )}&body=${encodeURIComponent(formattedMessage)}`
    : null;

  const handleCopyEmail = async () => {
    if (!community.contactEmail) return;
    const ok = await copyToClipboard(community.contactEmail);
    if (ok) {
      setCopiedEmail(true);
      window.setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const handleCopyTicket = async () => {
    const ok = await copyToClipboard(formattedMessage);
    if (ok) {
      setCopiedTicket(true);
      window.setTimeout(() => setCopiedTicket(false), 2000);
    }
  };

  return (
    <div className="pb-16">
      <PageMeta
        title="Contact Us | NexusX Esports India"
        description="Official contact email, WhatsApp support, community links, and social media channels for NexusX Esports India."
      />

      <PageHeader
        eyebrow="Player & Community Desk"
        title="Contact Us"
        description="Connect with NexusX Esports India via our official email, WhatsApp contact, community channels, and social platforms."
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 space-y-10">
        {datasetErrors.siteConfig && (
          <DataErrorCard
            title="Unable to Load Contact & Community Channels"
            detail={datasetErrors.siteConfig}
            onRetry={() => void reloadData(true)}
          />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Direct Channels */}
          <div className="lg:col-span-5 space-y-6">
            <div className="nx-glass rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-white uppercase">
                  Official Email
                </h2>
              </div>
              {community.contactEmail ? (
                <div className="rounded-xl bg-[#080B10] border border-white/10 p-4 flex items-center justify-between gap-3">
                  <a
                    href={`mailto:${community.contactEmail}`}
                    className="font-mono text-sm text-white hover:text-[#22C55E] truncate transition-colors"
                  >
                    {community.contactEmail}
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyEmail()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 hover:border-slate-500 text-xs font-mono text-slate-200 shrink-0 cursor-pointer"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500 font-mono">
                  Official contact email is not configured yet.
                </p>
              )}

              {whatsappContactCheck.valid && whatsappContactCheck.normalized && (
                <a
                  href={whatsappContactCheck.normalized}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-200 font-mono text-xs uppercase tracking-wider transition-colors"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Direct WhatsApp Contact
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}

              {whatsappCommunityCheck.valid && whatsappCommunityCheck.normalized && (
                <a
                  href={whatsappCommunityCheck.normalized}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-slate-700 hover:border-white bg-[#131722] text-slate-200 font-mono text-xs uppercase tracking-wider transition-colors"
                >
                  <MessageCircle className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                  Join Community WhatsApp
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>

            <div className="border border-slate-800 bg-[#0D0F14] p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-white uppercase">
                Social &amp; Community Links
              </h2>
              <SocialLinks community={community} variant="compact" />
            </div>
          </div>

          {/* Client-Side Message Composer */}
          <div className="lg:col-span-7 border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-white uppercase">
                Prepare Support Inquiry
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Draft your inquiry below and open it directly in your email app or copy it to share
                through WhatsApp or Discord.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="contact-name"
                  className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Your Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Player or captain name"
                  className="w-full rounded-lg px-3.5 py-2.5 bg-[#080B10] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#22C55E]"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-ign"
                  className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  BGMI IGN / Character ID
                </label>
                <input
                  id="contact-ign"
                  type="text"
                  value={ign}
                  onChange={(e) => setIgn(e.target.value)}
                  placeholder="Optional IGN / ID"
                  className="w-full rounded-lg px-3.5 py-2.5 bg-[#080B10] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#22C55E]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="contact-topic"
                className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Topic
              </label>
              <select
                id="contact-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 bg-[#080B10] border border-white/10 text-sm text-white focus:outline-none focus:border-[#22C55E]"
              >
                <option value="Tournament Registration">Tournament Registration</option>
                <option value="Match Rules & Verification">Match Rules &amp; Verification</option>
                <option value="Community Inquiry">Community Inquiry</option>
                <option value="Privacy Request">Privacy Request</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="contact-message"
                className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Message
              </label>
              <textarea
                id="contact-message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your question or inquiry..."
                className="w-full rounded-lg px-3.5 py-2.5 bg-[#080B10] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#22C55E]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {mailtoHref && (
                <a
                  href={mailtoHref}
                  className="nx-btn-neon inline-flex items-center gap-2 px-5 py-3 text-sm"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Open in Email App
                </a>
              )}

              <button
                type="button"
                onClick={() => void handleCopyTicket()}
                className="inline-flex items-center gap-2 px-5 py-3 border border-slate-700 hover:border-white bg-[#080A0E] text-slate-200 font-display font-semibold text-sm uppercase tracking-wider transition-colors cursor-pointer"
              >
                {copiedTicket ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    Inquiry Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy Message
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
