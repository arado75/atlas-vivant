import type { GlobalSummary } from "./decision-global-summary";
import type { AuditIssueType } from "./decision-auditor";

export type FocusSignal = {
  type: "issue" | "recommendation" | "pattern" | "status";
  value: string;
};

export type FocusReason = {
  signal: FocusSignal;
  reason: string;
};

const CRITICAL_ISSUES_PRIORITY: AuditIssueType[] = ["too_many_flags", "city_dominance"];

function pickCriticalIssue(summary: GlobalSummary): FocusSignal | null {
  const issueSet = new Set(summary.audit.issues.map((issue) => issue.type));

  for (const issueType of CRITICAL_ISSUES_PRIORITY) {
    if (issueSet.has(issueType)) {
      return {
        type: "issue",
        value: issueType
      };
    }
  }

  return null;
}

function pickHighRecommendation(summary: GlobalSummary): FocusSignal | null {
  const highRecommendation = summary.recommendations.recommendations.find(
    (recommendation) => recommendation.priority === "high"
  );

  if (!highRecommendation) {
    return null;
  }

  return {
    type: "recommendation",
    value: highRecommendation.type
  };
}

function pickTopPattern(summary: GlobalSummary): FocusSignal | null {
  const topPattern = summary.topPatterns[0];
  if (!topPattern) {
    return null;
  }

  return {
    type: "pattern",
    value: topPattern.pattern.join(" -> ")
  };
}

function resolveIssueReason(issueType: string): string {
  if (issueType === "too_many_flags" || issueType === "city_dominance") {
    return "derive critique";
  }

  return "derive principale detectee";
}

function resolveReason(signal: FocusSignal): string {
  switch (signal.type) {
    case "issue":
      return resolveIssueReason(signal.value);
    case "recommendation":
      return "recommandation prioritaire";
    case "pattern":
      return "motif dominant";
    default:
      return "aucun signal plus fort disponible";
  }
}

export function getFocusSignal(summary: GlobalSummary): FocusSignal {
  const issueSignal = pickCriticalIssue(summary);
  if (issueSignal) {
    return issueSignal;
  }

  const recommendationSignal = pickHighRecommendation(summary);
  if (recommendationSignal) {
    return recommendationSignal;
  }

  const patternSignal = pickTopPattern(summary);
  if (patternSignal) {
    return patternSignal;
  }

  return {
    type: "status",
    value: summary.status
  };
}

export function getFocusReason(summary: GlobalSummary): FocusReason {
  const signal = getFocusSignal(summary);
  return {
    signal,
    reason: resolveReason(signal)
  };
}
