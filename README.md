# Passport Photo Maker

Free, open-source passport photo maker that runs in your browser. **Live: https://passport-photo-bvh.pages.dev** Upload a photo, and the app crops it to the correct size for your country, checks it against passport photo rules, and makes a print sheet.

- **Private:** face detection and editing run on your device. The photo is never uploaded.
- **Free:** no account, no watermark, no payment, no tracking.
- **163 countries** and common sizes (35 × 45 mm, 2 × 2 in, 33 × 48 mm, 50 × 70 mm and more).
- **20 languages**, with right-to-left support for Arabic.
- **Automatic checks:** head size, eye height, tilt, centring, eyes open, neutral expression, background, light, resolution.
- **Editing:** zoom, move, tilt (with a handle on the photo), brightness, contrast, optional white background. Pinch to zoom on phones.
- **Print sheet:** mix photo sizes on 6 × 4 in, 7 × 5 in, A5, A4 or Letter paper. As many photos as fit by default.

## Run locally

Use Node 22 or later.

```bash
npm install
npm run dev
```

Other commands:

```bash
npm test          # unit tests (Vitest)
npm run build     # typecheck, build, and prerender one page per language and country into dist/
```

## How it works

| Area | Files |
|---|---|
| Face landmarks and person mask (MediaPipe, served from `public/`) | `src/detect.ts` |
| Crop maths and all checks (pure functions, tested) | `src/checks.ts` |
| Rendering, downloads | `src/render.ts` |
| Print sheet packing | `src/print.ts`, `src/PrintSheet.tsx` |
| Country rules | `src/data/countries.json`, `src/formats.ts` |
| Translations | `src/i18n/en.ts` (source), `src/i18n/locales/*.ts` |
| SEO pages, sitemap, robots.txt (build time) | `src/seo.ts`, `vite.config.ts` |
| Country suggestion (Cloudflare Pages Function) | `functions/api/geo.ts` |

URLs are `/{language}/{country}/`, for example `/vi/vn/`. English home is `/`.

## Deploy to Cloudflare Pages (free)

1. In the Cloudflare dashboard, go to **Workers & Pages > Create > Pages > Connect to Git** and select this repository.
2. Build command: `npm run build`. Build output directory: `dist`.
3. Optional: set the `SITE_URL` environment variable to your domain (for example `https://example.com`). Without it, production uses `https://passport-photo-bvh.pages.dev`.

Each push to `main` deploys again. Preview branches are served with `noindex`.

The country suggestion uses Cloudflare's own `CF-IPCountry` data inside `functions/api/geo.ts`. Nothing is sent to a third party and nothing is stored. On other hosts the app uses the browser language region instead.

## Contributing

Contributions are welcome, especially:

- **Country rules.** Many entries come from secondary sources and show a warning in the app (`"low": true`). A correction with an official government source is the most useful contribution.
- **Translations.** Native speakers can improve `src/i18n/locales/*.ts`. These were machine-translated.
- **Bugs and features.** Open an issue first for large changes.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

Passport offices make the final decision. Rules change. Always confirm with the official rules for your country before you print.

## Licence

[MIT](LICENSE). The MediaPipe models and runtime in `public/models` and `public/mediapipe` are from Google and use the Apache 2.0 licence.
