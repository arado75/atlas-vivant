import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";
import {
  clearMindOrchestrationTrace,
  getRecentMindOrchestrationTrace,
  type MindIngressSignal
} from "../p2-02-orchestrator";
import { clearP205LotResults, runP205BoundedLot, type MindBoundedLotInput } from "../p2-05-bounded-lot";
import { clearCreditSystemState, getRecentCreditGateLogs } from "../p3-01-credit-system";
import {
  clearP302TribunalLogs,
  getRecentP302TribunalLogs,
  runP302MinimalTribunal
} from "../p3-02-minimal-tribunal";
import type { Signal } from "../types";

function buildWeakAnomalySignal(city: string): Signal {
  return {
    id: `p3-02:manual:anomaly:${city}:${Date.now()}`,
    kind: "temperature_anomaly",
    domain: "temperature",
    sourceRole: "weather",
    createdAtMs: Date.now(),
    summary: `Signal faible anomalie ${city}`,
    severity: 0.28,
    confidence: 0.66,
    context: {
      city,
      cityId: city.toLowerCase(),
      cityTemperatureC: 22,
      deltaC: 2.2,
      thresholdC: 2,
      source: "fallback"
    }
  };
}

function buildContradictionLotSignals(): MindIngressSignal[] {
  return [
    {
      id: "p3-02-lot-anomaly-proposal",
      type: "temperature.anomaly.simple",
      level: "low",
      source: "atlas-vivant.temperature",
      createdAtMs: Date.now(),
      creditType: "standard",
      context: {
        signal: buildWeakAnomalySignal("Paris")
      }
    },
    {
      id: "p3-02-lot-runtime-critic",
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
    }
  ];
}

export async function runP302MinimalTribunalCheck() {
  clearDecisionLogs();
  clearMindOrchestrationTrace();
  clearP205LotResults();
  clearCreditSystemState();
  clearP302TribunalLogs();

  const lot: MindBoundedLotInput = {
    lotId: `p3-02-lot-${Date.now()}`,
    source: "atlas-mind.p3-02.check",
    createdAtMs: Date.now(),
    signals: buildContradictionLotSignals()
  };

  const lotResult = await runP205BoundedLot(lot);
  const arbitration = runP302MinimalTribunal(lotResult);

  return {
    lot,
    lotResult,
    arbitration,
    orchestrationTrace: getRecentMindOrchestrationTrace(30),
    creditLogs: getRecentCreditGateLogs(30),
    decisionLogs: getRecentDecisionLogs(30),
    tribunalLogs: getRecentP302TribunalLogs(30)
  };
}