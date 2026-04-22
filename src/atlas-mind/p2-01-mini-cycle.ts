import {
  createWeatherAgent,
  DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C,
  type TemperatureCheckSnapshot
} from "./agents/weather-agent";
import { appendDecisionLog, type DecisionLogEntry } from "./decision-log";
import { triageSignal } from "./triage/triage-station";
import type { Evaluation, Signal, TriageOutcome } from "./types";

interface RunP201TemperatureMiniCycleOptions {
  thresholdC?: number;
  forceRefresh?: boolean;
  referenceMs?: number;
  activeLayerIds?: string[];
  selectedBrickId?: string;
  ingressType?: string;
}

export interface P201MiniCycleResult {
  source: "city_check" | "manual_signal";
  cityQuery?: string;
  snapshot: TemperatureCheckSnapshot | null;
  signal: Signal | null;
  evaluations: Evaluation[];
  score: number;
  triage: TriageOutcome;
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

function getDeltaImportance(deltaC: number): number {
  const absDelta = Math.abs(deltaC);
  if (absDelta >= 6) {
    return 2;
  }

  return 1;
}

function buildDeltaEvaluation(signal: Signal): Evaluation {
  const deltaC = readContextNumber(signal.context, "deltaC") ?? 0;
  const importance = getDeltaImportance(deltaC);

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.7,
    score: Math.min(1, signal.severity + 0.2),
    importance,
    rationale: `Ecart thermique detecte: ${deltaC.toFixed(2)}°C (importance ${importance}).`
  };
}

function buildDataQualityEvaluation(signal: Signal): Evaluation {
  const source = readContextString(signal.context, "source");
  const cityTemperatureC = readContextNumber(signal.context, "cityTemperatureC");
  const fieldTemperatureC = readContextNumber(signal.context, "fieldTemperatureC");
  const hasFiniteValues = cityTemperatureC !== null && fieldTemperatureC !== null;
  const importance = hasFiniteValues && source === "open-meteo" ? 1 : 0;

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: hasFiniteValues ? 0.68 : 0.4,
    score: hasFiniteValues ? 0.64 : 0.32,
    importance,
    rationale:
      importance > 0
        ? "Coherence source/valeurs validee (Open-Meteo + champ)."
        : "Qualite des donnees limitee (source ou valeurs partielles)."
  };
}

function totalImportance(evaluations: Evaluation[]): number {
  return evaluations.reduce((sum, evaluation) => sum + evaluation.importance, 0);
}

function buildDecisionLogEntry(
  result: P201MiniCycleResult,
  anomalyThresholdC: number,
  cityFallbackLabel: string,
  metadata: {
    activeLayerIds?: string[];
    selectedBrickId?: string;
    ingressType?: string;
  } = {}
): DecisionLogEntry {
  const cityId =
    result.snapshot?.cityId ??
    readContextString(result.signal?.context, "cityId") ??
    null;
  const city =
    result.snapshot?.cityLabel ??
    readContextString(result.signal?.context, "city") ??
    cityFallbackLabel;
  const deltaC = result.snapshot?.deltaC ?? readContextNumber(result.signal?.context, "deltaC");

  return {
    timestampMs: Date.now(),
    city,
    cityId,
    deltaC,
    routeId: "p2-01.temperature-mini-cycle",
    signalKind: result.signal?.kind ?? "temperature_anomaly",
    signalDomain: result.signal?.domain ?? "temperature",
    sourceType: result.snapshot?.source ?? readContextString(result.signal?.context, "source"),
    ingressType: metadata.ingressType ?? null,
    activeLayerIds: (metadata.activeLayerIds ?? readContextStringArray(result.signal?.context, "activeLayerIds")).slice(0, 16),
    selectedBrickId: metadata.selectedBrickId ?? readContextString(result.signal?.context, "selectedBrickId"),
    anomalyThresholdC,
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

function persistResult(
  result: P201MiniCycleResult,
  anomalyThresholdC: number,
  cityFallbackLabel: string,
  metadata: {
    activeLayerIds?: string[];
    selectedBrickId?: string;
    ingressType?: string;
  } = {}
): P201MiniCycleResult {
  appendDecisionLog(buildDecisionLogEntry(result, anomalyThresholdC, cityFallbackLabel, metadata));
  return result;
}

function runTriageForSignal(signal: Signal): { evaluations: Evaluation[]; score: number; triage: TriageOutcome } {
  const evaluations = [buildDeltaEvaluation(signal), buildDataQualityEvaluation(signal)];
  const score = totalImportance(evaluations);
  const triage = triageSignal({
    signal,
    evaluations
  });

  return {
    evaluations,
    score,
    triage
  };
}

export async function runP201TemperatureMiniCycle(
  cityQuery: string,
  options: RunP201TemperatureMiniCycleOptions = {}
): Promise<P201MiniCycleResult> {
  const anomalyThresholdC = options.thresholdC ?? DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C;
  const weatherAgent = createWeatherAgent({ anomalyThresholdC });
  const detection = await weatherAgent.detectTemperatureAnomaly(cityQuery, {
    thresholdC: anomalyThresholdC,
    forceRefresh: options.forceRefresh,
    referenceMs: options.referenceMs
  });

  if (!detection.snapshot) {
    return persistResult(
      {
        source: "city_check",
        cityQuery,
        snapshot: null,
        signal: null,
        evaluations: [],
        score: 0,
        triage: {
          decision: "ignore",
          reason: "Ville introuvable ou donnees temperature indisponibles."
        }
      },
      anomalyThresholdC,
      cityQuery,
      {
        activeLayerIds: options.activeLayerIds,
        selectedBrickId: options.selectedBrickId,
        ingressType: options.ingressType
      }
    );
  }

  if (!detection.signal) {
    return persistResult(
      {
        source: "city_check",
        cityQuery,
        snapshot: detection.snapshot,
        signal: null,
        evaluations: [],
        score: 0,
        triage: {
          decision: "ignore",
          reason: `Aucune anomalie: |delta|=${Math.abs(detection.snapshot.deltaC).toFixed(2)}°C <= seuil ${detection.snapshot.thresholdC.toFixed(2)}°C.`
        }
      },
      anomalyThresholdC,
      detection.snapshot.cityLabel,
      {
        activeLayerIds: options.activeLayerIds,
        selectedBrickId: options.selectedBrickId,
        ingressType: options.ingressType
      }
    );
  }

  const cycle = runTriageForSignal(detection.signal);

  return persistResult(
    {
      source: "city_check",
      cityQuery,
      snapshot: detection.snapshot,
      signal: detection.signal,
      evaluations: cycle.evaluations,
      score: cycle.score,
      triage: cycle.triage
    },
    anomalyThresholdC,
    detection.snapshot.cityLabel,
    {
      activeLayerIds: options.activeLayerIds,
      selectedBrickId: options.selectedBrickId,
      ingressType: options.ingressType
    }
  );
}

export function runP201MiniCycleFromSignal(
  signal: Signal,
  options: { anomalyThresholdC?: number } = {}
): P201MiniCycleResult {
  const anomalyThresholdC = options.anomalyThresholdC ?? DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C;
  const cycle = runTriageForSignal(signal);

  return persistResult(
    {
      source: "manual_signal",
      snapshot: null,
      signal,
      evaluations: cycle.evaluations,
      score: cycle.score,
      triage: cycle.triage
    },
    anomalyThresholdC,
    readContextString(signal.context, "city") ?? "signal manuel"
  );
}
