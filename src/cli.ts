/**
 * AEORank CLI
 *
 * Usage:
 *   npx aeorank example.com [options]
 *   npx aeorank site-a.com site-b.com [options]   # comparison mode
 *
 * Options:
 *   --json                Output raw JSON
 *   --summary             Print human-readable summary
 *   --html                Generate standalone HTML report file
 *   --ci                  CI mode: JSON stdout + exit code 1 if below threshold
 *   --threshold <N>       Score threshold for --ci (default: 70)
 *   --no-headless         Skip Puppeteer SPA rendering
 *   --no-multi-page       Homepage + blog only (faster)
 *   --version             Print version
 *   --help                Show help
 */

import { writeFileSync } from 'node:fs';
import { audit } from './audit.js';
import type { AuditResult } from './audit.js';
import { compare } from './compare.js';
import type { ComparisonResult } from './compare.js';
import { generateHtmlReport, generateComparisonHtmlReport } from './html-report.js';

const VERSION = '1.2.0';

interface CliArgs {
  domain: string;
  domainB: string | null;
  json: boolean;
  summary: boolean;
  html: boolean;
  ci: boolean;
  threshold: number;
  noHeadless: boolean;
  noMultiPage: boolean;
  version: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`
  aeorank - AI Engine Optimization audit

  USAGE
    aeorank <domain> [options]
    aeorank <domain-a> <domain-b> [options]   # comparison mode

  OPTIONS
    --json              Output raw JSON to stdout
    --summary           Print human-readable scorecard
    --html              Generate standalone HTML report file
    --ci                CI mode: JSON + exit 1 if score < threshold
    --threshold <N>     Score threshold for --ci (default: 70)
    --no-headless       Skip Puppeteer SPA rendering
    --no-multi-page     Skip extra page discovery (faster)
    --version           Print version
    --help              Show this help

  EXAMPLES
    aeorank example.com
    aeorank example.com --json
    aeorank example.com --html
    aeorank example.com --ci --threshold 80
    aeorank site-a.com site-b.com
    aeorank site-a.com site-b.com --html
    aeorank site-a.com site-b.com --json
`);
}

function parseArgs(argv: string[]): CliArgs {
  const defaults = { domain: '', domainB: null as string | null, json: false, summary: false, html: false, ci: false, threshold: 70, noHeadless: false, noMultiPage: false, version: false, help: false };

  if (argv.includes('--version') || argv.includes('-v')) {
    return { ...defaults, version: true };
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    return { ...defaults, help: true };
  }

  // Collect non-flag arguments (skip values that follow --threshold)
  const nonFlags: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--threshold') {
      i++; // skip the value
      continue;
    }
    if (!argv[i].startsWith('-')) {
      nonFlags.push(argv[i]);
    }
  }

  const domain = nonFlags[0] || '';
  const domainB = nonFlags[1] || null;

  function getArg(name: string): string | undefined {
    const idx = argv.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  }

  const threshold = parseInt(getArg('threshold') || '70', 10);

  return {
    domain,
    domainB,
    json: argv.includes('--json'),
    summary: argv.includes('--summary'),
    html: argv.includes('--html'),
    ci: argv.includes('--ci'),
    threshold: isNaN(threshold) ? 70 : threshold,
    noHeadless: argv.includes('--no-headless'),
    noMultiPage: argv.includes('--no-multi-page'),
    version: false,
    help: false,
  };
}

function sanitizeFilename(domain: string): string {
  return domain.replace(/[^a-zA-Z0-9.-]/g, '-');
}

function printSummary(result: AuditResult): void {
  const log = (msg: string) => process.stderr.write(msg + '\n');

  log('');
  log(`  ${result.site} - AEO Audit (${result.overallScore}/100)`);
  log('  ' + '-'.repeat(50));
  log('');

  for (const item of result.scorecard) {
    const bar = '\u2588'.repeat(item.score) + '\u2591'.repeat(10 - item.score);
    log(`  ${item.id.toString().padStart(2)}. ${bar} ${item.score}/10 ${item.criterion}`);
  }

  log('');
  log(`  Verdict: ${result.verdict}`);
  log('');

  if (result.opportunities.length > 0) {
    log(`  Opportunities (${result.opportunities.length}):`);
    for (const opp of result.opportunities) {
      log(`    ${opp.id}. [${opp.impact}] ${opp.name} (${opp.effort} effort)`);
    }
    log('');
  }

  log(`  Bottom line: ${result.bottomLine}`);
  log('');

  if (result.pagesReviewed && result.pagesReviewed.length > 0) {
    log(`  Pages reviewed (${result.pagesReviewed.length}):`);
    for (const page of result.pagesReviewed) {
      const cat = page.category.charAt(0).toUpperCase() + page.category.slice(1);
      const issueCount = page.issues.length;
      const issueLabel = issueCount === 0 ? '0 issues' : issueCount === 1 ? '1 issue' : `${issueCount} issues`;
      log(`    ${cat.padEnd(10)} ${page.url.padEnd(50)} ${issueLabel}`);
    }
    log('');
  }

  log(`  Completed in ${result.elapsed}s`);
  log('');
}

function printComparisonSummary(result: ComparisonResult): void {
  const log = (msg: string) => process.stderr.write(msg + '\n');
  const { siteA, siteB, comparison } = result;

  log('');
  log(`  ${siteA.site} (${siteA.overallScore}) vs ${siteB.site} (${siteB.overallScore})`);
  log('  ' + '\u2500'.repeat(60));
  log('');

  const maxNameLen = Math.max(...comparison.criteria.map(c => c.criterion.length), 20);

  log(`  ${'#'.padStart(3)}  ${'Criterion'.padEnd(maxNameLen)}  ${siteA.site.padStart(10)}  ${siteB.site.padStart(10)}  ${'Delta'.padStart(5)}`);
  log('  ' + '\u2500'.repeat(3 + 2 + maxNameLen + 2 + 10 + 2 + 10 + 2 + 5));

  for (const c of comparison.criteria) {
    const barA = '\u2588'.repeat(c.scoreA) + '\u2591'.repeat(10 - c.scoreA);
    const barB = '\u2588'.repeat(c.scoreB) + '\u2591'.repeat(10 - c.scoreB);
    const delta = c.delta > 0 ? `+${c.delta}` : c.delta === 0 ? ' 0' : `${c.delta}`;
    log(`  ${c.id.toString().padStart(3)}  ${c.criterion.padEnd(maxNameLen)}  ${barA} ${c.scoreA.toString().padStart(2)}  ${barB} ${c.scoreB.toString().padStart(2)}  ${delta.padStart(5)}`);
  }

  log('');
  log(`  ${siteA.site} leads in ${comparison.siteAAdvantages.length} criteria`);
  log(`  ${siteB.site} leads in ${comparison.siteBAdvantages.length} criteria`);
  log(`  Tied: ${comparison.tied.length} criteria`);
  log('');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log(VERSION);
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.domain) {
    console.error('Error: domain argument required\n');
    printHelp();
    process.exit(1);
  }

  const log = (msg: string) => process.stderr.write(`[aeorank] ${msg}\n`);
  const auditOptions = { noHeadless: args.noHeadless, noMultiPage: args.noMultiPage };

  try {
    // ─── Comparison mode ───────────────────────────────────────────────
    if (args.domainB) {
      log(`Comparing ${args.domain} vs ${args.domainB}...`);

      const result = await compare(args.domain, args.domainB, auditOptions);

      log(`${args.domain}: ${result.siteA.overallScore}/100 (${result.siteA.elapsed}s)`);
      log(`${args.domainB}: ${result.siteB.overallScore}/100 (${result.siteB.elapsed}s)`);

      // JSON output
      if (args.json || args.ci) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      }

      // Summary output
      if (args.summary || (!args.json && !args.ci)) {
        printComparisonSummary(result);
      }

      // HTML output
      if (args.html) {
        const filename = `aeorank-${sanitizeFilename(args.domain)}-vs-${sanitizeFilename(args.domainB)}.html`;
        const html = generateComparisonHtmlReport(result);
        writeFileSync(filename, html, 'utf-8');
        log(`HTML report: ${filename}`);
      }

      // CI exit code (uses site A's score)
      if (args.ci && result.siteA.overallScore < args.threshold) {
        log(`FAIL: ${args.domain} score ${result.siteA.overallScore} is below threshold ${args.threshold}`);
        process.exit(1);
      }

      return;
    }

    // ─── Single audit mode ─────────────────────────────────────────────
    log(`Auditing ${args.domain}...`);

    const result = await audit(args.domain, auditOptions);

    log(`Score: ${result.overallScore}/100 (${result.elapsed}s)`);

    // JSON output modes
    if (args.json || args.ci) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }

    // Summary output
    if (args.summary || (!args.json && !args.ci)) {
      printSummary(result);
    }

    // HTML output
    if (args.html) {
      const filename = `aeorank-${sanitizeFilename(args.domain)}.html`;
      const html = generateHtmlReport(result);
      writeFileSync(filename, html, 'utf-8');
      log(`HTML report: ${filename}`);
    }

    // CI exit code
    if (args.ci && result.overallScore < args.threshold) {
      log(`FAIL: Score ${result.overallScore} is below threshold ${args.threshold}`);
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`);
    process.exit(1);
  }
}

main();
