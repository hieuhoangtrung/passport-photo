import { expect, it } from 'vitest';
import { COUNTRIES } from '../formats';
import { parsePath, pathFor } from '../route';
import en from './en';
import { format, localeForCountry, matchLocale } from './meta';

it('matches browser languages to supported locales', () => {
  expect(matchLocale(['vi-VN', 'en'])).toBe('vi');
  expect(matchLocale(['zh-HK'])).toBe('zh-TW');
  expect(matchLocale(['zh'])).toBe('zh-CN');
  expect(matchLocale(['sw', 'pt-BR'])).toBe('pt');
  expect(matchLocale(['sw'])).toBeNull();
  expect(localeForCountry('BR')).toBe('pt');
});

it('round-trips language and country URLs', () => {
  expect(pathFor('en')).toBe('/');
  expect(pathFor('vi', 'VN')).toBe('/vi/vn/');
  expect(parsePath('/vi/vn/')).toEqual({ locale: 'vi', country: 'VN' });
  expect(parsePath('/id/id/')).toEqual({ locale: 'id', country: 'ID' });
  expect(parsePath('/xx/vn/')).toEqual({ locale: undefined, country: undefined });
  expect(parsePath('/en/zz/')).toEqual({ locale: 'en', country: undefined });
});

it('fills placeholders and falls back to English', () => {
  expect(format({}, 'checks.toFix', { n: 3 })).toBe('3 to fix');
  expect(format({ 'checks.toFix': '{n} à corriger' }, 'checks.toFix', { n: 2 })).toBe('2 à corriger');
  expect(en['msg.head']).toContain('{range}');
});

it('has sane country rules', () => {
  for (const [cc, r] of Object.entries(COUNTRIES)) {
    expect(cc).toMatch(/^[A-Z]{2}$/);
    expect(r.headMin).toBeGreaterThan(0);
    expect(r.headMax).toBeGreaterThan(r.headMin);
    expect(r.headMax).toBeLessThan(r.h);
  }
});
