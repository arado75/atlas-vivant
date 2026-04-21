import {
  compactMemory,
  compactMemoryWithReport,
  getMemoryHygieneReport,
  type DecisionMemorySnapshot
} from "../decision-memory-hygiene";

/**
 * Test manuel v17:
 * - A: weight = 0 -> suppression
 * - B: values negatives/invalides -> correction ou suppression
 * - C: entree valide > 0 -> conservation
 */
export function runAtlasMindV17MemoryHygieneExample() {
  const before: unknown = {
    version: 1,
    run: 7,
    data: {
      dead_zero: {
        weight: 0,
        priority: "medium",
        message: "obsolete",
        lastSeenRun: 4,
        occurrences: 1
      },
      invalid_negative: {
        weight: -3,
        priority: "medium",
        message: "broken",
        lastSeenRun: -4,
        occurrences: -2
      },
      invalid_priority: {
        weight: 2,
        priority: "critical",
        message: "unknown priority",
        lastSeenRun: 3,
        occurrences: 1
      },
      corrected_entry: {
        weight: 2,
        priority: "low",
        message: "   needs trim   ",
        lastSeenRun: -1,
        occurrences: -6
      },
      kept_valid: {
        weight: 3,
        priority: "high",
        message: "healthy",
        lastSeenRun: 6,
        occurrences: 2
      }
    }
  };

  const { memory: after, report } = compactMemoryWithReport(before);
  const recomputedReport = getMemoryHygieneReport(before, after);
  const compactOnly: DecisionMemorySnapshot = compactMemory(before);

  console.log("[AtlasMind][MemoryHygiene] Before:", before);
  console.log("[AtlasMind][MemoryHygiene] After:", after);
  console.log("[AtlasMind][MemoryHygiene] Report:", report);
  console.log("[AtlasMind][MemoryHygiene] Report (recomputed):", recomputedReport);
  console.log("[AtlasMind][MemoryHygiene] Compact only:", compactOnly);

  return {
    before,
    after,
    report,
    recomputedReport,
    compactOnly
  };
}
