import {
  runP201MiniCycleFromSignal,
  runP201TemperatureMiniCycle,
  type P201MiniCycleResult
} from "./p2-01-mini-cycle";
import {
  runP203RuntimeAvailabilityCycleFromSignal,
  type P203RuntimeAvailabilityCycleResult
} from "./p2-03-runtime-availability-cycle";
import {
  runP204DataQualityCycleFromSignal,
  type P204DataQualityCycleResult
} from "./p2-04-data-quality-cycle";
import { consumeIngressCredit, type CreditGateDecision, type CreditType } from "./p3-01-credit-system";
import type { Signal, TriageDecision } from "./types";

export type MindIngressSignalType =
  | "temperature.anomaly.simple"
  | "temperature.runtime.availability.simple"
  | "temperature.data.quality.simple";
export type MindIngressLevel = "low" | "medium" | "high";

export interface MindIngressSignal {
  id: string;
  type: MindIngressSignalType | string;
  level: MindIngressLevel;
  source: string;
  createdAtMs: number;
  creditType?: CreditType;
  context?: {
    cityQuery?: string;
    signal?: Signal;
    thresholdC?: number;
    forceRefresh?: boolean;
    referenceMs?: number;
    available?: boolean;
    consecutiveFailures?: number;
    lastSuccessAgeMin?: number;
    runtimeSource?: string;
    city?: string;
    cityId?: string;
    sourceType?: string;
    qualityIssueCode?: string;
    fieldCityDeltaC?: number;
    runtimeAvailable?: boolean;
  };
}

export type MindOrchestratedRoute =
  | "p2-01.temperature-mini-cycle"
  | "p2-03.temperature-runtime-availability-cycle"
  | "p2-04.temperature-data-quality-cycle"
  | "none";

export type MindOrchestratedCycleResult =
  | P201MiniCycleResult
  | P203RuntimeAvailabilityCycleResult
  | P204DataQualityCycleResult
  | null;

export interface MindCreditTrace {
  requestedType: CreditType;
  appliedType: CreditType;
  cost: number;
  gateDecision: CreditGateDecision;
  reason: string;
  loadBefore: number;
  loadAfter: number;
}

export interface MindOrchestrationOutput {
  ingressId: string;
  accepted: boolean;
  routedTo: MindOrchestratedRoute;
  decision: TriageDecision;
  reason: string;
  priority: "low" | "medium" | "high";
  cycleResult: MindOrchestratedCycleResult;
  credit: MindCreditTrace;
}

export interface MindOrchestrationTraceEntry {
  timestampMs: number;
  ingressId: string;
  type: string;
  level: MindIngressLevel;
  source: string;
  routedTo: MindOrchestratedRoute;
  decision: TriageDecision;
  reason: string;
  priority: "low" | "medium" | "high";
  creditRequestedType: CreditType;
  creditAppliedType: CreditType;
  creditCost: number;
  creditGateDecision: CreditGateDecision;
  creditReason: string;
}

const MAX_ORCHESTRATION_TRACE = 200;
const orchestrationTrace: MindOrchestrationTraceEntry[] = [];

function isSignalLike(value: unknown): value is Signal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<Signal>;
  return (
    typeof maybe.id === "string" &&
    typeof maybe.kind === "string" &&
    (maybe.domain === "temperature" || maybe.domain === "generic") &&
    typeof maybe.createdAtMs === "number"
  );
}

function mapDecisionPriority(decision: TriageDecision): "low" | "medium" | "high" {
  switch (decision) {
    case "flag":
      return "high";
    case "watch":
      return "medium";
    default:
      return "low";
  }
}

function appendOrchestrationTrace(entry: MindOrchestrationTraceEntry): void {
  orchestrationTrace.push(entry);

  if (orchestrationTrace.length > MAX_ORCHESTRATION_TRACE) {
    orchestrationTrace.splice(0, orchestrationTrace.length - MAX_ORCHESTRATION_TRACE);
  }
}

function finalizeOutput(input: MindIngressSignal, output: MindOrchestrationOutput): MindOrchestrationOutput {
  appendOrchestrationTrace({
    timestampMs: Date.now(),
    ingressId: input.id,
    type: input.type,
    level: input.level,
    source: input.source,
    routedTo: output.routedTo,
    decision: output.decision,
    reason: output.reason,
    priority: output.priority,
    creditRequestedType: output.credit.requestedType,
    creditAppliedType: output.credit.appliedType,
    creditCost: output.credit.cost,
    creditGateDecision: output.credit.gateDecision,
    creditReason: output.credit.reason
  });

  return output;
}

function buildRuntimeAvailabilitySignalFromIngress(input: MindIngressSignal): Signal | null {
  const available = input.context?.available;
  const consecutiveFailures = Number(input.context?.consecutiveFailures ?? 0);
  const lastSuccessAgeMin = Number(input.context?.lastSuccessAgeMin ?? Number.NaN);
  const hasAvailability = typeof available === "boolean";
  const hasFailures = Number.isFinite(consecutiveFailures);
  const hasAge = Number.isFinite(lastSuccessAgeMin);

  if (!hasAvailability && !hasFailures && !hasAge) {
    return null;
  }

  return {
    id: `p2-03:runtime:${input.id}`,
    kind: "temperature_runtime_availability",
    domain: "temperature",
    sourceRole: "observer",
    createdAtMs: Date.now(),
    summary: "Disponibilite runtime temperature",
    severity: hasAvailability && available === false ? 0.7 : 0.2,
    confidence: 0.7,
    context: {
      available,
      consecutiveFailures: hasFailures ? Math.max(0, Math.trunc(consecutiveFailures)) : 0,
      lastSuccessAgeMin: hasAge ? Math.max(0, lastSuccessAgeMin) : undefined,
      runtimeSource: input.context?.runtimeSource ?? input.source,
      source: input.source
    }
  };
}

function buildDataQualitySignalFromIngress(input: MindIngressSignal): Signal | null {
  const issueCode =
    typeof input.context?.qualityIssueCode === "string" && input.context.qualityIssueCode.trim().length > 0
      ? input.context.qualityIssueCode.trim()
      : null;

  const sourceType =
    typeof input.context?.sourceType === "string" && input.context.sourceType.trim().length > 0
      ? input.context.sourceType.trim()
      : null;

  const city =
    typeof input.context?.city === "string" && input.context.city.trim().length > 0
      ? input.context.city.trim()
      : null;
  const cityId =
    typeof input.context?.cityId === "string" && input.context.cityId.trim().length > 0
      ? input.context.cityId.trim()
      : city?.toLowerCase() ?? null;

  const fieldCityDeltaC = Number(input.context?.fieldCityDeltaC ?? Number.NaN);
  const hasDelta = Number.isFinite(fieldCityDeltaC);

  if (!issueCode && !sourceType && !city && !hasDelta) {
    return null;
  }

  let severity = 0.3;
  if (issueCode === "city_missing" || issueCode === "source_type_incoherent") {
    severity = 0.8;
  } else if (issueCode === "field_city_divergence_high") {
    severity = 0.6;
  } else if (issueCode === "signal_quality_low") {
    severity = 0.45;
  }

  return {
    id: `p2-04:data-quality:${input.id}`,
    kind: "temperature_data_quality",
    domain: "temperature",
    sourceRole: "observer",
    createdAtMs: Date.now(),
    summary: `Qualite donnees temperature (${issueCode ?? "unknown"})`,
    severity,
    confidence: 0.68,
    context: {
      city,
      cityId,
      sourceType,
      qualityIssueCode: issueCode ?? "unknown",
      fieldCityDeltaC: hasDelta ? fieldCityDeltaC : undefined,
      runtimeAvailable: input.context?.runtimeAvailable,
      source: input.source
    }
  };
}

/**
 * Chef d'orchestre minimal P2/P3.
 * Role: appliquer une porte credits anti-bruit, puis router un signal operationnel
 * vers P2-01 (anomalie temperature), P2-03 (disponibilite runtime temperature)
 * ou P2-04 (qualite donnees temperature), sinon ignorer proprement.
 */
export async function runMindP202Orchestrator(input: MindIngressSignal): Promise<MindOrchestrationOutput> {
  const creditOutcome = consumeIngressCredit(input.creditType);
  const credit: MindCreditTrace = {
    requestedType: creditOutcome.requestedType,
    appliedType: creditOutcome.appliedType,
    cost: creditOutcome.cost,
    gateDecision: creditOutcome.gateDecision,
    reason: creditOutcome.reason,
    loadBefore: creditOutcome.loadBefore,
    loadAfter: creditOutcome.loadAfter
  };

  if (!creditOutcome.accepted) {
    return finalizeOutput(input, {
      ingressId: input.id,
      accepted: false,
      routedTo: "none",
      decision: "ignore",
      reason: creditOutcome.reason,
      priority: "low",
      cycleResult: null,
      credit
    });
  }

  if (input.type === "temperature.anomaly.simple") {
    const signal = input.context?.signal;
    if (isSignalLike(signal)) {
      const cycleResult = runP201MiniCycleFromSignal(signal, {
        anomalyThresholdC: input.context?.thresholdC
      });

      return finalizeOutput(input, {
        ingressId: input.id,
        accepted: true,
        routedTo: "p2-01.temperature-mini-cycle",
        decision: cycleResult.triage.decision,
        reason: cycleResult.triage.reason,
        priority: mapDecisionPriority(cycleResult.triage.decision),
        cycleResult,
        credit
      });
    }

    const cityQuery = input.context?.cityQuery;
    if (typeof cityQuery === "string" && cityQuery.trim().length > 0) {
      const cycleResult = await runP201TemperatureMiniCycle(cityQuery, {
        thresholdC: input.context?.thresholdC,
        forceRefresh: input.context?.forceRefresh,
        referenceMs: input.context?.referenceMs
      });

      return finalizeOutput(input, {
        ingressId: input.id,
        accepted: true,
        routedTo: "p2-01.temperature-mini-cycle",
        decision: cycleResult.triage.decision,
        reason: cycleResult.triage.reason,
        priority: mapDecisionPriority(cycleResult.triage.decision),
        cycleResult,
        credit
      });
    }

    return finalizeOutput(input, {
      ingressId: input.id,
      accepted: false,
      routedTo: "none",
      decision: "ignore",
      reason: "Signal temperature simple incomplet: cityQuery ou signal manquant.",
      priority: "low",
      cycleResult: null,
      credit
    });
  }

  if (input.type === "temperature.runtime.availability.simple") {
    const directSignal = input.context?.signal;
    const routedSignal =
      (isSignalLike(directSignal) ? directSignal : null) ?? buildRuntimeAvailabilitySignalFromIngress(input);

    if (!routedSignal) {
      return finalizeOutput(input, {
        ingressId: input.id,
        accepted: false,
        routedTo: "none",
        decision: "ignore",
        reason: "Signal runtime temperature incomplet: signal ou contexte disponible manquant.",
        priority: "low",
        cycleResult: null,
        credit
      });
    }

    const cycleResult = runP203RuntimeAvailabilityCycleFromSignal(routedSignal);

    return finalizeOutput(input, {
      ingressId: input.id,
      accepted: true,
      routedTo: "p2-03.temperature-runtime-availability-cycle",
      decision: cycleResult.triage.decision,
      reason: cycleResult.triage.reason,
      priority: mapDecisionPriority(cycleResult.triage.decision),
      cycleResult,
      credit
    });
  }

  if (input.type === "temperature.data.quality.simple") {
    const directSignal = input.context?.signal;
    const routedSignal = (isSignalLike(directSignal) ? directSignal : null) ?? buildDataQualitySignalFromIngress(input);

    if (!routedSignal) {
      return finalizeOutput(input, {
        ingressId: input.id,
        accepted: false,
        routedTo: "none",
        decision: "ignore",
        reason: "Signal qualite donnees temperature incomplet: details qualite manquants.",
        priority: "low",
        cycleResult: null,
        credit
      });
    }

    const cycleResult = runP204DataQualityCycleFromSignal(routedSignal);

    return finalizeOutput(input, {
      ingressId: input.id,
      accepted: true,
      routedTo: "p2-04.temperature-data-quality-cycle",
      decision: cycleResult.triage.decision,
      reason: cycleResult.triage.reason,
      priority: mapDecisionPriority(cycleResult.triage.decision),
      cycleResult,
      credit
    });
  }

  return finalizeOutput(input, {
    ingressId: input.id,
    accepted: false,
    routedTo: "none",
    decision: "ignore",
    reason: `Type non gere en v0: ${input.type}.`,
    priority: "low",
    cycleResult: null,
    credit
  });
}

export function getRecentMindOrchestrationTrace(limit = 20): MindOrchestrationTraceEntry[] {
  const safeLimit = Math.max(0, Math.min(limit, MAX_ORCHESTRATION_TRACE));
  if (safeLimit === 0) {
    return [];
  }

  return orchestrationTrace.slice(-safeLimit);
}

export function clearMindOrchestrationTrace(): void {
  orchestrationTrace.length = 0;
}