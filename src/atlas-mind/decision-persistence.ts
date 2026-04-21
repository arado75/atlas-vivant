import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  compactMemory,
  getMemoryHygieneReport,
  type DecisionMemorySnapshot,
  type PersistedRecommendationState
} from "./decision-memory-hygiene";

export type { DecisionMemorySnapshot, PersistedRecommendationState };

const MEMORY_DIR = "./data";
export const ATLAS_MEMORY_FILE_PATH = "./data/atlas-memory.json";

const EMPTY_MEMORY: DecisionMemorySnapshot = {
  version: 1,
  run: 0,
  data: {}
};

function ensureDirectory(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

export function saveMemory(memory: DecisionMemorySnapshot): void {
  const compacted = compactMemory(memory);
  ensureDirectory();
  writeFileSync(ATLAS_MEMORY_FILE_PATH, JSON.stringify(compacted, null, 2), "utf8");
}

export function loadMemory(): DecisionMemorySnapshot {
  ensureDirectory();

  if (!existsSync(ATLAS_MEMORY_FILE_PATH)) {
    saveMemory(EMPTY_MEMORY);
    return { ...EMPTY_MEMORY, data: {} };
  }

  try {
    const raw = readFileSync(ATLAS_MEMORY_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const compacted = compactMemory(parsed);

    const report = getMemoryHygieneReport(parsed, compacted);
    if (report.removed > 0 || report.corrected > 0) {
      saveMemory(compacted);
    }

    return compacted;
  } catch {
    saveMemory(EMPTY_MEMORY);
    return { ...EMPTY_MEMORY, data: {} };
  }
}

export function clearMemory(): void {
  saveMemory(EMPTY_MEMORY);
}
