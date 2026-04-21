import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";
import {
  runP201MiniCycleFromSignal,
  runP201TemperatureMiniCycle,
  type P201MiniCycleResult
} from "../p2-01-mini-cycle";
import type { Signal } from "../types";

function buildManualSignal(
  city: string,
  deltaC: number,
  options: { includeField?: boolean; source?: string } = {}
): Signal {
  const includeField = options.includeField ?? true;
  const source = options.source ?? "open-meteo";

  return {
    id: `manual:temperature_anomaly:${city}:${Date.now()}`,
    kind: "temperature_anomaly",
    domain: "temperature",
    sourceRole: "weather",
    createdAtMs: Date.now(),
    summary: `Signal anomalie temperature manuel ${city}`,
    severity: Math.min(1, Math.abs(deltaC) / 8),
    confidence: 0.7,
    context: {
      city,
      cityId: city.toLowerCase(),
      timestampMs: Date.now(),
      cityTemperatureC: 24,
      ...(includeField ? { fieldTemperatureC: 24 - deltaC } : {}),
      deltaC,
      thresholdC: 2,
      source,
      persistenceLevel: "none"
    }
  };
}

export async function runP201MiniCycleCheck(): Promise<{
  ignoreCase: P201MiniCycleResult;
  logCase: P201MiniCycleResult;
  watchCase: P201MiniCycleResult;
  flagCase: P201MiniCycleResult;
  recentLogs: ReturnType<typeof getRecentDecisionLogs>;
}> {
  clearDecisionLogs();

  const ignoreCase = await runP201TemperatureMiniCycle("Paris", {
    thresholdC: 10,
    forceRefresh: true
  });

  const logCase = runP201MiniCycleFromSignal(
    buildManualSignal("Berlin", 2.4, { includeField: false, source: "fallback" })
  );
  const watchCase = runP201MiniCycleFromSignal(buildManualSignal("Paris", 3.2));
  const flagCase = runP201MiniCycleFromSignal(buildManualSignal("Mumbai", 8.4));

  return {
    ignoreCase,
    logCase,
    watchCase,
    flagCase,
    recentLogs: getRecentDecisionLogs(12)
  };
}
