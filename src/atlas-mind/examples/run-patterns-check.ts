import type { DecisionLogEntry } from "../decision-log";
import { getSignalPatterns, getSignalPatternsText } from "../decision-patterns";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8 : 2.5,
    anomalyThresholdC: 2,
    persistenceLevel:
      decision === "flag" ? "high" : decision === "watch" ? "medium" : "none",
    persistenceCount: decision === "ignore" ? 0 : decision === "flag" ? 3 : 1,
    weightedRecentScore: decision === "ignore" ? 0 : decision === "flag" ? 2 : 1,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

/**
 * Test manuel v20:
 * - Cas A: motif repete -> detecte
 * - Cas B: motif unique -> ignore
 */
export function runAtlasMindV20PatternsExample() {
  const repeatedLogs: DecisionLogEntry[] = Array.from({ length: 10 }, (_, index) =>
    makeLog("Paris", "flag", index)
  );

  const uniqueLogs: DecisionLogEntry[] = [
    makeLog("Paris", "flag", 100),
    makeLog("Tokyo", "watch", 101),
    makeLog("Lagos", "log", 102),
    makeLog("Sydney", "ignore", 103)
  ];

  const repeated = getSignalPatterns(repeatedLogs);
  const repeatedText = getSignalPatternsText(repeated);

  const unique = getSignalPatterns(uniqueLogs);
  const uniqueText = getSignalPatternsText(unique);

  console.log("[AtlasMind][Patterns] Repeated structured:", repeated);
  console.log("[AtlasMind][Patterns] Repeated text:", repeatedText);

  console.log("[AtlasMind][Patterns] Unique structured:", unique);
  console.log("[AtlasMind][Patterns] Unique text:", uniqueText);

  return {
    repeated,
    repeatedText,
    unique,
    uniqueText
  };
}
