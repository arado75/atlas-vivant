import type { DecisionLogEntry } from "../decision-log";
import {
  getSignalCorrelations,
  getSignalCorrelationsText
} from "../decision-correlation";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 7.9 : 2.3,
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
 * Test manuel v19:
 * - Cas A: correlation repetee -> detectee
 * - Cas B: correlation unique -> ignoree (count < 2)
 */
export function runAtlasMindV19CorrelationExample() {
  const repeatedLogs: DecisionLogEntry[] = Array.from({ length: 10 }, (_, index) =>
    makeLog("Paris", "flag", index)
  );

  const uniqueLogs: DecisionLogEntry[] = [
    makeLog("Paris", "flag", 100),
    makeLog("Tokyo", "flag", 101),
    makeLog("Paris", "flag", 102),
    makeLog("Tokyo", "log", 103)
  ];

  const repeated = getSignalCorrelations(repeatedLogs);
  const repeatedText = getSignalCorrelationsText(repeated);

  const unique = getSignalCorrelations(uniqueLogs);
  const uniqueText = getSignalCorrelationsText(unique);

  console.log("[AtlasMind][Correlation] Repeated structured:", repeated);
  console.log("[AtlasMind][Correlation] Repeated text:", repeatedText);

  console.log("[AtlasMind][Correlation] Unique structured:", unique);
  console.log("[AtlasMind][Correlation] Unique text:", uniqueText);

  return {
    repeated,
    repeatedText,
    unique,
    uniqueText
  };
}
