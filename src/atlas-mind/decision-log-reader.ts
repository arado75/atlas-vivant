import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import type { TriageDecision } from "./types";

export interface DecisionCounts {
  ignore: number;
  log: number;
  watch: number;
  flag: number;
}

export type CityDecisionCounts = Record<string, DecisionCounts>;

function emptyCounts(): DecisionCounts {
  return {
    ignore: 0,
    log: 0,
    watch: 0,
    flag: 0
  };
}

function clampLimit(limit: number, max = 200): number {
  return Math.max(0, Math.min(limit, max));
}

function normalizeCity(value: string): string {
  return value.trim().toLowerCase();
}

function isSignificantDecision(decision: TriageDecision): boolean {
  return decision === "watch" || decision === "flag";
}

function sourceLogs(logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  return logs ?? getRecentDecisionLogs(200);
}

export function getDecisionCounts(logs?: DecisionLogEntry[]): DecisionCounts {
  const counts = emptyCounts();

  for (const log of sourceLogs(logs)) {
    counts[log.decision] += 1;
  }

  return counts;
}

export function getDecisionCountsByCity(logs?: DecisionLogEntry[]): CityDecisionCounts {
  const grouped: CityDecisionCounts = {};

  for (const log of sourceLogs(logs)) {
    const key = log.city;
    const counts = grouped[key] ?? emptyCounts();
    counts[log.decision] += 1;
    grouped[key] = counts;
  }

  return grouped;
}

export function getRecentFlags(limit = 10, logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  const safeLimit = clampLimit(limit);
  if (safeLimit === 0) {
    return [];
  }

  return sourceLogs(logs)
    .filter((entry) => entry.decision === "flag")
    .slice(-safeLimit);
}

export function getRecentWatches(limit = 10, logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  const safeLimit = clampLimit(limit);
  if (safeLimit === 0) {
    return [];
  }

  return sourceLogs(logs)
    .filter((entry) => entry.decision === "watch")
    .slice(-safeLimit);
}

export function getLatestDecisionForCity(city: string, logs?: DecisionLogEntry[]): DecisionLogEntry | null {
  const target = normalizeCity(city);
  const entries = sourceLogs(logs);

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (normalizeCity(entry.city) === target || normalizeCity(entry.cityId ?? "") === target) {
      return entry;
    }
  }

  return null;
}

export function getLatestSignificantAnomalyForCity(
  city: string,
  logs?: DecisionLogEntry[]
): DecisionLogEntry | null {
  const target = normalizeCity(city);
  const entries = sourceLogs(logs);

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const sameCity = normalizeCity(entry.city) === target || normalizeCity(entry.cityId ?? "") === target;
    if (sameCity && isSignificantDecision(entry.decision)) {
      return entry;
    }
  }

  return null;
}