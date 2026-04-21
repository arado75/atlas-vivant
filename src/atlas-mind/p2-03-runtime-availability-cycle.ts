import { DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C } from "./agents/weather-agent";
import { appendDecisionLog, type DecisionLogEntry } from "./decision-log";
import { triageSignal } from "./triage/triage-station";
import type { Evaluation, Signal, TriageOutcome } from "./types";

export interface P203RuntimeAvailabilitySnapshot {
  available: boolean | null;
  consecutiveFailures: number;
  lastSuccessAgeMin: number | null;
  source: string | null;
}

export interface P203RuntimeAvailabilityCycleResult {
  source: "runtime_availability_signal";
  signal: Signal;
  snapshot: P203RuntimeAvailabilitySnapshot;
  evaluations: Evaluation[];
  score: number;
  triage: TriageOutcome;
}

function readContextBoolean(context: Record<string, unknown> | undefined, key: string): boolean | null {
  if (!context) {
    return null;
  }

  const raw = context[key];
  return typeof raw === "boolean" ? raw : null;
}

function readContextNumber(context: Record<string, unknown> | undefined, key: string): number | null {
  if (!context) {
    return null;
  }

  const numeric = Number(context[key]);
  return Number.isFinite(numeric) ? numeric : null;
}

function readContextString(context: Record<string, unknown> | undefined, key: string): string | null {
  if (!context) {
    return null;
  }

  const raw = context[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function getAvailabilityImportance(available: boolean | null, consecutiveFailures: number): number {
  if (available === true) {
    return 0;
  }

  if (available === false) {
    return consecutiveFailures >= 3 ? 2 : 1;
  }

  return 0;
}

function getFreshnessImportance(lastSuccessAgeMin: number | null): number {
  if (lastSuccessAgeMin === null) {
    return 0;
  }

  if (lastSuccessAgeMin >= 120) {
    return 2;
  }

  if (lastSuccessAgeMin >= 30) {
    return 1;
  }

  return 0;
}

function buildAvailabilityEvaluation(signal: Signal, snapshot: P203RuntimeAvailabilitySnapshot): Evaluation {
  const importance = getAvailabilityImportance(snapshot.available, snapshot.consecutiveFailures);

  if (snapshot.available === true) {
    return {
      signalId: signal.id,
      evaluatorRole: "observer",
      createdAtMs: Date.now(),
      confidence: 0.72,
      score: 0.25,
      importance,
      rationale: "Disponibilite runtime temperature confirmee."
    };
  }

  if (snapshot.available === false) {
    return {
      signalId: signal.id,
      evaluatorRole: "observer",
      createdAtMs: Date.now(),
      confidence: 0.7,
      score: Math.min(1, 0.45 + snapshot.consecutiveFailures * 0.1),
      importance,
      rationale: `Disponibilite runtime en echec (${snapshot.consecutiveFailures} echec(s) consecutif(s)).`
    };
  }

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.45,
    score: 0.3,
    importance,
    rationale: "Disponibilite runtime non explicitee dans le signal."
  };
}

function buildFreshnessEvaluation(signal: Signal, snapshot: P203RuntimeAvailabilitySnapshot): Evaluation {
  const importance = getFreshnessImportance(snapshot.lastSuccessAgeMin);

  if (snapshot.lastSuccessAgeMin === null) {
    return {
      signalId: signal.id,
      evaluatorRole: "observer",
      createdAtMs: Date.now(),
      confidence: 0.4,
      score: 0.28,
      importance,
      rationale: "Fraicheur runtime indisponible."
    };
  }

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.68,
    score: Math.min(1, 0.35 + snapshot.lastSuccessAgeMin / 180),
    importance,
    rationale: `Dernier succes runtime il y a ${snapshot.lastSuccessAgeMin.toFixed(1)} min.`
  };
}

function totalImportance(evaluations: Evaluation[]): number {
  return evaluations.reduce((sum, evaluation) => sum + evaluation.importance, 0);
}

function buildSnapshot(signal: Signal): P203RuntimeAvailabilitySnapshot {
  return {
    available: readContextBoolean(signal.context, "available"),
    consecutiveFailures: Math.max(0, Math.trunc(readContextNumber(signal.context, "consecutiveFailures") ?? 0)),
    lastSuccessAgeMin: readContextNumber(signal.context, "lastSuccessAgeMin"),
    source: readContextString(signal.context, "runtimeSource") ?? readContextString(signal.context, "source")
  };
}

function buildDecisionLogEntry(result: P203RuntimeAvailabilityCycleResult): DecisionLogEntry {
  return {
    timestampMs: Date.now(),
    city: "runtime:temperature-availability",
    cityId: "runtime.temperature.availability",
    deltaC: null,
    anomalyThresholdC: DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C,
    persistenceLevel: "none",
    persistenceCount: 0,
    weightedRecentScore: 0,
    evaluations: result.evaluations.map((evaluation) => ({
      evaluatorRole: evaluation.evaluatorRole,
      importance: evaluation.importance,
      confidence: evaluation.confidence,
      score: evaluation.score,
      rationale: evaluation.rationale
    })),
    score: result.score,
    decision: result.triage.decision,
    reason: result.triage.reason
  };
}

export function runP203RuntimeAvailabilityCycleFromSignal(signal: Signal): P203RuntimeAvailabilityCycleResult {
  const snapshot = buildSnapshot(signal);
  const evaluations = [buildAvailabilityEvaluation(signal, snapshot), buildFreshnessEvaluation(signal, snapshot)];
  const score = totalImportance(evaluations);
  const triage = triageSignal({
    signal,
    evaluations
  });

  const result: P203RuntimeAvailabilityCycleResult = {
    source: "runtime_availability_signal",
    signal,
    snapshot,
    evaluations,
    score,
    triage
  };

  appendDecisionLog(buildDecisionLogEntry(result));
  return result;
}