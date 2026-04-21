import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";
import {
  clearMindOrchestrationTrace,
  getRecentMindOrchestrationTrace,
  runMindP202Orchestrator,
  type MindIngressSignal
} from "../p2-02-orchestrator";
import type { Signal } from "../types";

function buildManualSignal(city: string, deltaC: number): Signal {
  return {
    id: `p2-02:manual:${city}:${Date.now()}`,
    kind: "temperature_anomaly",
    domain: "temperature",
    sourceRole: "weather",
    createdAtMs: Date.now(),
    summary: `Signal manuel ${city}`,
    severity: Math.min(1, Math.abs(deltaC) / 8),
    confidence: 0.72,
    context: {
      city,
      cityId: city.toLowerCase(),
      cityTemperatureC: 24,
      fieldTemperatureC: 24 - deltaC,
      deltaC,
      thresholdC: 2,
      source: "open-meteo"
    }
  };
}

export async function runP202OrchestratorCheck() {
  clearDecisionLogs();
  clearMindOrchestrationTrace();

  const cityIngress: MindIngressSignal = {
    id: "ingress-city-001",
    type: "temperature.anomaly.simple",
    level: "medium",
    source: "atlas-vivant.temperature",
    createdAtMs: Date.now(),
    context: {
      cityQuery: "Paris",
      thresholdC: 10,
      forceRefresh: true
    }
  };

  const signalIngress: MindIngressSignal = {
    id: "ingress-signal-001",
    type: "temperature.anomaly.simple",
    level: "high",
    source: "atlas-vivant.temperature",
    createdAtMs: Date.now(),
    context: {
      signal: buildManualSignal("Mumbai", 8.2)
    }
  };

  const cityResult = await runMindP202Orchestrator(cityIngress);
  const signalResult = await runMindP202Orchestrator(signalIngress);

  return {
    cityResult,
    signalResult,
    orchestrationTrace: getRecentMindOrchestrationTrace(10),
    decisionLogs: getRecentDecisionLogs(10)
  };
}
