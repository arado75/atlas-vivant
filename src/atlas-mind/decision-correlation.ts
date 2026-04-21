import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import { getSystemAudit } from "./decision-auditor";
import { getSystemRecommendations } from "./decision-advisor";
import { analysisConfig } from "./decision-config";

export type SignalCorrelation = {
  pair: [string, string];
  count: number;
};

export type CorrelationResult = {
  correlations: SignalCorrelation[];
};

const MIN_CORRELATION_COUNT = 2;

function sourceLogs(logs?: DecisionLogEntry[]): DecisionLogEntry[] {
  const entries = logs ?? getRecentDecisionLogs(analysisConfig.trendWindow);
  return [...entries]
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .slice(-analysisConfig.trendWindow);
}

function buildContexts(entries: DecisionLogEntry[]): DecisionLogEntry[][] {
  if (entries.length === 0) {
    return [];
  }

  const size = Math.min(analysisConfig.correlationContextSize, entries.length);
  if (entries.length <= size) {
    return [entries];
  }

  const contexts: DecisionLogEntry[][] = [];
  for (let index = 0; index <= entries.length - size; index += 1) {
    contexts.push(entries.slice(index, index + size));
  }

  return contexts;
}

function signalsForContext(context: DecisionLogEntry[]): string[] {
  const audit = getSystemAudit(context);
  const recommendations = getSystemRecommendations(context);
  const signals = new Set<string>();

  for (const issue of audit.issues) {
    signals.add(issue.type);
  }

  for (const recommendation of recommendations.recommendations) {
    signals.add(recommendation.type);
  }

  return [...signals].sort((left, right) => left.localeCompare(right));
}

function makePairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function parsePairKey(key: string): [string, string] {
  const [left = "", right = ""] = key.split("|");
  return [left, right];
}

export function getSignalCorrelations(logs?: DecisionLogEntry[]): CorrelationResult {
  const entries = sourceLogs(logs);
  const contexts = buildContexts(entries);
  const pairCounts = new Map<string, number>();

  for (const context of contexts) {
    const signals = signalsForContext(context);
    if (signals.length < 2) {
      continue;
    }

    for (let leftIndex = 0; leftIndex < signals.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < signals.length; rightIndex += 1) {
        const key = makePairKey(signals[leftIndex], signals[rightIndex]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const correlations = [...pairCounts.entries()]
    .filter(([, count]) => count >= MIN_CORRELATION_COUNT)
    .map(([key, count]) => ({
      pair: parsePairKey(key),
      count
    }))
    .sort((left, right) => {
      const countDelta = right.count - left.count;
      if (countDelta !== 0) {
        return countDelta;
      }

      const leftKey = `${left.pair[0]}|${left.pair[1]}`;
      const rightKey = `${right.pair[0]}|${right.pair[1]}`;
      return leftKey.localeCompare(rightKey);
    });

  return { correlations };
}

export function getSignalCorrelationsText(result: CorrelationResult): string {
  if (result.correlations.length === 0) {
    return "Aucune correlation detectee.";
  }

  const text = result.correlations
    .map((correlation) => `${correlation.pair[0]} <-> ${correlation.pair[1]} (x${correlation.count})`)
    .join(", ");

  return `Correlations detectees: ${text}.`;
}
