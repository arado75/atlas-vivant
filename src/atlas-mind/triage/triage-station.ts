import type { PersistenceLevel, TriageInput, TriageOutcome } from "../types";

function totalImportance(input: TriageInput): number {
  return input.evaluations.reduce((sum, evaluation) => sum + evaluation.importance, 0);
}

function readDelta(signalContext: Record<string, unknown> | undefined): number {
  if (!signalContext) {
    return 0;
  }

  const delta = Number(signalContext.deltaC);
  return Number.isFinite(delta) ? Math.abs(delta) : 0;
}

function isPersistenceLevel(value: unknown): value is PersistenceLevel {
  return value === "none" || value === "low" || value === "medium" || value === "high";
}

function readPersistenceLevel(signalContext: Record<string, unknown> | undefined): PersistenceLevel {
  if (!signalContext) {
    return "none";
  }

  const level = signalContext.persistenceLevel;
  return isPersistenceLevel(level) ? level : "none";
}

export function triageSignal(input: TriageInput): TriageOutcome {
  const delta = readDelta(input.signal.context);
  if (delta > 7) {
    return {
      decision: "flag",
      reason: "Delta tres eleve (>7°C): flag direct."
    };
  }

  const persistenceLevel = readPersistenceLevel(input.signal.context);
  if (persistenceLevel === "high") {
    return {
      decision: "flag",
      reason: "Anomalie persistante high: flag direct."
    };
  }

  const score = totalImportance(input);

  if (score <= 0) {
    return {
      decision: "ignore",
      reason: "Score d'evaluation <= 0."
    };
  }

  if (score === 1) {
    return {
      decision: "log",
      reason: "Score faible (1): anomalie faible, journalisation."
    };
  }

  if (score === 2) {
    return {
      decision: "watch",
      reason: "Score modere (2): anomalie a surveiller."
    };
  }

  return {
    decision: "flag",
    reason: "Score >= 3: anomalie significative ou persistante."
  };
}
