import type { PersistenceLevel } from "./types";
export type { PersistenceLevel } from "./types";

export type FreshnessBand = "fresh" | "aging" | "stale";

export interface TemperatureMemoryEvent {
  timestampMs: number;
  deltaC: number;
  isAnomaly: boolean;
}

export interface EventFreshness {
  level: FreshnessBand;
  weight: number;
  ageMs: number;
}

export interface AnomalyPersistence {
  level: PersistenceLevel;
  count: number;
  freshness: {
    fresh: number;
    aging: number;
    stale: number;
  };
  weightedRecentScore: number;
}

const HISTORY_LIMIT_PER_CITY = 8;
const memoryByCity: Record<string, TemperatureMemoryEvent[]> = {};
const FRESH_WINDOW_MS = 30 * 60 * 1000;
const AGING_WINDOW_MS = 3 * 60 * 60 * 1000;

function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase();
}

export function getEventFreshness(event: TemperatureMemoryEvent, nowMs = Date.now()): EventFreshness {
  const ageMs = Math.max(0, nowMs - event.timestampMs);

  if (ageMs <= FRESH_WINDOW_MS) {
    return {
      level: "fresh",
      weight: 1,
      ageMs
    };
  }

  if (ageMs <= AGING_WINDOW_MS) {
    return {
      level: "aging",
      weight: 0.5,
      ageMs
    };
  }

  return {
    level: "stale",
    weight: 0.2,
    ageMs
  };
}

export function recordTemperatureEvent(city: string, event: TemperatureMemoryEvent): void {
  const key = normalizeCityKey(city);
  const history = memoryByCity[key] ?? [];
  const next = [...history, event].slice(-HISTORY_LIMIT_PER_CITY);
  memoryByCity[key] = next;
}

export function getTemperatureHistory(city: string): TemperatureMemoryEvent[] {
  const key = normalizeCityKey(city);
  return [...(memoryByCity[key] ?? [])];
}

export function getAnomalyPersistence(city: string, nowMs = Date.now()): AnomalyPersistence {
  const history = getTemperatureHistory(city);
  if (history.length === 0) {
    return {
      level: "none",
      count: 0,
      freshness: { fresh: 0, aging: 0, stale: 0 },
      weightedRecentScore: 0
    };
  }

  const recent = history.slice(-3);
  const anomalyRecent = recent.filter((entry) => entry.isAnomaly);
  const freshnessCounts = {
    fresh: 0,
    aging: 0,
    stale: 0
  };

  let weightedRecentScore = 0;
  for (const event of anomalyRecent) {
    const freshness = getEventFreshness(event, nowMs);
    freshnessCounts[freshness.level] += 1;
    weightedRecentScore += freshness.weight;
  }

  let recentConsecutive = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if (!event.isAnomaly) {
      break;
    }

    const freshness = getEventFreshness(event, nowMs);
    if (freshness.level === "stale") {
      break;
    }

    recentConsecutive += 1;
  }

  if (recentConsecutive >= 3 && weightedRecentScore >= 2) {
    return {
      level: "high",
      count: recentConsecutive,
      freshness: freshnessCounts,
      weightedRecentScore
    };
  }

  if (weightedRecentScore >= 1.4 || (anomalyRecent.length >= 2 && freshnessCounts.fresh + freshnessCounts.aging >= 1)) {
    return {
      level: "medium",
      count: anomalyRecent.length,
      freshness: freshnessCounts,
      weightedRecentScore
    };
  }

  if (weightedRecentScore >= 0.4) {
    return {
      level: "low",
      count: anomalyRecent.length,
      freshness: freshnessCounts,
      weightedRecentScore
    };
  }

  return {
    level: "none",
    count: 0,
    freshness: freshnessCounts,
    weightedRecentScore
  };
}

export function resetTemperatureMemory(city?: string): void {
  if (!city) {
    for (const key of Object.keys(memoryByCity)) {
      delete memoryByCity[key];
    }
    return;
  }

  delete memoryByCity[normalizeCityKey(city)];
}

