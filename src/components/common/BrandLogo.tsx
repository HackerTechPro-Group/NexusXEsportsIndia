import React, { useState } from 'react';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
  logoSrc?: string;
  brandName?: string;
  tagline?: string;
}

/**
 * Displays the official NexusX Esports India logo (`./images/nexusx-logo.png` or CMS R2 upload).
 * Falls back gracefully to the existing geometric monogram if the image asset fails to load.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  compact = false,
  className = '',
  logoSrc = './images/nexusx-logo.png',
  brandName = 'NexusX Esports India',
  tagline = 'BGMI Tournament Platform',
}) => {
  const [logoAssetMissing, setLogoAssetMissing] = useState(false);

  const isDefaultBrand = brandName.trim().toLowerCase() === 'nexusx esports india';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {!logoAssetMissing ? (
        <img
          src={logoSrc || './images/nexusx-logo.png'}
          alt={`${brandName} Official Logo`}
          width={40}
          height={40}
          onError={() => setLogoAssetMissing(true)}
          className="h-10 w-10 shrink-0 rounded-full object-contain bg-white/95 p-0.5 ring-2 ring-[#22C55E]/70 shadow-[0_0_20px_rgba(34,197,94,0.45)]"
        />
      ) : (
        <svg
          width="40"
          height="40"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="shrink-0"
        >
          <path
            d="M10 8H54L60 14V50L44 58H10L4 52V14L10 8Z"
            fill="#0A0F12"
            stroke="#22C55E"
            strokeOpacity="0.65"
            strokeWidth="2"
          />
          <path d="M15 47V17H22.5L34 35V17H40V47H32.5L21 29V47H15Z" fill="#F8FAFC" />
          <path d="M35 17L50 47H42.5L27.5 17H35Z" fill="#22C55E" />
          <path d="M50 17L35 47H27.5L42.5 17H50Z" fill="#CBD5E1" fillOpacity="0.88" />
          <rect x="13" y="52" width="38" height="2.5" fill="#22C55E" />
        </svg>
      )}

      {!compact && (
        <div className="flex flex-col leading-none">
          {isDefaultBrand ? (
            <span className="font-display text-base sm:text-lg font-extrabold tracking-wider text-white uppercase whitespace-nowrap">
              Nexus<span className="text-[#16FF6E]">X</span>{' '}
              <span className="text-slate-100 font-bold">Esports India</span>
            </span>
          ) : (
            <span className="font-display text-base sm:text-lg font-extrabold tracking-wider text-white uppercase whitespace-nowrap">
              {brandName}
            </span>
          )}
          <span className="font-mono text-[9px] tracking-[0.22em] text-emerald-400/90 uppercase mt-0.5 hidden sm:block">
            {tagline}
          </span>
        </div>
      )}
    </div>
  );
};
