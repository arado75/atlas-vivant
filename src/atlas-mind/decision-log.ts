import type { PersistenceLevel, TriageDecision } from "./types";

export interface DecisionLogEvaluationEntry {
  evaluatorRole: string;
  importance: number;
  confidence: number;
  score: number;
  rationale: string;
}

export interface DecisionLogEntry {
  timestampMs: number;
  city: string;
  cityId: string | null;
  deltaC: number | null;
  routeId?: string;
  signalKind?: string;
  signalDomain?: string;
  sourceType?: string | null;
  ingressType?: string | null;
  activeLayerIds?: string[];
  selectedBrickId?: string | null;
  anomalyThresholdC: number;
  persistenceLevel: PersistenceLevel;
  persistenceCount: number;
  weightedRecentScore: number;
  evaluations: DecisionLogEvaluationEntry[];
  score: number;
  decision: TriageDecision;
  reason: string;
}

const MAX_DECISION_LOG_ENTRIES = 200;

const decisionLogs: DecisionLogEntry[] = [];

export function appendDecisionLog(entry: DecisionLogEntry): void {
  decisionLogs.push(entry);

  if (decisionLogs.length > MAX_DECISION_LOG_ENTRIES) {
    decisionLogs.splice(0, decisionLogs.length - MAX_DECISION_LOG_ENTRIES);
  }
}

export function getRecentDecisionLogs(limit = 20): DecisionLogEntry[] {
  const safeLimit = Math.max(0, Math.min(limit, MAX_DECISION_LOG_ENTRIES));
  if (safeLimit === 0) {
    return [];
  }

  return decisionLogs.slice(-safeLimit);
}

export function clearDecisionLogs(): void {
  decisionLogs.length = 0;
}
