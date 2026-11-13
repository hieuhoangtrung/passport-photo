// Build-time page generation for search engines: one static HTML page per language and per country.
// Runs in Node through Vite (see vite.config.ts). The React app replaces #root when it starts.
import { COUNTRIES, fmtRange, fmtSize } from './formats';
import en, { type MessageKey, type Messages } from './i18n/en';
import { format, LOCALES, RTL, type Locale } from './i18n/meta';
import { pathFor } from './route';

const modules = import.meta.glob<{ default: Partial<Messages> }>('./i18n/locales/*.ts', { eager: true });
const messages = (l: Locale): Partial<Messages> => (l === 'en' ? en : (modules[`./i18n/locales/${l}.ts`]?.default ?? en));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const FAQ = [1, 2, 3, 4, 5] as const;

export type Page = { path: string; html: string };

export function pages(template: string, origin: string): Page[] {
  const locales = Object.keys(LOCALES) as Locale[];
  const countries = Object.keys(COUNTRIES);
  const out: Page[] = [];
  for (const locale of locales) {
    for (const country of [undefined, ...countries]) out.push({ path: pathFor(locale, country), html: page(template, origin, locale, country) });
  }
  return out;
}

function page(template: string, origin: string, locale: Locale, country?: string): string {
  const m = messages(locale);
  const rtl = RTL.has(locale);
  // Bidi isolates around measurements are only needed in right-to-left text.
  const t = (k: MessageKey, v?: Record<string, string | number>) => (rtl ? format(m, k, v) : format(m, k, v).replace(/[\u2066\u2069]/g, ''));
  const names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  const name = (cc: string) => names.of(cc) ?? cc;
  const spec = country ? COUNTRIES[country] : undefined;
  const vars = country && spec ? { country: name(country), size: fmtSize(spec), head: fmtRange(spec.headMin, spec.headMax) } : undefined;

  const title = vars ? t('seo.countryTitle', vars) : t('seo.title');
  const description = vars ? t('seo.countryDescription', vars) : t('seo.description');
  const h1 = vars ? t('seo.countryH1', vars) : t('seo.h1');
  const url = origin + pathFor(locale, country);

  const alternates = (Object.keys(LOCALES) as Locale[])
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${origin}${pathFor(l, country)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${origin}${pathFor('en', country)}">`)
    .join('\n    ');

  const app = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('app.title'),
    url,
    description,
    inLanguage: locale,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any (web browser)',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: FAQ.map((n) => ({
      '@type': 'Question',
      name: t(`faq.q${n}`),
      acceptedAnswer: { '@type': 'Answer', text: t(`faq.a${n}`) },
    })),
  };

  const head = `<meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${url}">
    ${alternates}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(t('app.title'))}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:locale" content="${locale.replace('-', '_')}">
    <meta property="og:image" content="${origin}/og.png">
    <meta name="twitter:card" content="summary_large_image">
    ${jsonLd(app)}
    ${jsonLd(faq)}`;

  // Home pages list every country page so crawlers find them; country pages link back home.
  const links = country
    ? `<p><a href="${pathFor(locale)}">${esc(t('seo.h1'))}</a></p>`
    : `<nav><ul>${Object.keys(COUNTRIES)
        .map((cc) => `<li><a href="${pathFor(locale, cc)}">${esc(t('seo.countryH1', { country: name(cc) }))}</a></li>`)
        .join('')}</ul></nav>`;
  const body = `<main>
      <h1>${esc(h1)}</h1>
      ${vars ? `<p>${esc(t('seo.countryRules', vars))}</p>` : ''}
      <p>${esc(t('seo.description'))}</p>
      <h2>${esc(t('faq.title'))}</h2>
      ${FAQ.map((n) => `<h3>${esc(t(`faq.q${n}`))}</h3><p>${esc(t(`faq.a${n}`))}</p>`).join('\n      ')}
      ${links}
    </main>`;

  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, head)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

export function sitemap(paths: string[], origin: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${origin}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}
