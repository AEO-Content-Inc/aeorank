# AEORank

Score any website for AI engine visibility across 23 criteria. Pure HTTP + regex - zero API keys required.

[![npm version](https://img.shields.io/npm/v/aeorank.svg)](https://www.npmjs.com/package/aeorank)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/AEO-Content-Inc/aeorank/actions/workflows/ci.yml/badge.svg)](https://github.com/AEO-Content-Inc/aeorank/actions/workflows/ci.yml)

<p align="center">
  <img src="https://raw.githubusercontent.com/AEO-Content-Inc/aeorank/main/demo.gif" alt="aeorank demo" width="700">
</p>

## Quick Start

### CLI

```bash
npx aeorank example.com
```

```bash
npx aeorank example.com --json          # JSON output
npx aeorank example.com --summary       # Human-readable scorecard
npx aeorank example.com --html          # Standalone HTML report
npx aeorank example.com --ci --threshold 80  # CI gate
npx aeorank site-a.com site-b.com       # Side-by-side comparison
```

### Programmatic

```ts
import { audit } from 'aeorank';

const result = await audit('example.com');
console.log(result.overallScore);  // 0-100
console.log(result.scorecard);     // 23 criteria with scores
console.log(result.opportunities); // Prioritized improvements
```

## What It Checks

AEORank evaluates 23 criteria across 4 categories that determine how AI engines (ChatGPT, Claude, Perplexity, Google AI Overviews) discover, parse, and cite your content:

| # | Criterion | Weight | Category |
|---|-----------|--------|----------|
| 1 | llms.txt File | 10% | Discovery |
| 2 | Schema.org Structured Data | 15% | Structure |
| 3 | Q&A Content Format | 15% | Content |
| 4 | Clean, Crawlable HTML | 10% | Structure |
| 5 | Entity Authority & NAP Consistency | 10% | Authority |
| 6 | robots.txt for AI Crawlers | 5% | Discovery |
| 7 | Comprehensive FAQ Section | 10% | Content |
| 8 | Original Data & Expert Analysis | 10% | Content |
| 9 | Internal Linking Structure | 10% | Structure |
| 10 | Semantic HTML5 & Accessibility | 5% | Structure |
| 11 | Content Freshness Signals | 7% | Content |
| 12 | Sitemap Completeness | 5% | Discovery |
| 13 | RSS/Atom Feed | 3% | Discovery |
| 14 | Table & List Extractability | 7% | Structure |
| 15 | Definition Patterns | 4% | Content |
| 16 | Direct Answer Paragraphs | 7% | Content |
| 17 | Content Licensing & AI Permissions | 4% | Discovery |
| 18 | Author & Expert Schema | 4% | Authority |
| 19 | Fact & Data Density | 5% | Content |
| 20 | Canonical URL Strategy | 4% | Structure |
| 21 | Content Publishing Velocity | 3% | Content |
| 22 | Schema Coverage & Depth | 3% | Structure |
| 23 | Speakable Schema | 3% | Structure |

## CLI Options

```
aeorank <domain> [options]
aeorank <domain-a> <domain-b> [options]   # comparison mode

Options:
  --json              Output raw JSON to stdout
  --summary           Print human-readable scorecard
  --html              Generate standalone HTML report file
  --ci                CI mode: JSON + exit 1 if score < threshold
  --threshold <N>     Score threshold for --ci (default: 70)
  --no-headless       Skip Puppeteer SPA rendering
  --no-multi-page     Skip extra page discovery (faster)
  --version           Print version
  --help              Show help
```

## GitHub Actions

Use the built-in action to gate deployments on AEO score:

```yaml
- name: AEO Audit
  uses: AEO-Content-Inc/aeorank@v1
  with:
    domain: example.com
    threshold: 70
```

Or use `npx` directly:

```yaml
- name: AEO Audit
  run: npx aeorank example.com --ci --threshold 70
```

## API

### `audit(domain, options?)`

Run a complete audit. Returns `AuditResult` with:

- `overallScore` - 0-100 weighted score
- `scorecard` - 23 `ScoreCardItem` entries (criterion, score 0-10, status, key findings)
- `detailedFindings` - Per-criterion findings with severity
- `opportunities` - Prioritized improvements with effort/impact
- `pitchNumbers` - Key metrics (schema types, AI crawler access, etc.)
- `verdict` - Human-readable summary paragraph
- `bottomLine` - Actionable recommendation
- `pagesReviewed` - Per-page analysis with issues and strengths
- `elapsed` - Wall-clock seconds

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `noHeadless` | `boolean` | `false` | Skip Puppeteer SPA rendering |
| `noMultiPage` | `boolean` | `false` | Homepage + blog only |
| `timeout` | `number` | `15000` | Fetch timeout in ms |

### Advanced API

For custom pipelines, import individual stages:

```ts
import {
  prefetchSiteData,
  auditSiteFromData,
  calculateOverallScore,
  buildScorecard,
  buildDetailedFindings,
  generateVerdict,
  generateOpportunities,
  isSpaShell,
  fetchWithHeadless,
} from 'aeorank';

const siteData = await prefetchSiteData('example.com');
const results = auditSiteFromData(siteData);
const score = calculateOverallScore(results);
```

## SPA Support

Sites that use client-side rendering (React, Vue, Angular) return empty HTML shells to regular HTTP requests. AEORank detects these automatically and re-renders them with Puppeteer if available.

Install Puppeteer as an optional dependency:

```bash
npm install puppeteer
```

Use `--no-headless` to skip SPA rendering (faster but may produce lower scores for SPAs).

## Scoring

Each criterion is scored 0-10 by deterministic checks (regex, HTML parsing, HTTP headers). The overall score is a weighted average normalized to 0-100.

Score interpretation:
- **86-100** - Excellent AI visibility
- **71-85** - Strong fundamentals, room for optimization
- **56-70** - Moderate readiness, significant gaps
- **41-55** - Below average, multiple areas need attention
- **0-40** - Critical gaps, largely invisible to AI engines

## HTML Reports

Generate a self-contained HTML report with score visualization, scorecard grid, and opportunities table:

```bash
npx aeorank example.com --html
# -> aeorank-example-com.html

npx aeorank site-a.com site-b.com --html
# -> aeorank-site-a-com-vs-site-b-com.html
```

Reports include inline CSS and SVG - no external dependencies. Open directly in any browser or share as a file.

Programmatic usage:

```ts
import { audit, generateHtmlReport } from 'aeorank';

const result = await audit('example.com');
const html = generateHtmlReport(result);
```

## Comparison Mode

Compare two sites side-by-side. Both audits run in parallel:

```bash
npx aeorank site-a.com site-b.com
npx aeorank site-a.com site-b.com --json
npx aeorank site-a.com site-b.com --html
```

Programmatic usage:

```ts
import { compare } from 'aeorank';

const result = await compare('site-a.com', 'site-b.com');
console.log(result.comparison.scoreDelta);       // Overall score difference
console.log(result.comparison.siteAAdvantages);   // Criteria where A leads
console.log(result.comparison.siteBAdvantages);   // Criteria where B leads
console.log(result.comparison.tied);              // Criteria with equal scores
```

## Benchmark Dataset

The `data/` directory contains open benchmark data from 500+ audited domains:

| File | Description |
|------|-------------|
| [`data/benchmark.json`](data/benchmark.json) | All domains with per-criterion scores, sector/category |
| [`data/yc.json`](data/yc.json) | YC startups with company metadata |
| [`data/sectors.json`](data/sectors.json) | Pre-computed sector statistics |

Use the dataset for research, benchmarking, or building on top of AEORank:

```ts
import benchmark from './data/benchmark.json' assert { type: 'json' };

// Find domains scoring above 80
const topDomains = benchmark.entries.filter(e => e.score >= 80);

// Get sector averages
import sectors from './data/sectors.json' assert { type: 'json' };
console.log(sectors.sectors.healthcare.mean); // Average score for healthcare
```

## Contributing

```bash
git clone https://github.com/AEO-Content-Inc/aeorank.git
cd aeorank
npm install
npm test
npm run build
```

## License

MIT - see [LICENSE](LICENSE)

---

Built by [AEO Content, Inc.](https://www.aeocontent.ai)
