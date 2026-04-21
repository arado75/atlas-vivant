import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";
import {
  clearMindOrchestrationTrace,
  getRecentMindOrchestrationTrace,
  runMindP202Orchestrator,
  type MindIngressSignal
} from "../p2-02-orchestrator";
import {
  clearCreditSystemState,
  getCreditSystemSnapshot,
  getRecentCreditGateLogs
} from "../p3-01-credit-system";
import type { Signal } from "../types";

function buildManualAnomalySignal(city: string, deltaC: number): Signal {
  return {
    id: `p3-01:manual:anomaly:${city}:${Date.now()}`,
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
      cityTemperatureC: 24,
      fieldTemperatureC: 24 - deltaC,
      deltaC,
      thresholdC: 2,
      source: "open-meteo"
    }
  };
}

export async function runP301CreditSystemCheck() {
  clearDecisionLogs();
  clearMindOrchestrationTrace();
  clearCreditSystemState();

  const standardAccepted: MindIngressSignal = {
    id: "p3-01-standard-accepted",
    type: "temperature.anomaly.simple",
    level: "medium",
    source: "atlas-vivant.temperature",
    createdAtMs: Date.now(),
    creditType: "standard",
    context: {
      signal: buildManualAnomalySignal("Paris", 3.1)
    }
  };

  const priorityAccepted: MindIngressSignal = {
    id: "p3-01-priority-accepted",
    type: "temperature.data.quality.simple",
    level: "high",
    source: "atlas-vivant.temperature.quality",
    createdAtMs: Date.now(),
    creditType: "priority",
    context: {
      city: "Lima",
      cityId: "lima",
      sourceType: "real",
      qualityIssueCode: "source_type_incoherent",
      fieldCityDeltaC: 4.9,
      runtimeAvailable: false
    }
  };

  const standardRefused: MindIngressSignal = {
    id: "p3-01-standard-refused",
    type: "temperature.runtime.availability.simple",
    level: "medium",
    source: "atlas-vivant.temperature.runtime",
    createdAtMs: Date.now(),
    creditType: "standard",
    context: {
      available: false,
      consecutiveFailures: 1,
      lastSuccessAgeMin: 20,
      runtimeSource: "open-meteo"
    }
  };

  const urgentAccepted: MindIngressSignal = {
    id: "p3-01-urgent-accepted",
    type: "temperature.runtime.availability.simple",
    level: "high",
    source: "atlas-vivant.temperature.runtime",
    createdAtMs: Date.now(),
    creditType: "urgent",
    context: {
      available: false,
      consecutiveFailures: 3,
      lastSuccessAgeMin: 70,
      runtimeSource: "open-meteo"
    }
  };

  const standardAcceptedResult = await runMindP202Orchestrator(standardAccepted);
  const priorityAcceptedResult = await runMindP202Orchestrator(priorityAccepted);
  const standardRefusedResult = await runMindP202Orchestrator(standardRefused);
  const urgentAcceptedResult = await runMindP202Orchestrator(urgentAccepted);

  return {
    standardAcceptedResult,
    priorityAcceptedResult,
    standardRefusedResult,
    urgentAcceptedResult,
    orchestrationTrace: getRecentMindOrchestrationTrace(30),
    creditLogs: getRecentCreditGateLogs(30),
    creditSnapshot: getCreditSystemSnapshot(),
    decisionLogs: getRecentDecisionLogs(30)
  };
}