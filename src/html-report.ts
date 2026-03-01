/**
 * HTML report generator for AEORank audits.
 * Produces self-contained HTML with inline CSS - zero external dependencies.
 */

import type { AuditResult } from './audit.js';

// ─── Score colors (matching monorepo lib/score-color.ts) ─────────────────────

function scoreColor(score: number): string {
  if (score <= 40) return '#F44336';
  if (score <= 55) return '#FF9800';
  if (score <= 70) return '#FFC107';
  if (score <= 85) return '#4CAF50';
  return '#2E7D32';
}

function criterionColor(score: number): string {
  return scoreColor(score * 10);
}

// ─── Security: escape HTML entities ──────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── SVG score circle ────────────────────────────────────────────────────────

function scoreCircleSvg(score: number, size = 160): string {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = scoreColor(score);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#e0e0e0" stroke-width="10"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${circumference}" stroke-dashoffset="${circumference - progress}"
      stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" dominant-baseline="middle"
      font-size="42" font-weight="700" fill="${color}">${score}</text>
    <text x="${size / 2}" y="${size / 2 + 24}" text-anchor="middle" dominant-baseline="middle"
      font-size="13" fill="#666">/100</text>
  </svg>`;
}

// ─── Inline CSS ──────────────────────────────────────────────────────────────

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #f8f9fa; line-height: 1.6; }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  .header { text-align: center; margin-bottom: 40px; }
  .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .header .date { color: #666; font-size: 14px; }
  .score-section { display: flex; justify-content: center; margin: 24px 0 32px; }
  .verdict { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px; font-size: 15px; color: #333; }
  .section-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; color: #1a1a1a; }
  .scorecard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .criterion-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
  .criterion-bar { width: 80px; height: 8px; background: #e0e0e0; border-radius: 4px; flex-shrink: 0; overflow: hidden; }
  .criterion-bar-fill { height: 100%; border-radius: 4px; }
  .criterion-score { font-size: 14px; font-weight: 700; min-width: 32px; text-align: center; }
  .criterion-name { font-size: 13px; flex: 1; }
  .criterion-status { font-size: 11px; color: #666; background: #f0f0f0; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
  th { background: #f5f5f5; text-align: left; padding: 10px 14px; font-size: 13px; font-weight: 600; color: #555; border-bottom: 1px solid #e0e0e0; }
  td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  .impact-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: #fff; }
  .impact-critical { background: #F44336; }
  .impact-high { background: #FF5722; }
  .impact-quick-win { background: #4CAF50; }
  .impact-core-aeo { background: #2196F3; }
  .impact-medium { background: #FF9800; }
  .impact-low { background: #9E9E9E; }
  .impact-big-opportunity { background: #9C27B0; }
  .impact-measurement { background: #607D8B; }
  .bottom-line { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px; font-size: 15px; }
  .footer { text-align: center; color: #999; font-size: 12px; padding: 24px 0; border-top: 1px solid #e0e0e0; margin-top: 24px; }
  .compare-header { display: flex; justify-content: center; align-items: center; gap: 48px; margin-bottom: 32px; }
  .compare-site { text-align: center; }
  .compare-site h2 { font-size: 20px; margin-bottom: 8px; }
  .compare-vs { font-size: 24px; font-weight: 700; color: #999; }
  .delta-positive { color: #4CAF50; font-weight: 600; }
  .delta-negative { color: #F44336; font-weight: 600; }
  .delta-zero { color: #999; }
  .summary-box { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; }
  .summary-stat { text-align: center; }
  .summary-stat .num { font-size: 28px; font-weight: 700; }
  .summary-stat .label { font-size: 12px; color: #666; }
  @media print {
    body { background: #fff; }
    .container { padding: 0; }
    .criterion-card, .verdict, .bottom-line, table { break-inside: avoid; }
  }
  @media (max-width: 640px) {
    .scorecard-grid { grid-template-columns: 1fr; }
    .compare-header { flex-direction: column; gap: 16px; }
  }
`;

// ─── Impact badge class ──────────────────────────────────────────────────────

function impactClass(impact: string): string {
  const key = impact.toLowerCase().replace(/\s+/g, '-');
  return `impact-${key}`;
}

// ─── Single audit report ─────────────────────────────────────────────────────

export function generateHtmlReport(result: AuditResult): string {
  const domain = escapeHtml(result.site);
  const date = escapeHtml(result.auditDate);

  const scorecardCards = result.scorecard
    .map((item) => {
      const color = criterionColor(item.score);
      const width = item.score * 10;
      return `<div class="criterion-card">
        <div class="criterion-bar"><div class="criterion-bar-fill" style="width:${width}%;background:${color}"></div></div>
        <span class="criterion-score" style="color:${color}">${item.score}/10</span>
        <span class="criterion-name">${escapeHtml(item.criterion)}</span>
        <span class="criterion-status">${escapeHtml(item.status)}</span>
      </div>`;
    })
    .join('\n');

  const opportunityRows = result.opportunities
    .map((opp) => {
      const cls = impactClass(opp.impact);
      return `<tr>
        <td>${opp.id}</td>
        <td>${escapeHtml(opp.name)}</td>
        <td><span class="impact-badge ${cls}">${escapeHtml(opp.impact)}</span></td>
        <td>${escapeHtml(opp.effort)}</td>
        <td>${escapeHtml(opp.description)}</td>
      </tr>`;
    })
    .join('\n');

  const pagesRows = (result.pagesReviewed || [])
    .map((page) => {
      const issueCount = page.issues.length;
      const strengthCount = page.strengths.length;
      return `<tr>
        <td>${escapeHtml(page.url)}</td>
        <td>${escapeHtml(page.category)}</td>
        <td>${page.wordCount}</td>
        <td>${issueCount}</td>
        <td>${strengthCount}</td>
      </tr>`;
    })
    .join('\n');

  const now = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AEORank Report - ${domain}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${domain}</h1>
      <div class="date">AEO Audit - ${date}</div>
    </div>

    <div class="score-section">
      ${scoreCircleSvg(result.overallScore)}
    </div>

    <div class="verdict">${escapeHtml(result.verdict)}</div>

    <h2 class="section-title">Scorecard (23 Criteria)</h2>
    <div class="scorecard-grid">
      ${scorecardCards}
    </div>

    ${result.opportunities.length > 0 ? `
    <h2 class="section-title">Opportunities (${result.opportunities.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Opportunity</th><th>Impact</th><th>Effort</th><th>Description</th></tr></thead>
      <tbody>${opportunityRows}</tbody>
    </table>
    ` : ''}

    ${(result.pagesReviewed || []).length > 0 ? `
    <h2 class="section-title">Pages Reviewed (${(result.pagesReviewed || []).length})</h2>
    <table>
      <thead><tr><th>URL</th><th>Category</th><th>Words</th><th>Issues</th><th>Strengths</th></tr></thead>
      <tbody>${pagesRows}</tbody>
    </table>
    ` : ''}

    <div class="bottom-line"><strong>Bottom line:</strong> ${escapeHtml(result.bottomLine)}</div>

    <div class="footer">Generated by AEORank - ${now}</div>
  </div>
</body>
</html>`;
}

// ─── Comparison report types (imported from compare.ts at runtime) ───────────

interface CriterionComparisonLike {
  id: number;
  criterion: string;
  scoreA: number;
  scoreB: number;
  delta: number;
  statusA: string;
  statusB: string;
}

interface ComparisonResultLike {
  siteA: AuditResult;
  siteB: AuditResult;
  comparison: {
    scoreDelta: number;
    criteria: CriterionComparisonLike[];
    siteAAdvantages: string[];
    siteBAdvantages: string[];
    tied: string[];
  };
}

// ─── Comparison HTML report ──────────────────────────────────────────────────

export function generateComparisonHtmlReport(result: ComparisonResultLike): string {
  const domainA = escapeHtml(result.siteA.site);
  const domainB = escapeHtml(result.siteB.site);
  const scoreA = result.siteA.overallScore;
  const scoreB = result.siteB.overallScore;

  const criteriaRows = result.comparison.criteria
    .map((c) => {
      const colorA = criterionColor(c.scoreA);
      const colorB = criterionColor(c.scoreB);
      const widthA = c.scoreA * 10;
      const widthB = c.scoreB * 10;
      let deltaHtml: string;
      if (c.delta > 0) deltaHtml = `<span class="delta-positive">+${c.delta}</span>`;
      else if (c.delta < 0) deltaHtml = `<span class="delta-negative">${c.delta}</span>`;
      else deltaHtml = `<span class="delta-zero">0</span>`;

      return `<tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.criterion)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="criterion-bar"><div class="criterion-bar-fill" style="width:${widthA}%;background:${colorA}"></div></div>
            <span style="color:${colorA};font-weight:600">${c.scoreA}</span>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="criterion-bar"><div class="criterion-bar-fill" style="width:${widthB}%;background:${colorB}"></div></div>
            <span style="color:${colorB};font-weight:600">${c.scoreB}</span>
          </div>
        </td>
        <td style="text-align:center">${deltaHtml}</td>
      </tr>`;
    })
    .join('\n');

  const advantagesA = result.comparison.siteAAdvantages.length;
  const advantagesB = result.comparison.siteBAdvantages.length;
  const tied = result.comparison.tied.length;

  const now = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AEORank Comparison - ${domainA} vs ${domainB}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AEO Comparison</h1>
    </div>

    <div class="compare-header">
      <div class="compare-site">
        <h2>${domainA}</h2>
        ${scoreCircleSvg(scoreA, 120)}
      </div>
      <div class="compare-vs">vs</div>
      <div class="compare-site">
        <h2>${domainB}</h2>
        ${scoreCircleSvg(scoreB, 120)}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-stat">
        <div class="num" style="color:${scoreColor(scoreA)}">${advantagesA}</div>
        <div class="label">${domainA} leads</div>
      </div>
      <div class="summary-stat">
        <div class="num" style="color:${scoreColor(scoreB)}">${advantagesB}</div>
        <div class="label">${domainB} leads</div>
      </div>
      <div class="summary-stat">
        <div class="num" style="color:#999">${tied}</div>
        <div class="label">Tied</div>
      </div>
    </div>

    <h2 class="section-title">Per-Criterion Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Criterion</th>
          <th>${domainA}</th>
          <th>${domainB}</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>${criteriaRows}</tbody>
    </table>

    ${result.comparison.siteAAdvantages.length > 0 ? `
    <h2 class="section-title">${domainA} Advantages</h2>
    <div class="verdict">${result.comparison.siteAAdvantages.map(c => escapeHtml(c)).join(', ')}</div>
    ` : ''}

    ${result.comparison.siteBAdvantages.length > 0 ? `
    <h2 class="section-title">${domainB} Advantages</h2>
    <div class="verdict">${result.comparison.siteBAdvantages.map(c => escapeHtml(c)).join(', ')}</div>
    ` : ''}

    ${result.comparison.tied.length > 0 ? `
    <h2 class="section-title">Tied Criteria</h2>
    <div class="verdict">${result.comparison.tied.map(c => escapeHtml(c)).join(', ')}</div>
    ` : ''}

    <div class="footer">Generated by AEORank - ${now}</div>
  </div>
</body>
</html>`;
}
