import type { DecisionLogEntry } from "../decision-log";
import type { GlobalSummary } from "../decision-global-summary";
import { getGlobalSummary, getGlobalSummaryText } from "../decision-global-summary";
import { getConsistentGlobalSummaryText } from "../decision-consistency";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8 : decision === "watch" ? 3 : 1,
    anomalyThresholdC: 2,
    persistenceLevel:
      decision === "flag" ? "high" : decision === "watch" ? "medium" : decision === "log" ? "low" : "none",
    persistenceCount: decision === "flag" ? 3 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    weightedRecentScore: decision === "flag" ? 2.4 : decision === "watch" ? 1.3 : decision === "log" ? 0.8 : 0,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

function buildInconsistentActivitySummary(base: GlobalSummary): GlobalSummary {
  return {
    ...base,
    status: "watch",
    overview: {
      ...base.overview,
      activityLevel: "low"
    },
    audit: {
      status: "watch",
      issues: [
        {
          type: "high_activity",
          message: "Cas de test: pic d'activite detecte"
        }
      ]
    },
    recommendations: {
      status: "watch",
      recommendations: [
        {
          type: "continue_normal_monitoring",
          message: "Cas de test: monitoring",
          priority: "medium"
        }
      ]
    },
    topPatterns: []
  };
}

function buildInconsistentStableSummary(base: GlobalSummary): GlobalSummary {
  return {
    ...base,
    status: "ok",
    audit: {
      status: "ok",
      issues: []
    },
    recommendations: {
      status: "ok",
      recommendations: [
        {
          type: "review_flag_threshold",
          message: "Cas de test: verifier le seuil de flag",
          priority: "high"
        }
      ]
    },
    topPatterns: []
  };
}

/**
 * Test manuel v24:
 * - compare texte v23 vs texte v24
 * - inclut des cas de coherence explicitement contradictoires
 */
export function runAtlasMindV24ConsistencyExample() {
  const baselineLogs: DecisionLogEntry[] = [
    makeLog("Paris", "flag", 1000),
    makeLog("Paris", "flag", 1001),
    makeLog("Paris", "watch", 1002),
    makeLog("Paris", "flag", 1003),
    makeLog("Tokyo", "log", 1004),
    makeLog("Lagos", "log", 1005),
    makeLog("Paris", "flag", 1006)
  ];

  const baselineSummary = getGlobalSummary(baselineLogs);
  const inconsistentActivitySummary = buildInconsistentActivitySummary(baselineSummary);
  const inconsistentStableSummary = buildInconsistentStableSummary(baselineSummary);

  const cases = [
    { name: "baseline", summary: baselineSummary },
    { name: "activity_mismatch", summary: inconsistentActivitySummary },
    { name: "ok_with_strong_reco", summary: inconsistentStableSummary }
  ];

  const outputs = cases.map(({ name, summary }) => {
    const v23Text = getGlobalSummaryText(summary);
    const v24Text = getConsistentGlobalSummaryText(summary);

    console.log(`[AtlasMind][Consistency][${name}] v23:`, v23Text);
    console.log(`[AtlasMind][Consistency][${name}] v24:`, v24Text);

    return {
      name,
      v23Text,
      v24Text
    };
  });

  return {
    cases: outputs
  };
}
