import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary } from "../decision-global-summary";
import { evaluateDiscourse, clearDiscourseEngineState } from "../decision-discourse-engine";
import {
  getStructuredGlobalSummaryText,
  getStructuredGlobalSummaryTextFromEvaluation
} from "../decision-message-structure";
import { getFocusedSummaryText, getFocusedSummaryTextFromEvaluation } from "../decision-focus";
import {
  getReasonedFocusedSummaryText,
  getReasonedFocusedSummaryTextFromEvaluation
} from "../decision-focus-reason";
import {
  getMemoryAwareSummaryText,
  getMemoryAwareSummaryTextFromEvaluation
} from "../decision-discourse-memory";

type UsageResult = {
  structured: string;
  focused: string;
  reasoned: string;
  memoryAware: string;
};

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8.2 : decision === "watch" ? 3.2 : 1.4,
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

function buildAlertLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "flag", startTs + 1),
    makeLog("Paris", "flag", startTs + 2),
    makeLog("Tokyo", "watch", startTs + 3),
    makeLog("Lagos", "log", startTs + 4),
    makeLog("Sydney", "log", startTs + 5)
  ];
}

function runSingleEvaluationPath(summary: ReturnType<typeof getGlobalSummary>, logs: DecisionLogEntry[]): UsageResult {
  const evaluation = evaluateDiscourse(summary, logs);

  return {
    structured: getStructuredGlobalSummaryTextFromEvaluation(evaluation),
    focused: getFocusedSummaryTextFromEvaluation(evaluation),
    reasoned: getReasonedFocusedSummaryTextFromEvaluation(evaluation),
    memoryAware: getMemoryAwareSummaryTextFromEvaluation(evaluation)
  };
}

function runLegacyWrapperPath(summary: ReturnType<typeof getGlobalSummary>, logs: DecisionLogEntry[]): UsageResult {
  return {
    structured: getStructuredGlobalSummaryText(summary, logs),
    focused: getFocusedSummaryText(summary, logs),
    reasoned: getReasonedFocusedSummaryText(summary, logs),
    memoryAware: getMemoryAwareSummaryText(summary, logs)
  };
}

function compareUsage(single: UsageResult, legacy: UsageResult) {
  return {
    structured: single.structured === legacy.structured,
    focused: single.focused === legacy.focused,
    reasoned: single.reasoned === legacy.reasoned,
    memoryAware: single.memoryAware === legacy.memoryAware
  };
}

export function runAtlasMindDiscourseUsageCheck() {
  const logs = buildAlertLogs(90_000);
  const summary = getGlobalSummary(logs);

  clearDiscourseEngineState();
  const emittedSingle = runSingleEvaluationPath(summary, logs);

  clearDiscourseEngineState();
  const emittedLegacy = runLegacyWrapperPath(summary, logs);

  const emittedCoherence = compareUsage(emittedSingle, emittedLegacy);

  clearDiscourseEngineState();
  evaluateDiscourse(summary, logs);
  const silenceSingle = runSingleEvaluationPath(summary, logs);

  clearDiscourseEngineState();
  evaluateDiscourse(summary, logs);
  const silenceLegacy = runLegacyWrapperPath(summary, logs);

  const silenceCoherence = compareUsage(silenceSingle, silenceLegacy);

  console.log("\n[AtlasMind][DiscourseUsage] emitted");
  console.log("single:", emittedSingle);
  console.log("legacy:", emittedLegacy);
  console.log("coherence:", emittedCoherence);

  console.log("\n[AtlasMind][DiscourseUsage] silence");
  console.log("single:", silenceSingle);
  console.log("legacy:", silenceLegacy);
  console.log("coherence:", silenceCoherence);

  return {
    emitted: {
      single: emittedSingle,
      legacy: emittedLegacy,
      coherence: emittedCoherence,
      allCoherent: Object.values(emittedCoherence).every(Boolean)
    },
    silence: {
      single: silenceSingle,
      legacy: silenceLegacy,
      coherence: silenceCoherence,
      allCoherent: Object.values(silenceCoherence).every(Boolean)
    }
  };
}
