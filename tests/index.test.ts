import { describe, it, expect } from 'vitest';

// Test that all public exports are accessible
import * as aeorank from '../src/index.js';

describe('index exports', () => {
  it('exports audit function', () => {
    expect(typeof aeorank.audit).toBe('function');
  });

  it('exports prefetchSiteData', () => {
    expect(typeof aeorank.prefetchSiteData).toBe('function');
  });

  it('exports auditSiteFromData', () => {
    expect(typeof aeorank.auditSiteFromData).toBe('function');
  });

  it('exports extractRawDataSummary', () => {
    expect(typeof aeorank.extractRawDataSummary).toBe('function');
  });

  it('exports calculateOverallScore', () => {
    expect(typeof aeorank.calculateOverallScore).toBe('function');
  });

  it('exports buildScorecard', () => {
    expect(typeof aeorank.buildScorecard).toBe('function');
  });

  it('exports buildDetailedFindings', () => {
    expect(typeof aeorank.buildDetailedFindings).toBe('function');
  });

  it('exports scoreToStatus', () => {
    expect(typeof aeorank.scoreToStatus).toBe('function');
  });

  it('exports CRITERION_LABELS', () => {
    expect(aeorank.CRITERION_LABELS).toBeDefined();
    expect(typeof aeorank.CRITERION_LABELS).toBe('object');
  });

  it('exports narrative generator functions', () => {
    expect(typeof aeorank.generateVerdict).toBe('function');
    expect(typeof aeorank.generateOpportunities).toBe('function');
    expect(typeof aeorank.generatePitchNumbers).toBe('function');
    expect(typeof aeorank.generateBottomLine).toBe('function');
  });

  it('exports page analyzer functions', () => {
    expect(typeof aeorank.analyzePage).toBe('function');
    expect(typeof aeorank.analyzeAllPages).toBe('function');
  });

  it('exports multi-page fetcher functions', () => {
    expect(typeof aeorank.fetchMultiPageData).toBe('function');
    expect(typeof aeorank.extractNavLinks).toBe('function');
    expect(typeof aeorank.extractContentPagesFromSitemap).toBe('function');
  });

  it('exports headless-fetch functions', () => {
    expect(typeof aeorank.isSpaShell).toBe('function');
    expect(typeof aeorank.classifyRendering).toBe('function');
    expect(typeof aeorank.fetchWithHeadless).toBe('function');
  });

  it('exports detectParkedDomain', () => {
    expect(typeof aeorank.detectParkedDomain).toBe('function');
  });

  it('exports HTML report generators', () => {
    expect(typeof aeorank.generateHtmlReport).toBe('function');
    expect(typeof aeorank.generateComparisonHtmlReport).toBe('function');
  });

  it('exports compare function', () => {
    expect(typeof aeorank.compare).toBe('function');
  });
});
