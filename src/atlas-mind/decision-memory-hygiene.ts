import type { RecommendationPriority } from "./decision-advisor";

export interface PersistedRecommendationState {
  weight: number;
  priority: RecommendationPriority;
  message: string;
  lastSeenRun: number;
  occurrences: number;
}

export interface DecisionMemorySnapshot {
  version: number;
  run: number;
  data: Record<string, PersistedRecommendationState>;
}

export interface MemoryHygieneReport {
  removed: number;
  corrected: number;
  kept: number;
}

const MEMORY_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isValidPriority(value: unknown): value is RecommendationPriority {
  return value === "low" || value === "medium" || value === "high";
}

function toNonNegativeNumber(value: unknown, fallback = 0): { value: number; corrected: boolean } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: fallback, corrected: true };
  }

  if (value < 0) {
    return { value: 0, corrected: true };
  }

  return { value, corrected: false };
}

function normalizeEntry(
  rawEntry: unknown
): { entry: PersistedRecommendationState | null; corrected: boolean; removed: boolean } {
  if (!isObject(rawEntry)) {
    return { entry: null, corrected: false, removed: true };
  }

  const priority = rawEntry.priority;
  const message = typeof rawEntry.message === "string" ? rawEntry.message.trim() : "";
  const weightInfo = toNonNegativeNumber(rawEntry.weight);

  if (!isValidPriority(priority) || message.length === 0 || weightInfo.value <= 0) {
    return {
      entry: null,
      corrected: weightInfo.corrected,
      removed: true
    };
  }

  const occurrencesInfo = toNonNegativeNumber(rawEntry.occurrences);
  const lastSeenRunInfo = toNonNegativeNumber(rawEntry.lastSeenRun);

  const corrected =
    weightInfo.corrected ||
    occurrencesInfo.corrected ||
    lastSeenRunInfo.corrected ||
    (rawEntry.message !== message);

  return {
    entry: {
      weight: weightInfo.value,
      priority,
      message,
      lastSeenRun: lastSeenRunInfo.value,
      occurrences: occurrencesInfo.value
    },
    corrected,
    removed: false
  };
}

export function compactMemory(memory: unknown): DecisionMemorySnapshot {
  return compactMemoryWithReport(memory).memory;
}

export function compactMemoryWithReport(memory: unknown): {
  memory: DecisionMemorySnapshot;
  report: MemoryHygieneReport;
} {
  let corrected = 0;
  let removed = 0;

  if (!isObject(memory)) {
    return {
      memory: {
        version: MEMORY_VERSION,
        run: 0,
        data: {}
      },
      report: {
        removed: 0,
        corrected: 1,
        kept: 0
      }
    };
  }

  const versionInfo = toNonNegativeNumber(memory.version, MEMORY_VERSION);
  const runInfo = toNonNegativeNumber(memory.run, 0);

  if (versionInfo.corrected || versionInfo.value === 0) {
    corrected += 1;
  }

  if (runInfo.corrected) {
    corrected += 1;
  }

  const rawData = memory.data;
  const data: Record<string, PersistedRecommendationState> = {};

  if (!isObject(rawData)) {
    corrected += 1;
  } else {
    for (const [type, rawEntry] of Object.entries(rawData)) {
      const normalized = normalizeEntry(rawEntry);
      if (normalized.removed || !normalized.entry) {
        removed += 1;
        continue;
      }

      if (normalized.corrected) {
        corrected += 1;
      }

      data[type] = normalized.entry;
    }
  }

  return {
    memory: {
      version: versionInfo.value > 0 ? versionInfo.value : MEMORY_VERSION,
      run: runInfo.value,
      data
    },
    report: {
      removed,
      corrected,
      kept: Object.keys(data).length
    }
  };
}

export function getMemoryHygieneReport(
  before: unknown,
  after: DecisionMemorySnapshot
): MemoryHygieneReport {
  const normalizedBefore = compactMemoryWithReport(before);
  const beforeKeys = Object.keys(normalizedBefore.memory.data).length;
  const kept = Object.keys(after.data).length;

  return {
    removed: Math.max(0, beforeKeys - kept) + normalizedBefore.report.removed,
    corrected: normalizedBefore.report.corrected,
    kept
  };
}
