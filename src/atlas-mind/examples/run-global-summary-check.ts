import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary, getGlobalSummaryText } from "../decision-global-summary";

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
    weightedRecentScore: decision === "flag" ? 2.5 : decision === "watch" ? 1.4 : decision === "log" ? 0.8 : 0,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

/**
 * Test manuel v23:
 * - Cas normal: plusieurs decisions et motifs
 * - Cas faible: peu de donnees
 */
export function runAtlasMindV23GlobalSummaryExample() {
  const richLogs: DecisionLogEntry[] = [
    makeLog("Paris", "flag", 1000),
    makeLog("Paris", "flag", 1001),
    makeLog("Paris", "watch", 1002),
    makeLog("Paris", "flag", 1003),
    makeLog("Paris", "watch", 1004),
    makeLog("Paris", "flag", 1005),
    makeLog("Paris", "flag", 1006),
    makeLog("Tokyo", "log", 1007),
    makeLog("Lagos", "log", 1008),
    makeLog("Paris", "flag", 1009)
  ];

  const sparseLogs: DecisionLogEntry[] = [makeLog("Paris", "ignore", 2000)];

  const richSummary = getGlobalSummary(richLogs);
  const richText = getGlobalSummaryText(richSummary);

  const sparseSummary = getGlobalSummary(sparseLogs);
  const sparseText = getGlobalSummaryText(sparseSummary);

  console.log("[AtlasMind][GlobalSummary] Rich structured:", richSummary);
  console.log("[AtlasMind][GlobalSummary] Rich text:", richText);

  console.log("[AtlasMind][GlobalSummary] Sparse structured:", sparseSummary);
  console.log("[AtlasMind][GlobalSummary] Sparse text:", sparseText);

  return {
    richSummary,
    richText,
    sparseSummary,
    sparseText
  };
}
