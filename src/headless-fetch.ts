/**
 * SPA detection and headless Chromium rendering for pre-crawl.
 *
 * When a site returns a thin JS-only shell (e.g. React CRA, Vite SPA),
 * the regular fetch() gets almost no text content, causing false low scores.
 * This module detects those shells and re-renders them with Puppeteer.
 */

import type { FetchResult } from './site-crawler.js';

// ─── SPA classification ─────────────────────────────────────────────────────

export type RenderingMethod = 'server' | 'client-spa';

interface RenderingClassification {
  method: RenderingMethod;
  framework: string | null;
}

// ─── SPA shell detection ────────────────────────────────────────────────────

const SPA_INDICATORS = [
  // Root mount points (empty or nearly empty, including self-closing)
  /<div\s+id=["'](root|app|__next|__nuxt|__vue)["'][^>]*(?:\/>|>\s*<\/div>)/i,
  // Framework globals
  /__NEXT_DATA__/,
  /__NUXT__/,
  // CRA / Vite bundle patterns
  /src=["'][^"']*\/static\/js\/main\.[a-f0-9]+\.js["']/i,
  /src=["'][^"']*\/assets\/index-[a-f0-9]+\.js["']/i,
  // React markers
  /data-reactroot/i,
  // Angular
  /ng-version/i,
  // Noscript JS warnings
  /<noscript>[^<]*(?:javascript|enable\s+js|requires?\s+javascript)[^<]*<\/noscript>/i,
];

/**
 * Detect whether raw HTML is a thin SPA shell that needs client-side rendering.
 * Both conditions required:
 * 1. Visible text content < 500 chars (thin page)
 * 2. At least one SPA framework indicator present
 */
export function isSpaShell(html: string): boolean {
  // Strip all tags and collapse whitespace to get visible text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length >= 500) return false;

  return SPA_INDICATORS.some((pattern) => pattern.test(html));
}

/**
 * Classify a page's rendering method from its raw (non-headless) HTML.
 * Returns the method ('server' | 'client-spa') and detected framework if any.
 */
export function classifyRendering(html: string): RenderingClassification {
  if (!isSpaShell(html)) return { method: 'server', framework: null };

  // Detect framework from SPA indicators
  const frameworkPatterns: [RegExp, string][] = [
    [/__NEXT_DATA__/, 'next'],
    [/__NUXT__/, 'nuxt'],
    [/<div\s+id=["']__vue["']/i, 'vue'],
    [/ng-version/i, 'angular'],
    [/data-reactroot/i, 'react'],
    [/<div\s+id=["'](root|app)["'][^>]*(?:\/>|>\s*<\/div>)/i, 'react'],
    [/src=["'][^"']*\/static\/js\/main\.[a-f0-9]+\.js["']/i, 'react'],
    [/src=["'][^"']*\/assets\/index-[a-f0-9]+\.js["']/i, 'vite'],
  ];

  for (const [pattern, framework] of frameworkPatterns) {
    if (pattern.test(html)) return { method: 'client-spa', framework };
  }

  return { method: 'client-spa', framework: null };
}

// ─── Headless Chromium rendering ────────────────────────────────────────────

export interface HeadlessOptions {
  timeout?: number;
}

/**
 * Render a URL with headless Chromium and return the fully-rendered HTML.
 * Returns null if Puppeteer is not installed or any error occurs.
 * The caller should fall back to the raw HTML in that case.
 */
export async function fetchWithHeadless(
  url: string,
  options?: HeadlessOptions
): Promise<FetchResult | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any;
  try {
    // Dynamic import - puppeteer is an optional peer dependency
    const mod = 'puppeteer';
    puppeteer = await import(/* @vite-ignore */ mod);
  } catch {
    return null;
  }

  const timeout = options?.timeout ?? 25000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    // Block heavy resources to speed up rendering
    await page.setRequestInterception(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('request', (req: any) => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('AEO-Visibility-Bot/1.0');
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    // Wait for JS to populate the body with real text
    try {
      await page.waitForFunction(
        'document.body && document.body.innerText && document.body.innerText.replace(/\\s+/g, " ").trim().length > 100',
        { timeout: 5000 }
      );
    } catch {
      // Body text never exceeded 100 chars - still return what we got
    }

    const html = await page.content();
    const finalUrl = page.url();

    return {
      text: html.slice(0, 500000),
      status: 200,
      finalUrl,
    };
  } catch {
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
