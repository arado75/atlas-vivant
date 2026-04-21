import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import { getSystemAudit, type AuditStatus } from "./decision-auditor";
import { analysisConfig } from "./decision-config";

export type Trend = "rising" | "falling" | "stable";

export type SystemTrends = {
  statusTrend: Trend;
  activityTrend: Trend;
  flagTrend: Trend;
  watchTrend: Trend;
  dominantCityTrend?: Trend;
};

function sourceLogs(logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  return logs ?? getRecentDecisionLogs(analysisConfig.trendWindow);
}

function splitLogs(entries: DecisionLogEntry[]): {
  firstHalf: DecisionLogEntry[];
  secondHalf: DecisionLogEntry[];
} {
  if (entries.length <= 1) {
    return {
      firstHalf: entries,
      secondHalf: []
    };
  }

  const sorted = [...entries].sort((left, right) => left.timestampMs - right.timestampMs);
  const minTs = sorted[0].timestampMs;
  const maxTs = sorted[sorted.length - 1].timestampMs;
  const midpointTs = minTs + (maxTs - minTs) / 2;

  let firstHalf = sorted.filter((entry) => entry.timestampMs <= midpointTs);
  let secondHalf = sorted.filter((entry) => entry.timestampMs > midpointTs);

  if (firstHalf.length === 0 || secondHalf.length === 0) {
    const splitIndex = Math.floor(sorted.length / 2);
    firstHalf = sorted.slice(0, splitIndex);
    secondHalf = sorted.slice(splitIndex);
  }

  return {
    firstHalf,
    secondHalf
  };
}

function compareTrend(firstValue: number, secondValue: number): Trend {
  if (secondValue > firstValue) {
    return "rising";
  }

  if (secondValue < firstValue) {
    return "falling";
  }

  return "stable";
}

function countByDecision(logs: DecisionLogEntry[], decision: DecisionLogEntry["decision"]): number {
  return logs.filter((entry) => entry.decision === decision).length;
}

function statusToAlertCount(status: AuditStatus): number {
  return status === "alert" ? 1 : 0;
}

function getDominantCity(logs: DecisionLogEntry[]): string | null {
  if (logs.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.city, (counts.get(log.city) ?? 0) + 1);
  }

  let dominantCity: string | null = null;
  let dominantCount = 0;

  for (const [city, total] of counts.entries()) {
    if (total > dominantCount) {
      dominantCity = city;
      dominantCount = total;
    }
  }

  if (!dominantCity) {
    return null;
  }

  return dominantCount / logs.length > 0.5 ? dominantCity : null;
}

function computeDominantCityTrend(
  firstHalf: DecisionLogEntry[],
  secondHalf: DecisionLogEntry[]
): Trend {
  const firstDominant = getDominantCity(firstHalf);
  const secondDominant = getDominantCity(secondHalf);

  if (!firstDominant && !secondDominant) {
    return "stable";
  }

  if (!firstDominant && secondDominant) {
    return "rising";
  }

  if (firstDominant && !secondDominant) {
    return "falling";
  }

  return firstDominant === secondDominant ? "stable" : "rising";
}

export function getSystemTrends(logs?: DecisionLogEntry[]): SystemTrends {
  const entries = sourceLogs(logs);
  const { firstHalf, secondHalf } = splitLogs(entries);

  const firstAudit = getSystemAudit(firstHalf);
  const secondAudit = getSystemAudit(secondHalf);

  return {
    statusTrend: compareTrend(
      statusToAlertCount(firstAudit.status),
      statusToAlertCount(secondAudit.status)
    ),
    activityTrend: compareTrend(firstHalf.length, secondHalf.length),
    flagTrend: compareTrend(
      countByDecision(firstHalf, "flag"),
      countByDecision(secondHalf, "flag")
    ),
    watchTrend: compareTrend(
      countByDecision(firstHalf, "watch"),
      countByDecision(secondHalf, "watch")
    ),
    dominantCityTrend: computeDominantCityTrend(firstHalf, secondHalf)
  };
}

export function getSystemTrendsText(trends: SystemTrends): string {
  return `Activite ${trends.activityTrend}. Flags ${trends.flagTrend}. Watches ${trends.watchTrend}. Statut ${trends.statusTrend}. Dominance ville ${trends.dominantCityTrend ?? "stable"}.`;
}
