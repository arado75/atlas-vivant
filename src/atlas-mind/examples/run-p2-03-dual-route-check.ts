import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";
import {
  clearMindOrchestrationTrace,
  getRecentMindOrchestrationTrace,
  runMindP202Orchestrator,
  type MindIngressSignal
} from "../p2-02-orchestrator";
import type { Signal } from "../types";

function buildManualAnomalySignal(city: string, deltaC: number): Signal {
  return {
    id: `p2-03:manual:anomaly:${city}:${Date.now()}`,
    kind: "temperature_anomaly",
    domain: "temperature",
    sourceRole: "weather",
    createdAtMs: Date.now(),
    summary: `Signal manuel anomalie ${city}`,
    severity: Math.min(1, Math.abs(deltaC) / 8),
    confidence: 0.72,
    context: {
      city,
      cityId: city.toLowerCase(),
      cityTemperatureC: 26,
      fieldTemperatureC: 26 - deltaC,
      deltaC,
      thresholdC: 2,
      source: "open-meteo"
    }
  };
}

export async function runP203DualRouteCheck() {
  clearDecisionLogs();
  clearMindOrchestrationTrace();

  const anomalyIngress: MindIngressSignal = {
    id: "ingress-anomaly-001",
    type: "temperature.anomaly.simple",
    level: "medium",
    source: "atlas-vivant.temperature",
    createdAtMs: Date.now(),
    context: {
      signal: buildManualAnomalySignal("Paris", 3.4)
    }
  };

  const runtimeAvailabilityIngress: MindIngressSignal = {
    id: "ingress-runtime-001",
    type: "temperature.runtime.availability.simple",
    level: "high",
    source: "atlas-vivant.temperature.runtime",
    createdAtMs: Date.now(),
    context: {
      available: false,
      consecutiveFailures: 3,
      lastSuccessAgeMin: 65,
      runtimeSource: "open-meteo"
    }
  };

  const anomalyResult = await runMindP202Orchestrator(anomalyIngress);
  const runtimeAvailabilityResult = await runMindP202Orchestrator(runtimeAvailabilityIngress);

  return {
    anomalyResult,
    runtimeAvailabilityResult,
    orchestrationTrace: getRecentMindOrchestrationTrace(12),
    decisionLogs: getRecentDecisionLogs(12)
  };
}