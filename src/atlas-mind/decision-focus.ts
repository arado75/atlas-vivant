import type { DecisionLogEntry } from "./decision-log";
import type { GlobalSummary } from "./decision-global-summary";
import { buildMessageText } from "./decision-message-builder";
import {
  getDiscourseEvaluationForLegacyWrapper,
  type DiscourseEvaluation
} from "./decision-discourse-engine";
import { getFocusSignal } from "./decision-focus-core";

export type { FocusSignal } from "./decision-focus-core";
export { getFocusSignal } from "./decision-focus-core";

export function getFocusFromEvaluation(evaluation: DiscourseEvaluation) {
  return evaluation.focus ?? getFocusSignal(evaluation.summary);
}

export function getFocusLabelFromEvaluation(evaluation: DiscourseEvaluation): string {
  return evaluation.focusStabilityLabel ?? "Point principal";
}

export function getFocusedSummaryTextFromEvaluation(evaluation: DiscourseEvaluation): string {
  if (!evaluation.emitted || !evaluation.messageParts) {
    return evaluation.text;
  }

  const focus = getFocusFromEvaluation(evaluation);
  const focusLabel = getFocusLabelFromEvaluation(evaluation);

  return buildMessageText({
    ...evaluation.messageParts,
    focus: `${focusLabel}: ${focus.value}.`
  });
}

export function getFocusedSummaryText(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): string {
  // Compat legacy: prefere `evaluateDiscourse(...)` + `getFocusedSummaryTextFromEvaluation(...)`.
  return getFocusedSummaryTextFromEvaluation(getDiscourseEvaluationForLegacyWrapper(summary, logs));
}
