/**
 * AEORank CLI
 *
 * Usage:
 *   npx aeorank example.com [options]
 *
 * Options:
 *   --json                Output raw JSON
 *   --summary             Print human-readable summary
 *   --ci                  CI mode: JSON stdout + exit code 1 if below threshold
 *   --threshold <N>       Score threshold for --ci (default: 70)
 *   --no-headless         Skip Puppeteer SPA rendering
 *   --no-multi-page       Homepage + blog only (faster)
 *   --version             Print version
 *   --help                Show help
 */

import { audit } from './audit.js';
import type { AuditResult } from './audit.js';

const VERSION = '1.0.0';

interface CliArgs {
  domain: string;
  json: boolean;
  summary: boolean;
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

  OPTIONS
    --json              Output raw JSON to stdout
    --summary           Print human-readable scorecard
    --ci                CI mode: JSON + exit 1 if score < threshold
    --threshold <N>     Score threshold for --ci (default: 70)
    --no-headless       Skip Puppeteer SPA rendering
    --no-multi-page     Skip extra page discovery (faster)
    --version           Print version
    --help              Show this help

  EXAMPLES
    aeorank example.com
    aeorank example.com --json
    aeorank example.com --ci --threshold 80
    aeorank example.com --summary --no-headless
`);
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.includes('--version') || argv.includes('-v')) {
    return { domain: '', json: false, summary: false, ci: false, threshold: 70, noHeadless: false, noMultiPage: false, version: true, help: false };
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    return { domain: '', json: false, summary: false, ci: false, threshold: 70, noHeadless: false, noMultiPage: false, version: false, help: true };
  }

  // First non-flag argument is the domain
  const domain = argv.find(a => !a.startsWith('-')) || '';

  function getArg(name: string): string | undefined {
    const idx = argv.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  }

  const threshold = parseInt(getArg('threshold') || '70', 10);

  return {
    domain,
    json: argv.includes('--json'),
    summary: argv.includes('--summary'),
    ci: argv.includes('--ci'),
    threshold: isNaN(threshold) ? 70 : threshold,
    noHeadless: argv.includes('--no-headless'),
    noMultiPage: argv.includes('--no-multi-page'),
    version: false,
    help: false,
  };
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

  try {
    log(`Auditing ${args.domain}...`);

    const result = await audit(args.domain, {
      noHeadless: args.noHeadless,
      noMultiPage: args.noMultiPage,
    });

    log(`Score: ${result.overallScore}/100 (${result.elapsed}s)`);

    // JSON output modes
    if (args.json || args.ci) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }

    // Summary output
    if (args.summary || (!args.json && !args.ci)) {
      printSummary(result);
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
