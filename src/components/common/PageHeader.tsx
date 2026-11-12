import React from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
}) => {
  return (
    <section className="relative border-b border-emerald-500/15 bg-[#06090B] bg-tactical-grid">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-[#22C55E] mb-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white uppercase">
              {title}
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-300 leading-relaxed">
              {description}
            </p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>
    </section>
  );
};
