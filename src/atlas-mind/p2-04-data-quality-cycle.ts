import { DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C } from "./agents/weather-agent";
import { appendDecisionLog, type DecisionLogEntry } from "./decision-log";
import { triageSignal } from "./triage/triage-station";
import type { Evaluation, Signal, TriageOutcome } from "./types";

export type DataQualityIssueCode =
  | "city_missing"
  | "source_type_incoherent"
  | "field_city_divergence_high"
  | "signal_quality_low"
  | "unknown";

export interface P204DataQualitySnapshot {
  city: string | null;
  cityId: string | null;
  sourceType: string | null;
  issueCode: DataQualityIssueCode;
  fieldCityDeltaC: number | null;
  runtimeAvailable: boolean | null;
}

export interface P204DataQualityCycleResult {
  source: "data_quality_signal";
  signal: Signal;
  snapshot: P204DataQualitySnapshot;
  evaluations: Evaluation[];
  score: number;
  triage: TriageOutcome;
}

function readContextString(context: Record<string, unknown> | undefined, key: string): string | null {
  if (!context) {
    return null;
  }

  const raw = context[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function readContextNumber(context: Record<string, unknown> | undefined, key: string): number | null {
  if (!context) {
    return null;
  }

  const numeric = Number(context[key]);
  return Number.isFinite(numeric) ? numeric : null;
}

function readContextBoolean(context: Record<string, unknown> | undefined, key: string): boolean | null {
  if (!context) {
    return null;
  }

  const raw = context[key];
  return typeof raw === "boolean" ? raw : null;
}

function readContextStringArray(context: Record<string, unknown> | undefined, key: string): string[] {
  if (!context) {
    return [];
  }

  const raw = context[key];
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toIssueCode(value: string | null): DataQualityIssueCode {
  if (value === "city_missing") {
    return value;
  }

  if (value === "source_type_incoherent") {
    return value;
  }

  if (value === "field_city_divergence_high") {
    return value;
  }

  if (value === "signal_quality_low") {
    return value;
  }

  return "unknown";
}

function computeIssueImportance(snapshot: P204DataQualitySnapshot): number {
  if (snapshot.issueCode === "field_city_divergence_high") {
    const absDelta = Math.abs(snapshot.fieldCityDeltaC ?? 0);
    if (absDelta >= 5) {
      return 2;
    }

    return absDelta >= 2 ? 1 : 0;
  }

  if (snapshot.issueCode === "city_missing" || snapshot.issueCode === "source_type_incoherent") {
    return 2;
  }

  if (snapshot.issueCode === "signal_quality_low") {
    return 1;
  }

  return 0;
}

function computeConsistencyImportance(snapshot: P204DataQualitySnapshot): number {
  if (snapshot.runtimeAvailable === false) {
    return 1;
  }

  if (snapshot.issueCode === "unknown") {
    return 0;
  }

  if (snapshot.city === null || snapshot.sourceType === null) {
    return 1;
  }

  return 0;
}

function buildIssueEvaluation(signal: Signal, snapshot: P204DataQualitySnapshot): Evaluation {
  const importance = computeIssueImportance(snapshot);

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.7,
    score: Math.min(1, 0.35 + importance * 0.25),
    importance,
    rationale: `Qualite temperature: issue=${snapshot.issueCode}.`
  };
}

function buildConsistencyEvaluation(signal: Signal, snapshot: P204DataQualitySnapshot): Evaluation {
  const importance = computeConsistencyImportance(snapshot);

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.66,
    score: Math.min(1, 0.3 + importance * 0.2),
    importance,
    rationale:
      importance > 0
        ? "Contexte qualite incomplet ou runtime fragile."
        : "Contexte qualite exploitable sans incoherence additionnelle."
  };
}

function buildSnapshot(signal: Signal): P204DataQualitySnapshot {
  return {
    city: readContextString(signal.context, "city"),
    cityId: readContextString(signal.context, "cityId"),
    sourceType: readContextString(signal.context, "sourceType"),
    issueCode: toIssueCode(readContextString(signal.context, "qualityIssueCode")),
    fieldCityDeltaC: readContextNumber(signal.context, "fieldCityDeltaC"),
    runtimeAvailable: readContextBoolean(signal.context, "runtimeAvailable")
  };
}

function totalImportance(evaluations: Evaluation[]): number {
  return evaluations.reduce((sum, evaluation) => sum + evaluation.importance, 0);
}

function buildDecisionLogEntry(result: P204DataQualityCycleResult): DecisionLogEntry {
  return {
    timestampMs: Date.now(),
    city: result.snapshot.city ?? "data-quality:unknown-city",
    cityId: result.snapshot.cityId,
    deltaC: result.snapshot.fieldCityDeltaC,
    routeId: "p2-04.temperature-data-quality-cycle",
    signalKind: result.signal.kind,
    signalDomain: result.signal.domain,
    sourceType: result.snapshot.sourceType,
    ingressType: readContextString(result.signal.context, "ingressType"),
    activeLayerIds: readContextStringArray(result.signal.context, "activeLayerIds").slice(0, 16),
    selectedBrickId: readContextString(result.signal.context, "selectedBrickId"),
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

export function runP204DataQualityCycleFromSignal(signal: Signal): P204DataQualityCycleResult {
  const snapshot = buildSnapshot(signal);
  const evaluations = [buildIssueEvaluation(signal, snapshot), buildConsistencyEvaluation(signal, snapshot)];
  const score = totalImportance(evaluations);
  const triage = triageSignal({
    signal,
    evaluations
  });

  const result: P204DataQualityCycleResult = {
    source: "data_quality_signal",
    signal,
    snapshot,
    evaluations,
    score,
    triage
  };

  appendDecisionLog(buildDecisionLogEntry(result));
  return result;
}
