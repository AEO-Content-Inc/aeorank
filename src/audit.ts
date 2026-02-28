/**
 * Programmatic audit API.
 * Runs the full 7-phase AEO audit pipeline and returns structured results.
 */

import { prefetchSiteData, auditSiteFromData, extractRawDataSummary } from './site-crawler.js';
import { calculateOverallScore } from './scoring.js';
import { isSpaShell, fetchWithHeadless, classifyRendering } from './headless-fetch.js';
import { buildScorecard, buildDetailedFindings } from './scorecard-builder.js';
import { generateVerdict, generateOpportunities, generatePitchNumbers, generateBottomLine } from './narrative-generator.js';
import { fetchMultiPageData } from './multi-page-fetcher.js';
import { analyzeAllPages } from './page-analyzer.js';
import type { AuditData } from './types.js';

export interface AuditOptions {
  /** Skip Puppeteer SPA rendering (default: false) */
  noHeadless?: boolean;
  /** Homepage + blog only, skip extra page discovery (default: false) */
  noMultiPage?: boolean;
  /** Fetch timeout in ms (default: 15000) */
  timeout?: number;
}

export interface AuditResult extends AuditData {
  /** True if headless browser was used for SPA rendering */
  renderedWithHeadless?: boolean;
  /** Wall-clock seconds */
  elapsed: number;
}

function getTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * Run a complete AEO audit on a domain.
 *
 * @example
 * ```ts
 * import { audit } from 'aeorank';
 * const result = await audit('example.com');
 * console.log(result.overallScore); // 0-100
 * ```
 */
export async function audit(domain: string, options?: AuditOptions): Promise<AuditResult> {
  const startTime = Date.now();
  let renderedWithHeadless = false;

  // Phase 1: Fetch site data
  const siteData = await prefetchSiteData(domain);

  if (!siteData.protocol) {
    throw new Error(`Could not connect to ${domain} (no HTTPS or HTTP response)`);
  }

  if (siteData.redirectedTo) {
    throw new Error(`${domain} redirects to ${siteData.redirectedTo} (hijacked domain)`);
  }

  if (siteData.parkedReason) {
    throw new Error(`${domain} is a parked/lost domain (${siteData.parkedReason})`);
  }

  // Phase 2: SPA detection + headless rendering
  if (!options?.noHeadless && siteData.homepage && isSpaShell(siteData.homepage.text)) {
    const rawTextLen = getTextLength(siteData.homepage.text);
    const url = `${siteData.protocol}://${domain}`;
    const rendered = await fetchWithHeadless(url);

    if (rendered) {
      const renderedTextLen = getTextLength(rendered.text);
      if (renderedTextLen > rawTextLen) {
        siteData.homepage = rendered;
        renderedWithHeadless = true;
      }
    }

    if (renderedWithHeadless && siteData.faqPage && isSpaShell(siteData.faqPage.text)) {
      const faqUrl = `${siteData.protocol}://${domain}/faq`;
      const renderedFaq = await fetchWithHeadless(faqUrl);
      if (renderedFaq && getTextLength(renderedFaq.text) > getTextLength(siteData.faqPage.text)) {
        siteData.faqPage = renderedFaq;
      }
    }
  }

  // Phase 3: Multi-page discovery
  if (!options?.noMultiPage) {
    await fetchMultiPageData(siteData);
  }

  // Phase 4: Score all 23 criteria
  const results = auditSiteFromData(siteData);
  const overallScore = calculateOverallScore(results);
  const rawData = extractRawDataSummary(siteData);
  if (renderedWithHeadless) rawData.rendered_with_headless = true;

  // Phase 5: Build scorecard + detailed findings
  const scorecard = buildScorecard(results);
  const detailedFindings = buildDetailedFindings(results);

  // Phase 6: Generate narrative
  const verdict = generateVerdict(overallScore, scorecard, rawData, domain);
  const opportunities = generateOpportunities(scorecard, results);
  const pitchNumbers = generatePitchNumbers(overallScore, rawData, scorecard);
  const bottomLine = generateBottomLine(overallScore, opportunities, scorecard, domain);

  // Phase 7: Per-page analysis
  const pagesReviewed = analyzeAllPages(siteData);

  const elapsed = Math.round((Date.now() - startTime) / 100) / 10;

  return {
    site: domain,
    auditDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    auditor: 'AEORank',
    engine: 'instant',
    overallScore,
    verdict,
    scorecard,
    detailedFindings,
    opportunities,
    pitchNumbers,
    bottomLine,
    pagesReviewed,
    elapsed,
    ...(renderedWithHeadless && { renderedWithHeadless: true }),
  };
}
