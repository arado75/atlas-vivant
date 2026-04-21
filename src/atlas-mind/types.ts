export type AgentRole =
  | "orchestrator"
  | "weather"
  | "observer"
  | "auditor"
  | "triage";

export type PersistenceLevel = "none" | "low" | "medium" | "high";

export type TriageDecision = "ignore" | "log" | "watch" | "flag";

export interface EventTrigger {
  id: string;
  kind: "temperature.anomaly" | "schedule.tick" | "manual.review";
  createdAtMs: number;
  source: string;
  payload?: Record<string, unknown>;
}

export interface Signal {
  id: string;
  kind: string;
  domain: "temperature" | "generic";
  sourceRole: AgentRole;
  createdAtMs: number;
  summary: string;
  severity: number;
  confidence: number;
  context?: Record<string, unknown>;
}

export interface Evaluation {
  signalId: string;
  evaluatorRole: AgentRole;
  createdAtMs: number;
  confidence: number;
  score: number;
  importance: number;
  rationale: string;
}

export interface TriageInput {
  signal: Signal;
  evaluations: Evaluation[];
}

export interface TriageOutcome {
  decision: TriageDecision;
  reason: string;
}
