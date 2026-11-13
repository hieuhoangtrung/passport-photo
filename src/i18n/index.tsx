import { useDirection } from '@mantine/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en, { type MessageKey, type Messages } from './en';
import { format, RTL, type Locale, type Vars } from './meta';

export * from './meta';

const loaders = import.meta.glob<{ default: Partial<Messages> }>('./locales/*.ts');
export const loadMessages = async (l: Locale): Promise<Partial<Messages>> => (l === 'en' ? en : ((await loaders[`./locales/${l}.ts`]?.())?.default ?? en));

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Country name in the current language, from the browser (Intl). */
  countryName: (cc: string) => string;
};
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ initial, messages, children }: { initial: Locale; messages: Partial<Messages>; children: ReactNode }) {
  const [locale, setLocale] = useState(initial);
  const [msgs, setMsgs] = useState(messages);
  const { setDirection } = useDirection();

  useEffect(() => {
    let live = true;
    loadMessages(locale).then((m) => live && setMsgs(m));
    document.documentElement.lang = locale;
    setDirection(RTL.has(locale) ? 'rtl' : 'ltr'); // also sets <html dir>
    return () => {
      live = false;
    };
  }, [locale, setDirection]);

  const value = useMemo<Ctx>(() => {
    const names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
    return {
      locale,
      setLocale,
      t: (key, vars) => format(msgs, key, vars),
      countryName: (cc) => names.of(cc) ?? cc,
    };
  }, [locale, msgs]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18n);
  if (!ctx) throw new Error('useI18n needs I18nProvider');
  return ctx;
}
