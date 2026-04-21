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
    id: `p2-04:manual:anomaly:${city}:${Date.now()}`,
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
      cityTemperatureC: 25,
      fieldTemperatureC: 25 - deltaC,
      deltaC,
      thresholdC: 2,
      source: "open-meteo"
    }
  };
}

export async function runP204ThreeRouteCheck() {
  clearDecisionLogs();
  clearMindOrchestrationTrace();

  const anomalyIngress: MindIngressSignal = {
    id: "ingress-anomaly-001",
    type: "temperature.anomaly.simple",
    level: "medium",
    source: "atlas-vivant.temperature",
    createdAtMs: Date.now(),
    context: {
      signal: buildManualAnomalySignal("Paris", 3.2)
    }
  };

  const runtimeAvailabilityIngress: MindIngressSignal = {
    id: "ingress-runtime-001",
    type: "temperature.runtime.availability.simple",
    level: "medium",
    source: "atlas-vivant.temperature.runtime",
    createdAtMs: Date.now(),
    context: {
      available: false,
      consecutiveFailures: 2,
      lastSuccessAgeMin: 35,
      runtimeSource: "open-meteo"
    }
  };

  const dataQualityIngress: MindIngressSignal = {
    id: "ingress-quality-001",
    type: "temperature.data.quality.simple",
    level: "high",
    source: "atlas-vivant.temperature.quality",
    createdAtMs: Date.now(),
    context: {
      city: "Lima",
      cityId: "lima",
      sourceType: "real",
      qualityIssueCode: "source_type_incoherent",
      fieldCityDeltaC: 4.8,
      runtimeAvailable: false
    }
  };

  const anomalyResult = await runMindP202Orchestrator(anomalyIngress);
  const runtimeAvailabilityResult = await runMindP202Orchestrator(runtimeAvailabilityIngress);
  const dataQualityResult = await runMindP202Orchestrator(dataQualityIngress);

  return {
    anomalyResult,
    runtimeAvailabilityResult,
    dataQualityResult,
    orchestrationTrace: getRecentMindOrchestrationTrace(20),
    decisionLogs: getRecentDecisionLogs(20)
  };
}