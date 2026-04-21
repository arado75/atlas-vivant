import {
  appendDecisionLog,
  clearDecisionLogs,
  getRecentDecisionLogs,
  type DecisionLogEntry
} from "../decision-log";
import { analysisConfig } from "../decision-config";
import { getSystemOverview } from "../decision-observer";
import { getSystemTrends } from "../decision-trends";
import { getSignalPatterns } from "../decision-patterns";
import { getSignalCorrelations } from "../decision-correlation";

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

function deepEqual<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function seedLogs(): void {
  clearDecisionLogs();

  const cities = ["Paris", "Tokyo", "Lagos", "Sydney", "Mexico", "Cairo", "London"];
  const decisions: DecisionLogEntry["decision"][] = [
    "flag",
    "watch",
    "log",
    "ignore",
    "watch",
    "flag",
    "log",
    "watch",
    "ignore",
    "flag"
  ];

  let ts = 1_000;
  for (let index = 0; index < 60; index += 1) {
    const city = cities[index % cities.length];
    const decision = decisions[index % decisions.length];
    appendDecisionLog(makeLog(city, decision, ts + index));
  }
}

/**
 * Test manuel R3:
 * - affiche config centralisee
 * - compare sorties "current" vs "legacy hardcoded windows"
 */
export function runAtlasMindConfigCheck() {
  seedLogs();

  const currentOverview = getSystemOverview();
  const legacyOverview = getSystemOverview(getRecentDecisionLogs(200));

  const currentTrends = getSystemTrends();
  const legacyTrends = getSystemTrends(getRecentDecisionLogs(10));

  const currentPatterns = getSignalPatterns();
  const legacyPatterns = getSignalPatterns(getRecentDecisionLogs(10));

  const currentCorrelations = getSignalCorrelations();
  const legacyCorrelations = getSignalCorrelations(getRecentDecisionLogs(10));

  const checks = {
    overview: deepEqual(currentOverview, legacyOverview),
    trends: deepEqual(currentTrends, legacyTrends),
    patterns: deepEqual(currentPatterns, legacyPatterns),
    correlations: deepEqual(currentCorrelations, legacyCorrelations)
  };

  console.log("[AtlasMind][Config] analysisConfig=", analysisConfig);
  console.log("[AtlasMind][Config] checks=", checks);

  clearDecisionLogs();

  return {
    analysisConfig,
    checks,
    current: {
      overview: currentOverview,
      trends: currentTrends,
      patterns: currentPatterns,
      correlations: currentCorrelations
    },
    legacy: {
      overview: legacyOverview,
      trends: legacyTrends,
      patterns: legacyPatterns,
      correlations: legacyCorrelations
    }
  };
}
