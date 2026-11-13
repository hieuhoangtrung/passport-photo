import { COUNTRIES } from './formats';
import { isLocale, matchLocale, type Locale } from './i18n/meta';

// URLs: "/" (English home), "/{locale}/" (home), "/{locale}/{country}/" (country page, e.g. /vi/vn/).
export type Route = { locale?: Locale; country?: string };

export function parsePath(path: string): Route {
  const [l, c] = path.split('/').filter(Boolean);
  const locale = isLocale(l) ? l : undefined;
  const cc = c?.toUpperCase();
  return { locale, country: locale && cc && cc in COUNTRIES ? cc : undefined };
}

export const pathFor = (locale: Locale, country?: string) =>
  country ? `/${locale}/${country.toLowerCase()}/` : locale === 'en' ? '/' : `/${locale}/`;

export const LOCALE_KEY = 'passport-photo:locale';

export function initialLocale(): Locale {
  const fromUrl = parsePath(location.pathname).locale;
  const saved = localStorage.getItem(LOCALE_KEY) ?? undefined;
  return fromUrl ?? (isLocale(saved) ? saved : undefined) ?? matchLocale(navigator.languages ?? [navigator.language]) ?? 'en';
}

/** Country from the browser language region, e.g. "en-AU" -> "AU". Used when the host gives no country. */
export function browserCountry(): string | undefined {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const region = tag.split('-')[1]?.toUpperCase();
    if (region && region.length === 2) return region;
  }
  return undefined;
}
