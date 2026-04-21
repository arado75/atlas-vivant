import type { GlobalSummary } from "./decision-global-summary";
import type { SystemOverview } from "./decision-observer";
import type { AuditIssueType } from "./decision-auditor";

export type MessageParts = {
  status: string;
  severity?: string;
  memory?: string;
  temporal?: string;
  activity?: string;
  issues?: string;
  recommendations?: string;
  patterns?: string;
  focus?: string;
};

export type MessageBuildOptions = {
  temporal?: string;
  focus?: string;
  memory?: string;
};

function hasIssue(summary: GlobalSummary, issueType: AuditIssueType): boolean {
  return summary.audit.issues.some((issue) => issue.type === issueType);
}

function toActivityLabel(level: SystemOverview["activityLevel"]): string {
  if (level === "high") {
    return "elevee";
  }

  if (level === "medium") {
    return "moderee";
  }

  return "faible";
}

function buildStatusParts(summary: GlobalSummary): Pick<MessageParts, "status" | "severity"> {
  if (summary.status === "alert") {
    return {
      status: "Etat global: alert.",
      severity: "Des desequilibres importants sont detectes."
    };
  }

  const hasStrongRecommendation = summary.recommendations.recommendations.some(
    (recommendation) => recommendation.priority === "high"
  );

  if (summary.status === "ok" && hasStrongRecommendation) {
    return {
      status: "Etat global: globalement stable, avec des points de vigilance."
    };
  }

  if (summary.status === "watch") {
    return {
      status: "Etat global: watch.",
      severity: "Une surveillance active est recommandee."
    };
  }

  return {
    status: "Etat global: ok.",
    severity: "Situation stable."
  };
}

function buildActivityText(summary: GlobalSummary): string {
  const isLowActivity = summary.overview.activityLevel === "low";
  const isHighActivity = summary.overview.activityLevel === "high";
  const hasHighActivityIssue = hasIssue(summary, "high_activity");
  const hasLowActivityIssue = hasIssue(summary, "low_activity");

  if (isLowActivity && hasHighActivityIssue) {
    return "Activite globalement faible, avec quelques pics d'activite detectes.";
  }

  if (isHighActivity && hasLowActivityIssue) {
    return "Activite globalement elevee, avec des phases creuses ponctuelles.";
  }

  return `Activite ${toActivityLabel(summary.overview.activityLevel)} (${summary.trends.activityTrend}).`;
}

function buildIssuesText(summary: GlobalSummary): string {
  if (summary.audit.issues.length === 0) {
    return "Aucune derive detectee.";
  }

  return `Derives: ${summary.audit.issues.map((issue) => issue.type).join(", ")}.`;
}

function buildRecommendationsText(summary: GlobalSummary): string {
  const recommendations = summary.recommendations.recommendations;

  if (recommendations.length === 0) {
    return "Aucune recommandation.";
  }

  const nonNeutral = recommendations.filter(
    (recommendation) => recommendation.type !== "no_action_needed"
  );

  if (nonNeutral.length === 0) {
    return "Aucune action necessaire.";
  }

  if (summary.status === "ok") {
    return `Points de vigilance: ${nonNeutral
      .map((recommendation) => recommendation.type)
      .join(", ")}.`;
  }

  return `Recommandations: ${nonNeutral
    .map((recommendation) => recommendation.type)
    .join(", ")}.`;
}

function buildPatternsText(summary: GlobalSummary): string {
  if (summary.topPatterns.length === 0) {
    return "Aucun motif dominant confirme pour l'instant.";
  }

  return `Motifs dominants: ${summary.topPatterns
    .map((pattern) => pattern.pattern.join(" -> "))
    .join("; ")}.`;
}

function normalizeSentence(text: string | undefined): string | null {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

export function buildMessageParts(
  summary: GlobalSummary,
  options: MessageBuildOptions = {}
): MessageParts {
  const statusParts = buildStatusParts(summary);

  return {
    status: statusParts.status,
    severity: statusParts.severity,
    memory: options.memory,
    temporal: options.temporal,
    activity: buildActivityText(summary),
    issues: buildIssuesText(summary),
    recommendations: buildRecommendationsText(summary),
    patterns: buildPatternsText(summary),
    focus: options.focus
  };
}

export function buildMessageText(parts: MessageParts): string {
  const ordered = [
    parts.status,
    parts.memory,
    parts.severity,
    parts.temporal,
    parts.activity,
    parts.issues,
    parts.recommendations,
    parts.patterns,
    parts.focus
  ]
    .map((part) => normalizeSentence(part))
    .filter((part): part is string => Boolean(part));

  return ordered.join(" ");
}

export function getStructuredMessage(
  summary: GlobalSummary,
  options: MessageBuildOptions = {}
): string {
  const parts = buildMessageParts(summary, options);
  return buildMessageText(parts);
}
