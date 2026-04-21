import type { DecisionLogEntry } from "../decision-log";
import { getSystemTrends, getSystemTrendsText } from "../decision-trends";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 7.5 : 2.4,
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

function buildScenario(
  firstHalfDecisions: DecisionLogEntry["decision"][],
  secondHalfDecisions: DecisionLogEntry["decision"][]
): DecisionLogEntry[] {
  const firstHalf = firstHalfDecisions.map((decision, index) =>
    makeLog(index % 2 === 0 ? "Paris" : "Tokyo", decision, index)
  );

  const secondHalf = secondHalfDecisions.map((decision, index) =>
    makeLog(index % 2 === 0 ? "Paris" : "Tokyo", decision, 100 + index)
  );

  return [...firstHalf, ...secondHalf];
}

/**
 * Test manuel v18:
 * - A: flags en hausse (rising)
 * - B: flags en baisse (falling)
 * - C: flags stables (stable)
 */
export function runAtlasMindV18TrendsExample() {
  const risingLogs = buildScenario(
    ["ignore", "log", "watch"],
    ["flag", "flag", "watch", "flag", "log", "flag", "watch"]
  );

  const fallingLogs = buildScenario(
    ["flag", "flag", "watch", "flag", "log", "flag", "watch"],
    ["ignore", "log", "watch"]
  );

  const stableLogs = buildScenario(
    ["flag", "watch", "log", "ignore", "log"],
    ["flag", "watch", "log", "ignore", "log"]
  );

  const rising = getSystemTrends(risingLogs);
  const risingText = getSystemTrendsText(rising);

  const falling = getSystemTrends(fallingLogs);
  const fallingText = getSystemTrendsText(falling);

  const stable = getSystemTrends(stableLogs);
  const stableText = getSystemTrendsText(stable);

  console.log("[AtlasMind][Trends] Rising structured:", rising);
  console.log("[AtlasMind][Trends] Rising text:", risingText);

  console.log("[AtlasMind][Trends] Falling structured:", falling);
  console.log("[AtlasMind][Trends] Falling text:", fallingText);

  console.log("[AtlasMind][Trends] Stable structured:", stable);
  console.log("[AtlasMind][Trends] Stable text:", stableText);

  return {
    rising,
    risingText,
    falling,
    fallingText,
    stable,
    stableText
  };
}
