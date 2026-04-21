import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import { getDecisionCounts } from "./decision-log-reader";
import { getSystemOverview } from "./decision-observer";

export type AuditStatus = "ok" | "watch" | "alert";

export type AuditIssueType =
  | "no_significant_activity"
  | "too_many_flags"
  | "city_dominance"
  | "low_activity"
  | "high_activity"
  | "no_escalation";

export interface AuditIssue {
  type: AuditIssueType;
  message: string;
}

export interface SystemAudit {
  status: AuditStatus;
  issues: AuditIssue[];
}

function sourceLogs(logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  return logs ?? getRecentDecisionLogs(200);
}

function isAlertIssue(type: AuditIssueType): boolean {
  return type === "too_many_flags" || type === "city_dominance";
}

export function getSystemAudit(logs?: DecisionLogEntry[]): SystemAudit {
  const entries = sourceLogs(logs);
  const counts = getDecisionCounts(entries);
  const overview = getSystemOverview(entries);
  const issues: AuditIssue[] = [];

  const total = overview.totalDecisions;
  const significant = counts.watch + counts.flag;

  if (total < 3) {
    issues.push({
      type: "low_activity",
      message: "Activite tres faible: moins de 3 decisions sur la fenetre lue."
    });
  }

  if (total >= 30) {
    issues.push({
      type: "high_activity",
      message: "Activite elevee: volume important de decisions recentes."
    });
  }

  if (significant === 0) {
    issues.push({
      type: "no_significant_activity",
      message: "Aucun signal significatif detecte (watch/flag)."
    });
  }

  if (total >= 4 && counts.flag / total > 0.5) {
    issues.push({
      type: "too_many_flags",
      message: "Ratio de flags > 50%: escalades potentiellement excessives."
    });
  }

  const topCity = overview.topCities[0];
  if (topCity && total >= 4 && topCity.total / total > 0.5) {
    issues.push({
      type: "city_dominance",
      message: `Concentration forte: ${topCity.city} represente plus de 50% des decisions.`
    });
  }

  if (counts.flag === 0 && counts.watch >= 3) {
    issues.push({
      type: "no_escalation",
      message: "Plusieurs watches sans flag: verifier la logique d'escalade."
    });
  }

  if (issues.length === 0) {
    return {
      status: "ok",
      issues
    };
  }

  const hasAlert = issues.some((issue) => isAlertIssue(issue.type));
  return {
    status: hasAlert ? "alert" : "watch",
    issues
  };
}

export function getSystemAuditText(audit: SystemAudit): string {
  if (audit.issues.length === 0) {
    return "Systeme stable. Aucun desequilibre detecte.";
  }

  if (audit.status === "alert") {
    return `Desequilibre detecte: ${audit.issues.map((issue) => issue.type).join(", ")}.`;
  }

  return `Surveillance recommandee: ${audit.issues.map((issue) => issue.type).join(", ")}.`;
}