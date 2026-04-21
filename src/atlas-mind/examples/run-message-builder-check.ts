import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary } from "../decision-global-summary";
import { getTemporalNarrative } from "../decision-temporal-consistency";
import {
  buildMessageParts,
  buildMessageText
} from "../decision-message-builder";
import { clearSpeechState } from "../decision-speech-state";
import {
  clearDiscourseState,
  evaluateMemoryAwareSummaryText
} from "../decision-discourse-memory";
import { getFocusReason, getReasonedFocusedSummaryText } from "../decision-focus-reason";

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

function buildConcentratedAlertLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "flag", startTs + 0),
    makeLog("Paris", "flag", startTs + 1),
    makeLog("Paris", "flag", startTs + 2),
    makeLog("Paris", "flag", startTs + 3),
    makeLog("Tokyo", "log", startTs + 4),
    makeLog("Lagos", "log", startTs + 5)
  ];
}

function buildDistributedAlertLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "flag", startTs + 0),
    makeLog("Tokyo", "flag", startTs + 1),
    makeLog("Lagos", "flag", startTs + 2),
    makeLog("Sydney", "flag", startTs + 3),
    makeLog("Mexico", "log", startTs + 4),
    makeLog("Cairo", "log", startTs + 5)
  ];
}

function resetState(): void {
  clearSpeechState();
  clearDiscourseState();
}

function composeWithBuilder(summary: ReturnType<typeof getGlobalSummary>, logs: DecisionLogEntry[]) {
  const memoryDecision = evaluateMemoryAwareSummaryText(summary, logs);

  if (!memoryDecision.speechDecision.emitted) {
    return memoryDecision.message;
  }

  const temporal = getTemporalNarrative(summary, logs).phrase;
  const focusReason = getFocusReason(summary);
  const parts = buildMessageParts(summary, {
    temporal,
    memory: memoryDecision.addedMemorySentence ?? undefined,
    focus: `Point principal: ${focusReason.signal.value} (${focusReason.reason}).`
  });

  return buildMessageText(parts);
}

/**
 * Test manuel R2:
 * - compare sortie API actuelle vs composition directe builder
 * - cas 1: emission initiale
 * - cas 2: emission suivante avec memoire de discours
 */
export function runAtlasMindMessageBuilderCheck() {
  const logsA = buildConcentratedAlertLogs(1000);
  const logsB = buildDistributedAlertLogs(2000);

  const summaryA = getGlobalSummary(logsA);
  const summaryB = getGlobalSummary(logsB);

  resetState();
  const previousA = getReasonedFocusedSummaryText(summaryA, logsA);
  const previousB = getReasonedFocusedSummaryText(summaryB, logsB);

  resetState();
  const builderA = composeWithBuilder(summaryA, logsA);
  const builderB = composeWithBuilder(summaryB, logsB);

  const identicalA = previousA === builderA;
  const identicalB = previousB === builderB;

  console.log("[AtlasMind][MessageBuilder][A] ancien=", previousA);
  console.log("[AtlasMind][MessageBuilder][A] nouveau=", builderA);
  console.log("[AtlasMind][MessageBuilder][A] identical=", identicalA);

  console.log("[AtlasMind][MessageBuilder][B] ancien=", previousB);
  console.log("[AtlasMind][MessageBuilder][B] nouveau=", builderB);
  console.log("[AtlasMind][MessageBuilder][B] identical=", identicalB);

  return {
    caseA: {
      previous: previousA,
      next: builderA,
      identical: identicalA
    },
    caseB: {
      previous: previousB,
      next: builderB,
      identical: identicalB
    }
  };
}
