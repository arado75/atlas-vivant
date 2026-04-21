import {
  createWeatherAgent,
  DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C,
  type TemperatureCheckSnapshot
} from "./agents/weather-agent";
import {
  getAnomalyPersistence,
  recordTemperatureEvent,
  type AnomalyPersistence,
  type PersistenceLevel
} from "./temperature-memory";
import { appendDecisionLog, type DecisionLogEntry } from "./decision-log";
import { triageSignal } from "./triage/triage-station";
import type { Evaluation, EventTrigger, Signal, TriageOutcome } from "./types";

export interface MindSignalAgent {
  id: string;
  emitSignal: (trigger: EventTrigger) => Signal | null;
}

export interface MindEvaluationAgent {
  id: string;
  evaluateSignal: (signal: Signal) => Evaluation | null;
}

export interface OrchestrationResult {
  trigger: EventTrigger;
  signal: Signal | null;
  evaluations: Evaluation[];
  triage: TriageOutcome | null;
}

export interface TemperatureCheckResult {
  cityQuery: string;
  snapshot: TemperatureCheckSnapshot | null;
  persistence: AnomalyPersistence;
  signal: Signal | null;
  evaluations: Evaluation[];
  score: number;
  triage: TriageOutcome;
}

interface RunTemperatureCheckOptions {
  thresholdC?: number;
  forceRefresh?: boolean;
  referenceMs?: number;
}

const EMPTY_PERSISTENCE: AnomalyPersistence = {
  level: "none",
  count: 0,
  freshness: { fresh: 0, aging: 0, stale: 0 },
  weightedRecentScore: 0
};

export class AtlasMindOrchestrator {
  private readonly signalAgents: MindSignalAgent[] = [];

  private readonly evaluationAgents: MindEvaluationAgent[] = [];

  registerSignalAgent(agent: MindSignalAgent): void {
    this.signalAgents.push(agent);
  }

  registerEvaluationAgent(agent: MindEvaluationAgent): void {
    this.evaluationAgents.push(agent);
  }

  process(trigger: EventTrigger): OrchestrationResult {
    const signal = this.emitFirstSignal(trigger);
    if (!signal) {
      return {
        trigger,
        signal: null,
        evaluations: [],
        triage: null
      };
    }

    const evaluations = this.collectEvaluations(signal);
    const triage = triageSignal({ signal, evaluations });

    return {
      trigger,
      signal,
      evaluations,
      triage
    };
  }

  private emitFirstSignal(trigger: EventTrigger): Signal | null {
    for (const agent of this.signalAgents) {
      const signal = agent.emitSignal(trigger);
      if (signal) {
        return signal;
      }
    }

    return null;
  }

  private collectEvaluations(signal: Signal): Evaluation[] {
    const evaluations: Evaluation[] = [];

    for (const agent of this.evaluationAgents) {
      const evaluation = agent.evaluateSignal(signal);
      if (evaluation) {
        evaluations.push(evaluation);
      }
    }

    return evaluations;
  }
}

function getDeltaImportance(deltaC: number): number {
  const absDelta = Math.abs(deltaC);
  if (absDelta > 7) {
    return 4;
  }

  if (absDelta >= 4) {
    return 2;
  }

  return 1;
}

function getPersistenceImportance(level: PersistenceLevel): number {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function buildDeltaEvaluation(signal: Signal, snapshot: TemperatureCheckSnapshot): Evaluation {
  const importance = getDeltaImportance(snapshot.deltaC);

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.72,
    score: Math.min(1, signal.severity + 0.2),
    importance,
    rationale: `Ecart thermique observe: ${snapshot.deltaC.toFixed(2)}°C (importance ${importance}).`
  };
}

function buildDataQualityEvaluation(signal: Signal, snapshot: TemperatureCheckSnapshot): Evaluation {
  const hasFiniteValues =
    Number.isFinite(snapshot.cityTemperatureC) &&
    Number.isFinite(snapshot.fieldTemperatureC) &&
    Number.isFinite(snapshot.deltaC);

  const isFresh = Math.abs(snapshot.sampledAtMs - snapshot.fetchedAtMs) <= 3 * 60 * 60 * 1000;
  const importance = hasFiniteValues && snapshot.source === "open-meteo" && isFresh ? 1 : -1;

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: hasFiniteValues ? 0.7 : 0.35,
    score: hasFiniteValues ? 0.65 : 0.2,
    importance,
    rationale:
      importance > 0
        ? "Donnees presentes et coherentes (Open-Meteo + champ interpole)."
        : "Qualite insuffisante (donnees manquantes ou trop stale)."
  };
}

function buildPersistenceEvaluation(signal: Signal, persistence: AnomalyPersistence): Evaluation {
  const importance = getPersistenceImportance(persistence.level);

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence: 0.68,
    score: Math.min(1, 0.3 + importance * 0.2),
    importance,
    rationale: `Persistance ${persistence.level} (count ${persistence.count}, weighted ${persistence.weightedRecentScore.toFixed(2)}, fresh ${persistence.freshness.fresh}, aging ${persistence.freshness.aging}, stale ${persistence.freshness.stale}).`
  };
}

function totalImportance(evaluations: Evaluation[]): number {
  return evaluations.reduce((sum, evaluation) => sum + evaluation.importance, 0);
}

function attachPersistenceToSignal(signal: Signal, persistence: AnomalyPersistence): Signal {
  return {
    ...signal,
    context: {
      ...(signal.context ?? {}),
      persistenceLevel: persistence.level,
      persistenceCount: persistence.count,
      persistenceFreshness: persistence.freshness,
      persistenceWeightedRecentScore: persistence.weightedRecentScore
    }
  };
}

function buildDecisionLogEntry(
  result: TemperatureCheckResult,
  anomalyThresholdC: number
): DecisionLogEntry {
  return {
    timestampMs: Date.now(),
    city: result.snapshot?.cityLabel ?? result.cityQuery,
    cityId: result.snapshot?.cityId ?? null,
    deltaC: result.snapshot?.deltaC ?? null,
    anomalyThresholdC: result.snapshot?.thresholdC ?? anomalyThresholdC,
    persistenceLevel: result.persistence.level,
    persistenceCount: result.persistence.count,
    weightedRecentScore: result.persistence.weightedRecentScore,
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

function logRun(result: TemperatureCheckResult): void {
  const evaluationsLog = result.evaluations.map((evaluation) => ({
    importance: evaluation.importance,
    confidence: Number(evaluation.confidence.toFixed(2)),
    rationale: evaluation.rationale
  }));

  console.log("[AtlasMind]");
  console.log(`City: ${result.snapshot?.cityLabel ?? result.cityQuery}`);
  console.log(`Delta: ${result.snapshot ? `${result.snapshot.deltaC.toFixed(2)}°C` : "n/a"}`);
  console.log("Persistence:", result.persistence);
  console.log("Evaluations:", evaluationsLog);
  console.log(`Score: ${result.score}`);
  console.log("Decision:", result.triage);
}

function persistAndLogResult(
  result: TemperatureCheckResult,
  anomalyThresholdC: number
): TemperatureCheckResult {
  appendDecisionLog(buildDecisionLogEntry(result, anomalyThresholdC));
  logRun(result);
  return result;
}

/**
 * Flux reel minimal Atlas Mind v6.
 * Appel manuel uniquement (aucune boucle automatique).
 */
export async function runTemperatureCheck(
  cityQuery: string,
  options: RunTemperatureCheckOptions = {}
): Promise<TemperatureCheckResult> {
  const anomalyThresholdC = options.thresholdC ?? DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C;
  const weatherAgent = createWeatherAgent({ anomalyThresholdC });
  const detection = await weatherAgent.detectTemperatureAnomaly(cityQuery, {
    thresholdC: anomalyThresholdC,
    forceRefresh: options.forceRefresh,
    referenceMs: options.referenceMs
  });

  if (!detection.snapshot) {
    const result: TemperatureCheckResult = {
      cityQuery,
      snapshot: null,
      persistence: EMPTY_PERSISTENCE,
      signal: null,
      evaluations: [],
      score: 0,
      triage: {
        decision: "ignore",
        reason: "Ville introuvable ou donnees temperature indisponibles."
      }
    };

    return persistAndLogResult(result, anomalyThresholdC);
  }

  recordTemperatureEvent(detection.snapshot.cityId, {
    timestampMs: detection.snapshot.sampledAtMs,
    deltaC: detection.snapshot.deltaC,
    isAnomaly: Boolean(detection.signal)
  });

  const persistence = getAnomalyPersistence(detection.snapshot.cityId, detection.snapshot.sampledAtMs);

  if (!detection.signal) {
    const result: TemperatureCheckResult = {
      cityQuery,
      snapshot: detection.snapshot,
      persistence,
      signal: null,
      evaluations: [],
      score: 0,
      triage: {
        decision: "ignore",
        reason: `Aucune anomalie: |delta|=${Math.abs(detection.snapshot.deltaC).toFixed(2)}°C <= seuil ${detection.snapshot.thresholdC.toFixed(2)}°C.`
      }
    };

    return persistAndLogResult(result, anomalyThresholdC);
  }

  const enrichedSignal = attachPersistenceToSignal(detection.signal, persistence);

  const evaluations = [
    buildDeltaEvaluation(enrichedSignal, detection.snapshot),
    buildDataQualityEvaluation(enrichedSignal, detection.snapshot),
    buildPersistenceEvaluation(enrichedSignal, persistence)
  ];

  const score = totalImportance(evaluations);
  const triage = triageSignal({
    signal: enrichedSignal,
    evaluations
  });

  const result: TemperatureCheckResult = {
    cityQuery,
    snapshot: detection.snapshot,
    persistence,
    signal: enrichedSignal,
    evaluations,
    score,
    triage
  };

  return persistAndLogResult(result, anomalyThresholdC);
}