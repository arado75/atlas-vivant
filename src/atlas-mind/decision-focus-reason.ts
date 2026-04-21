import type { DecisionLogEntry } from "./decision-log";
import type { GlobalSummary } from "./decision-global-summary";
import { buildMessageText } from "./decision-message-builder";
import {
  getDiscourseEvaluationForLegacyWrapper,
  type DiscourseEvaluation
} from "./decision-discourse-engine";
import { getFocusReason } from "./decision-focus-core";
import { getFocusLabelFromEvaluation } from "./decision-focus";

export type { FocusReason } from "./decision-focus-core";
export { getFocusReason } from "./decision-focus-core";

export function getFocusReasonFromEvaluation(evaluation: DiscourseEvaluation) {
  return evaluation.focusReason ?? getFocusReason(evaluation.summary);
}

export function getReasonedFocusedSummaryTextFromEvaluation(
  evaluation: DiscourseEvaluation
): string {
  if (!evaluation.emitted || !evaluation.messageParts) {
    return evaluation.text;
  }

  const focusReason = getFocusReasonFromEvaluation(evaluation);
  const focusLabel = getFocusLabelFromEvaluation(evaluation);

  return buildMessageText({
    ...evaluation.messageParts,
    focus: `${focusLabel}: ${focusReason.signal.value} (${focusReason.reason}).`
  });
}

export function getReasonedFocusedSummaryText(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): string {
  // Compat legacy: prefere `evaluateDiscourse(...)` + `getReasonedFocusedSummaryTextFromEvaluation(...)`.
  return getReasonedFocusedSummaryTextFromEvaluation(
    getDiscourseEvaluationForLegacyWrapper(summary, logs)
  );
}
