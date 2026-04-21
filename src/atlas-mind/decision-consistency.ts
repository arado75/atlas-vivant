import type { GlobalSummary } from "./decision-global-summary";
import { getStructuredMessage } from "./decision-message-builder";

export function getConsistentGlobalSummaryText(summary: GlobalSummary): string {
  return getStructuredMessage(summary);
}
