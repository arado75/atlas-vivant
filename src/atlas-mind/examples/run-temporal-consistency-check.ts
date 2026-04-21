import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary } from "../decision-global-summary";
import { getConsistentGlobalSummaryText } from "../decision-consistency";
import {
  getTemporalGlobalSummaryText,
  getTemporalNarrative
} from "../decision-temporal-consistency";

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

function buildAlertSegment(startTs: number, city = "Paris"): DecisionLogEntry[] {
  return [
    makeLog(city, "flag", startTs + 0),
    makeLog(city, "flag", startTs + 1),
    makeLog(city, "flag", startTs + 2),
    makeLog(city, "flag", startTs + 3)
  ];
}

function buildWatchSegment(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "ignore", startTs + 0),
    makeLog("Tokyo", "ignore", startTs + 1),
    makeLog("Lagos", "ignore", startTs + 2),
    makeLog("Sydney", "ignore", startTs + 3)
  ];
}

function buildOkSegment(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "watch", startTs + 0),
    makeLog("Tokyo", "log", startTs + 1),
    makeLog("Lagos", "log", startTs + 2),
    makeLog("Sydney", "log", startTs + 3)
  ];
}

function runScenario(name: string, logs: DecisionLogEntry[]) {
  const summary = getGlobalSummary(logs);
  const v24Text = getConsistentGlobalSummaryText(summary);
  const v25Text = getTemporalGlobalSummaryText(summary, logs);
  const narrative = getTemporalNarrative(summary, logs);

  console.log(`[AtlasMind][Temporal][${name}] statuses:`, narrative.recentStatuses);
  console.log(`[AtlasMind][Temporal][${name}] v24:`, v24Text);
  console.log(`[AtlasMind][Temporal][${name}] v25:`, v25Text);

  return {
    name,
    recentStatuses: narrative.recentStatuses,
    v24Text,
    v25Text
  };
}

/**
 * Test manuel v25:
 * - amelioration
 * - degradation
 * - stabilite
 * - oscillation
 * Affiche v24 vs v25.
 */
export function runAtlasMindV25TemporalConsistencyExample() {
  const improvementLogs = [
    ...buildAlertSegment(1000, "Paris"),
    ...buildWatchSegment(2000),
    ...buildOkSegment(3000)
  ];

  const degradationLogs = [
    ...buildOkSegment(4000),
    ...buildWatchSegment(5000),
    ...buildAlertSegment(6000, "Paris")
  ];

  const stableLogs = [
    ...buildOkSegment(7000),
    ...buildOkSegment(8000),
    ...buildOkSegment(9000)
  ];

  const oscillationLogs = [
    ...buildAlertSegment(10000, "Paris"),
    ...buildWatchSegment(11000),
    ...buildAlertSegment(12000, "Paris")
  ];

  const results = [
    runScenario("improvement", improvementLogs),
    runScenario("degradation", degradationLogs),
    runScenario("stability", stableLogs),
    runScenario("oscillation", oscillationLogs)
  ];

  return { results };
}
