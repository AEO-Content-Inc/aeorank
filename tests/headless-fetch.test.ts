import { describe, it, expect } from 'vitest';
import { isSpaShell } from '../src/headless-fetch.js';

describe('isSpaShell', () => {
  it('returns false for server-rendered page with plenty of text', () => {
    const html = `<html><head><title>Notion</title></head><body>
      <h1>Your connected workspace</h1>
      <p>${'Notion is the all-in-one workspace. '.repeat(20)}</p>
      <nav><a href="/product">Product</a><a href="/pricing">Pricing</a></nav>
    </body></html>`;
    expect(isSpaShell(html)).toBe(false);
  });

  it('detects React CRA shell (empty root div + main.*.js)', () => {
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>App</title>
      </head><body>
      <noscript>You need to enable JavaScript to run this app.</noscript>
      <div id="root"></div>
      <script src="/static/js/main.a1b2c3d4.js"></script>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });

  it('detects Next.js CSR shell (empty __next div)', () => {
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Next App</title>
      <script src="/_next/static/chunks/main.js"></script>
      </head><body>
      <div id="__next"></div>
      <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });

  it('detects Vue/Nuxt shell (__NUXT__)', () => {
    const html = `<!DOCTYPE html><html><head><title>Nuxt</title></head><body>
      <div id="__nuxt"></div>
      <script>window.__NUXT__={config:{}}</script>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });

  it('detects Vite SPA (empty app div + assets/index-*.js)', () => {
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Vite App</title>
      <script type="module" src="/assets/index-abc123ef.js"></script>
      </head><body>
      <div id="app"></div>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });

  it('detects Angular app (ng-version)', () => {
    const html = `<!DOCTYPE html><html><head><title>Angular App</title></head>
    <body>
      <app-root ng-version="17.2.0"></app-root>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });

  it('detects data-reactroot marker', () => {
    const html = `<!DOCTYPE html><html><head><title>React</title></head>
    <body>
      <div id="root" data-reactroot></div>
      <script src="/bundle.js"></script>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });

  it('returns false for thin page WITHOUT SPA indicators (coming soon)', () => {
    const html = `<html><head><title>Coming Soon</title></head><body>
      <h1>Coming Soon</h1><p>We are launching in Q2 2026.</p>
    </body></html>`;
    expect(isSpaShell(html)).toBe(false);
  });

  it('returns false for redirect notice without SPA indicators', () => {
    const html = `<html><head><title>Redirecting...</title></head><body>
      <p>If you are not redirected, <a href="https://example.com">click here</a>.</p>
    </body></html>`;
    expect(isSpaShell(html)).toBe(false);
  });

  it('returns false for empty page with no SPA markers', () => {
    const html = `<html><head><title></title></head><body></body></html>`;
    expect(isSpaShell(html)).toBe(false);
  });

  it('detects noscript JS warning with thin content', () => {
    const html = `<!DOCTYPE html><html><head><title>SPA</title></head><body>
      <div id="root"></div>
      <noscript>This application requires JavaScript to be enabled.</noscript>
    </body></html>`;
    expect(isSpaShell(html)).toBe(true);
  });
});
