# Contributing

Thank you for helping. Every pull request is welcome, small or large.

## Before you start

1. Fork the repository and create a branch.
2. Run `npm install`, then `npm run dev`.
3. Before you open a pull request, run `npm test` and `npm run build`. Both must pass.

## Fix or add a country rule

Rules are in `src/data/countries.json`. Keys are ISO 3166-1 alpha-2 codes. All values are in millimetres.

```json
"AU": { "w": 35, "h": 45, "headMin": 32, "headMax": 36, "source": "https://www.passports.gov.au/..." }
```

| Field | Meaning |
|---|---|
| `w`, `h` | Photo width and height |
| `headMin`, `headMax` | Head height, chin to crown |
| `eyeMin`, `eyeMax` | Optional. Eye line height from the bottom edge, only if the official rule gives it |
| `source` | Official government page. Do not link to commercial photo sites |
| `low` | `true` if the rule is not confirmed by an official source. The app shows a warning |

In the pull request, include a link to the official source. If you confirm a rule from an official source, remove `"low": true`.

## Improve a translation

English source strings are in `src/i18n/en.ts`. Each language has a file in `src/i18n/locales/`. Keep every `{placeholder}` as it is. Missing keys use the English text.

To add a language:

1. Copy a locale file and translate it.
2. Add the language to `LOCALES` in `src/i18n/meta.ts`. If the language is written right to left, also add it to `RTL`.
3. Optionally, map countries to the language in `COUNTRY_LOCALE` in the same file.

## Code style

- Keep it simple. Prefer the platform and existing code over new dependencies.
- Photos must never leave the browser. Do not add analytics, tracking or uploads.
- Add a test for meaningful logic changes.
