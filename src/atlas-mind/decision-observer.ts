import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import { analysisConfig } from "./decision-config";
import {
  getDecisionCounts,
  getRecentFlags,
  getRecentWatches,
  type DecisionCounts
} from "./decision-log-reader";

export type ActivityLevel = "low" | "medium" | "high";

export interface TopCityOverview {
  city: string;
  total: number;
  significant: number;
}

export interface SystemOverview {
  totalDecisions: number;
  counts: DecisionCounts;
  activityLevel: ActivityLevel;
  topCities: TopCityOverview[];
  recentFlagsCount: number;
  recentWatchesCount: number;
}

function sourceLogs(logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  return logs ?? getRecentDecisionLogs(analysisConfig.globalWindow);
}

function toActivityLevel(totalDecisions: number): ActivityLevel {
  if (totalDecisions < 5) {
    return "low";
  }

  if (totalDecisions < 15) {
    return "medium";
  }

  return "high";
}

function buildTopCities(logs: DecisionLogEntry[]): TopCityOverview[] {
  const grouped: Record<string, TopCityOverview> = {};

  for (const entry of logs) {
    const key = entry.city;
    const current = grouped[key] ?? { city: key, total: 0, significant: 0 };
    current.total += 1;
    if (entry.decision === "watch" || entry.decision === "flag") {
      current.significant += 1;
    }
    grouped[key] = current;
  }

  return Object.values(grouped)
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }

      if (right.significant !== left.significant) {
        return right.significant - left.significant;
      }

      return left.city.localeCompare(right.city);
    })
    .slice(0, 5);
}

export function getSystemOverview(logs?: DecisionLogEntry[]): SystemOverview {
  const entries = sourceLogs(logs);
  const counts = getDecisionCounts(entries);

  return {
    totalDecisions: entries.length,
    counts,
    activityLevel: toActivityLevel(entries.length),
    topCities: buildTopCities(entries),
    recentFlagsCount: getRecentFlags(20, entries).length,
    recentWatchesCount: getRecentWatches(20, entries).length
  };
}

export function getSystemOverviewText(summary: SystemOverview): string {
  const activityLabel =
    summary.activityLevel === "high"
      ? "elevee"
      : summary.activityLevel === "medium"
        ? "moderee"
        : "faible";

  const significant = summary.recentFlagsCount + summary.recentWatchesCount;
  const topCity = summary.topCities[0]?.city ?? "aucune ville dominante";

  return `Activite ${activityLabel}. ${significant} signaux significatifs recents (watch+flag). Ville la plus active: ${topCity}.`;
}

export function getCityDecisionSummary(city: string, logs?: DecisionLogEntry[]): TopCityOverview {
  const entries = sourceLogs(logs).filter(
    (entry) => entry.city.toLowerCase() === city.trim().toLowerCase()
  );

  return {
    city,
    total: entries.length,
    significant: entries.filter((entry) => entry.decision === "watch" || entry.decision === "flag")
      .length
  };
}
