import type { DecisionLogEntry } from "./decision-log";
import type { GlobalSummary } from "./decision-global-summary";
import { getStructuredMessage } from "./decision-message-builder";
import {
  getDiscourseEvaluationForLegacyWrapper,
  type DiscourseEvaluation
} from "./decision-discourse-engine";

export function getStructuredGlobalSummaryTextFromEvaluation(
  evaluation: DiscourseEvaluation
): string {
  return getStructuredMessage(evaluation.summary, {
    temporal: evaluation.temporalPhrase
  });
}

export function getStructuredGlobalSummaryText(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): string {
  // Compat legacy: prefere `evaluateDiscourse(...)` + `getStructuredGlobalSummaryTextFromEvaluation(...)`.
  return getStructuredGlobalSummaryTextFromEvaluation(
    getDiscourseEvaluationForLegacyWrapper(summary, logs)
  );
}
