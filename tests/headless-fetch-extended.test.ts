import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyRendering, fetchWithHeadless } from '../src/headless-fetch.js';

describe('classifyRendering', () => {
  it('returns server for server-rendered page with plenty of text', () => {
    const html = `<html><body><h1>Welcome</h1><p>${'Server rendered content. '.repeat(30)}</p></body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('server');
    expect(result.framework).toBeNull();
  });

  it('detects Next.js framework', () => {
    const html = `<!DOCTYPE html><html><head><title>Next</title></head><body>
      <div id="__next"></div>
      <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('next');
  });

  it('detects Nuxt framework', () => {
    const html = `<!DOCTYPE html><html><head><title>Nuxt</title></head><body>
      <div id="__nuxt"></div>
      <script>window.__NUXT__={config:{}}</script>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('nuxt');
  });

  it('detects Vue framework', () => {
    const html = `<!DOCTYPE html><html><head><title>Vue</title></head><body>
      <div id="__vue"></div>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('vue');
  });

  it('detects Angular framework', () => {
    const html = `<!DOCTYPE html><html><head><title>Angular</title></head><body>
      <app-root ng-version="17.0.0"></app-root>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('angular');
  });

  it('detects React (data-reactroot)', () => {
    const html = `<!DOCTYPE html><html><head><title>React</title></head><body>
      <div id="root" data-reactroot></div>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('react');
  });

  it('detects React CRA (root div + static/js/main)', () => {
    const html = `<!DOCTYPE html><html><head><title>CRA</title></head><body>
      <div id="root"></div>
      <script src="/static/js/main.a1b2c3d4.js"></script>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('react');
  });

  it('detects Vite SPA (assets/index-*.js without app/root div)', () => {
    const html = `<!DOCTYPE html><html><head><title>Vite</title></head><body>
      <div id="container"></div>
      <script type="module" src="/assets/index-abc123ef.js"></script>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBe('vite');
  });

  it('returns client-spa with null framework for unknown SPA pattern', () => {
    // noscript pattern triggers SPA detection, but no framework-specific indicators
    const html = `<!DOCTYPE html><html><head><title>SPA</title></head><body>
      <noscript>This application requires JavaScript to be enabled.</noscript>
      <div id="main-content"></div>
      <script src="/bundle.min.js"></script>
    </body></html>`;
    const result = classifyRendering(html);
    expect(result.method).toBe('client-spa');
    expect(result.framework).toBeNull();
  });
});

describe('fetchWithHeadless', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when puppeteer is not installed', async () => {
    // puppeteer is not installed in test env, so dynamic import fails
    const result = await fetchWithHeadless('https://example.com');
    expect(result).toBeNull();
  });

  it('returns null when puppeteer is not installed (with options)', async () => {
    const result = await fetchWithHeadless('https://example.com', { timeout: 5000 });
    expect(result).toBeNull();
  });
});
