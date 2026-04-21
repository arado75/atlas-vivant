import { createWeatherAgent } from "../agents/weather-agent";
import { AtlasMindOrchestrator } from "../orchestrator";
import type { Evaluation, EventTrigger, Signal } from "../types";

function buildIndependentEvaluation(
  signal: Signal,
  evaluatorId: string,
  confidence: number,
  scoreBias = 0
): Evaluation {
  const boundedScore = Math.min(1, Math.max(0, signal.severity + scoreBias));

  return {
    signalId: signal.id,
    evaluatorRole: "observer",
    createdAtMs: Date.now(),
    confidence,
    score: boundedScore,
    importance: 1,
    rationale: `${evaluatorId} confirme partiellement le signal temperature.`
  };
}

/**
 * Flux v0 documente:
 * 1) Trigger d'anomalie temperature
 * 2) Agent meteo emet un signal
 * 3) Deux evaluations independantes sont produites
 * 4) La gare de triage retourne une decision simple
 */
export function runTemperatureAnomalyFlowExample() {
  const orchestrator = new AtlasMindOrchestrator();
  const weatherAgent = createWeatherAgent({ agentId: "weather-core" });

  orchestrator.registerSignalAgent(weatherAgent);

  orchestrator.registerEvaluationAgent({
    id: "observer-a",
    evaluateSignal(signal) {
      return buildIndependentEvaluation(signal, "observer-a", 0.74, 0.08);
    }
  });

  orchestrator.registerEvaluationAgent({
    id: "observer-b",
    evaluateSignal(signal) {
      return buildIndependentEvaluation(signal, "observer-b", 0.69, -0.02);
    }
  });

  const trigger: EventTrigger = {
    id: "trigger-temp-001",
    kind: "temperature.anomaly",
    createdAtMs: Date.now(),
    source: "atlas-vivant.temperature",
    payload: {
      city: "Paris",
      deviationC: 4.6
    }
  };

  return orchestrator.process(trigger);
}
