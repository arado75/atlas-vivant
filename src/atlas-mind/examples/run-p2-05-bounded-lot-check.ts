import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";
import {
  clearMindOrchestrationTrace,
  getRecentMindOrchestrationTrace,
  type MindIngressSignal
} from "../p2-02-orchestrator";
import {
  clearP205LotResults,
  getRecentP205LotResults,
  runP205BoundedLot,
  type MindBoundedLotInput
} from "../p2-05-bounded-lot";
import type { Signal } from "../types";

function buildManualAnomalySignal(city: string, deltaC: number): Signal {
  return {
    id: `p2-05:manual:anomaly:${city}:${Date.now()}`,
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

function buildBoundedSignals(): MindIngressSignal[] {
  return [
    {
      id: "lot-signal-anomaly-001",
      type: "temperature.anomaly.simple",
      level: "medium",
      source: "atlas-vivant.temperature",
      createdAtMs: Date.now(),
      context: {
        signal: buildManualAnomalySignal("Paris", 3.3)
      }
    },
    {
      id: "lot-signal-runtime-001",
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
    },
    {
      id: "lot-signal-quality-001",
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
    }
  ];
}

export async function runP205BoundedLotCheck() {
  clearDecisionLogs();
  clearMindOrchestrationTrace();
  clearP205LotResults();

  const lot: MindBoundedLotInput = {
    lotId: `p2-05-lot-${Date.now()}`,
    source: "atlas-mind.p2-05.check",
    createdAtMs: Date.now(),
    signals: buildBoundedSignals()
  };

  const result = await runP205BoundedLot(lot);

  return {
    lot,
    result,
    orchestrationTrace: getRecentMindOrchestrationTrace(30),
    decisionLogs: getRecentDecisionLogs(30),
    recentLots: getRecentP205LotResults(10)
  };
}