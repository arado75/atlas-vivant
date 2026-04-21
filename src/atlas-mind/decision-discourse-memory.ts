import type { DecisionLogEntry } from "./decision-log";
import type { GlobalSummary } from "./decision-global-summary";
import { buildMessageText, type MessageParts } from "./decision-message-builder";
import {
  clearDiscourseEngineState,
  getDiscourseEvaluationForLegacyWrapper,
  getDiscourseState,
  type DiscourseEvaluation,
  type DiscourseState
} from "./decision-discourse-engine";
import type { SpeechStateDecision } from "./decision-speech-state";

export type { DiscourseState } from "./decision-discourse-engine";

export type MemoryAwareDecision = {
  message: string;
  addedMemorySentence: string | null;
  discourseState: DiscourseState;
  speechDecision: SpeechStateDecision;
  messageParts: MessageParts | null;
};

export function clearDiscourseState(): void {
  clearDiscourseEngineState();
}

export function evaluateMemoryAwareSummaryTextFromEvaluation(
  evaluation: DiscourseEvaluation
): MemoryAwareDecision {
  const message =
    !evaluation.speechDecision.emitted || !evaluation.messageParts
      ? evaluation.text
      : buildMessageText({
          ...evaluation.messageParts,
          focus: undefined
        });

  return {
    message,
    addedMemorySentence: evaluation.memorySentence ?? null,
    discourseState: evaluation.discourseState,
    speechDecision: evaluation.speechDecision,
    messageParts: evaluation.messageParts
  };
}

export function evaluateMemoryAwareSummaryText(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): MemoryAwareDecision {
  // Compat legacy: prefere `evaluateDiscourse(...)` + `evaluateMemoryAwareSummaryTextFromEvaluation(...)`.
  return evaluateMemoryAwareSummaryTextFromEvaluation(
    getDiscourseEvaluationForLegacyWrapper(summary, logs)
  );
}

export function getMemoryAwareSummaryTextFromEvaluation(evaluation: DiscourseEvaluation): string {
  return evaluateMemoryAwareSummaryTextFromEvaluation(evaluation).message;
}

export function getMemoryAwareSummaryText(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): string {
  return evaluateMemoryAwareSummaryText(summary, logs).message;
}

export { getDiscourseState };
