import { useEffect } from 'react';

interface PageMetaProps {
  title: string;
  description: string;
  noIndex?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  canonicalUrl?: string;
}

function upsertMetaTag(attrName: 'name' | 'property', key: string, content: string): void {
  let tag = document.querySelector(`meta[${attrName}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attrName, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export const PageMeta: React.FC<PageMetaProps> = ({
  title,
  description,
  noIndex = false,
  ogTitle,
  ogDescription,
  ogImage,
  twitterCard = 'summary_large_image',
  canonicalUrl,
}) => {
  useEffect(() => {
    const fullTitle = title.includes('NexusX Esports India')
      ? title
      : `${title} | NexusX Esports India`;
    document.title = fullTitle;

    upsertMetaTag('name', 'description', description);

    const robotsDirective = noIndex ? 'noindex, nofollow' : 'index, follow';
    upsertMetaTag('name', 'robots', robotsDirective);
    upsertMetaTag('name', 'googlebot', robotsDirective);

    upsertMetaTag('property', 'og:title', ogTitle || fullTitle);
    upsertMetaTag('property', 'og:description', ogDescription || description);
    if (ogImage) {
      upsertMetaTag('property', 'og:image', ogImage);
    }

    upsertMetaTag('name', 'twitter:card', twitterCard);
    upsertMetaTag('name', 'twitter:title', ogTitle || fullTitle);
    upsertMetaTag('name', 'twitter:description', ogDescription || description);
    if (ogImage) {
      upsertMetaTag('name', 'twitter:image', ogImage);
    }

    if (canonicalUrl) {
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);
    }
  }, [title, description, noIndex, ogTitle, ogDescription, ogImage, twitterCard, canonicalUrl]);

  return null;
};
