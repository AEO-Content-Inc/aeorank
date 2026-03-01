/**
 * Comparison mode - run two audits in parallel and compute per-criterion deltas.
 */

import { audit } from './audit.js';
import type { AuditOptions, AuditResult } from './audit.js';

export interface CriterionComparison {
  id: number;
  criterion: string;
  scoreA: number;
  scoreB: number;
  delta: number;
  statusA: string;
  statusB: string;
}

export interface ComparisonResult {
  siteA: AuditResult;
  siteB: AuditResult;
  comparison: {
    scoreDelta: number;
    criteria: CriterionComparison[];
    siteAAdvantages: string[];
    siteBAdvantages: string[];
    tied: string[];
  };
}

/**
 * Audit two domains in parallel and build a per-criterion comparison.
 */
export async function compare(
  domainA: string,
  domainB: string,
  options?: AuditOptions,
): Promise<ComparisonResult> {
  const [siteA, siteB] = await Promise.all([
    audit(domainA, options),
    audit(domainB, options),
  ]);

  const criteria: CriterionComparison[] = [];
  const siteAAdvantages: string[] = [];
  const siteBAdvantages: string[] = [];
  const tied: string[] = [];

  // Zip scorecards by id (both should have 23 items in the same order)
  for (let i = 0; i < siteA.scorecard.length; i++) {
    const a = siteA.scorecard[i];
    const b = siteB.scorecard[i];
    if (!a || !b) continue;

    const delta = a.score - b.score;

    criteria.push({
      id: a.id,
      criterion: a.criterion,
      scoreA: a.score,
      scoreB: b.score,
      delta,
      statusA: a.status,
      statusB: b.status,
    });

    if (delta > 0) siteAAdvantages.push(a.criterion);
    else if (delta < 0) siteBAdvantages.push(a.criterion);
    else tied.push(a.criterion);
  }

  return {
    siteA,
    siteB,
    comparison: {
      scoreDelta: siteA.overallScore - siteB.overallScore,
      criteria,
      siteAAdvantages,
      siteBAdvantages,
      tied,
    },
  };
}
