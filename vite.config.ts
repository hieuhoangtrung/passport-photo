import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig, runnerImport, type Plugin } from 'vite';

// After the build, write a static page per language and country, plus sitemap.xml and robots.txt.
function prerender(): Plugin {
  return {
    name: 'prerender-seo-pages',
    apply: 'build',
    async closeBundle() {
      // Canonical site address. Cloudflare Pages: production builds use SITE_URL (or the default
      // pages.dev name); preview builds use their own preview address.
      const env = process.env;
      const origin = env.SITE_URL ?? (env.CF_PAGES_BRANCH === 'main' ? 'https://passport-photo-bvh.pages.dev' : (env.CF_PAGES_URL ?? 'http://localhost:4173'));
      const { module: seo } = await runnerImport<typeof import('./src/seo')>('./src/seo.ts', { configFile: false });
      const template = readFileSync('dist/index.html', 'utf8');
      const list = seo.pages(template, origin);
      for (const p of list) {
        const file = join('dist', p.path, 'index.html');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, p.html);
      }
      writeFileSync('dist/sitemap.xml', seo.sitemap(list.map((p) => p.path), origin));
      writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`);
      // Preview deployments must not compete with production in search results.
      if (env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main') writeFileSync('dist/_headers', '/*\n  X-Robots-Tag: noindex\n');
      console.log(`prerendered ${list.length} pages for ${origin}`);
    },
  };
}

export default defineConfig({ plugins: [react(), prerender()], base: '/' });
