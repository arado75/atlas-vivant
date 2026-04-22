import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import { getSystemAudit } from "./decision-auditor";
import { getSystemRecommendations } from "./decision-advisor";
import { analysisConfig } from "./decision-config";

export type SignalCorrelation = {
  pair: [string, string];
  count: number;
  support: number;
  confidence: number;
  lift: number;
  probabilityScore: number;
};

export type CorrelationResult = {
  correlations: SignalCorrelation[];
  contextCount: number;
  vocabularySize: number;
};

const MIN_CORRELATION_COUNT = 2;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

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

function makePairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function parsePairKey(key: string): [string, string] {
  const [left = "", right = ""] = key.split("|");
  return [left, right];
}

function deltaBucket(deltaC: number | null): string | null {
  if (deltaC === null || !Number.isFinite(deltaC)) {
    return null;
  }

  const absDelta = Math.abs(deltaC);
  const sign = deltaC >= 0 ? "warm" : "cool";

  if (absDelta < 1.5) {
    return `delta:${sign}:mild`;
  }
  if (absDelta < 3) {
    return `delta:${sign}:moderate`;
  }
  if (absDelta < 6) {
    return `delta:${sign}:strong`;
  }
  return `delta:${sign}:extreme`;
}

function contextTokens(context: DecisionLogEntry[]): string[] {
  const tokens = new Set<string>();

  for (const entry of context) {
    tokens.add(`decision:${entry.decision}`);
    tokens.add(`persistence:${entry.persistenceLevel}`);

    if (entry.routeId) {
      tokens.add(`route:${entry.routeId}`);
    }

    if (entry.signalKind) {
      tokens.add(`signal:${entry.signalKind}`);
    }

    if (entry.signalDomain) {
      tokens.add(`domain:${entry.signalDomain}`);
    }

    if (entry.sourceType) {
      tokens.add(`source:${entry.sourceType}`);
    }

    if (entry.ingressType) {
      tokens.add(`ingress:${entry.ingressType}`);
    }

    if (entry.cityId && !entry.cityId.startsWith("runtime.")) {
      tokens.add(`city:${entry.cityId}`);
    }

    if (entry.selectedBrickId) {
      tokens.add(`focus_brick:${entry.selectedBrickId}`);
    }

    for (const layerId of entry.activeLayerIds ?? []) {
      tokens.add(`layer:${layerId}`);
    }

    const bucket = deltaBucket(entry.deltaC);
    if (bucket) {
      tokens.add(bucket);
    }
  }

  const audit = getSystemAudit(context);
  tokens.add(`audit:${audit.status}`);
  for (const issue of audit.issues) {
    tokens.add(`issue:${issue.type}`);
  }

  const recommendations = getSystemRecommendations(context);
  for (const recommendation of recommendations.recommendations) {
    tokens.add(`recommendation:${recommendation.type}`);
  }

  return [...tokens].sort((left, right) => left.localeCompare(right));
}

export function getSignalCorrelations(logs?: DecisionLogEntry[]): CorrelationResult {
  const entries = sourceLogs(logs);
  const contexts = buildContexts(entries);
  const tokenCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  let vocabularySize = 0;

  for (const context of contexts) {
    const signals = contextTokens(context);
    if (signals.length === 0) {
      continue;
    }

    vocabularySize = Math.max(vocabularySize, signals.length);
    for (const signal of signals) {
      tokenCounts.set(signal, (tokenCounts.get(signal) ?? 0) + 1);
    }

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

  const contextCount = Math.max(1, contexts.length);
  const correlations = [...pairCounts.entries()]
    .filter(([, count]) => count >= MIN_CORRELATION_COUNT)
    .map(([key, count]) => {
      const pair = parsePairKey(key);
      const leftCount = tokenCounts.get(pair[0]) ?? 0;
      const rightCount = tokenCounts.get(pair[1]) ?? 0;
      const support = count / contextCount;
      const confidenceLeft = leftCount > 0 ? count / leftCount : 0;
      const confidenceRight = rightCount > 0 ? count / rightCount : 0;
      const confidence = (confidenceLeft + confidenceRight) * 0.5;
      const pLeft = leftCount / contextCount;
      const pRight = rightCount / contextCount;
      const expected = pLeft * pRight;
      const lift = expected > 0 ? support / expected : 0;
      const supportFactor = clamp01(support / 0.45);
      const liftFactor = clamp01((lift - 1) / 2.5);
      const probabilityScore = clamp01(confidence * 0.6 + supportFactor * 0.25 + liftFactor * 0.15);

      return {
        pair,
        count,
        support: round3(support),
        confidence: round3(confidence),
        lift: round3(lift),
        probabilityScore: round3(probabilityScore)
      };
    })
    .sort((left, right) => {
      const scoreDelta = right.probabilityScore - left.probabilityScore;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const confidenceDelta = right.confidence - left.confidence;
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      const countDelta = right.count - left.count;
      if (countDelta !== 0) {
        return countDelta;
      }

      const leftKey = `${left.pair[0]}|${left.pair[1]}`;
      const rightKey = `${right.pair[0]}|${right.pair[1]}`;
      return leftKey.localeCompare(rightKey);
    });

  return {
    correlations,
    contextCount: contexts.length,
    vocabularySize
  };
}

function tokenLabel(token: string): string {
  const parts = token.split(":");
  if (parts.length <= 1) {
    return token;
  }

  const [prefix, ...tail] = parts;
  const value = tail.join(":").replace(/_/g, " ");
  switch (prefix) {
    case "decision":
      return `decision ${value}`;
    case "route":
      return `route ${value}`;
    case "signal":
      return `signal ${value}`;
    case "domain":
      return `domaine ${value}`;
    case "source":
      return `source ${value}`;
    case "ingress":
      return `ingress ${value}`;
    case "city":
      return `ville ${value}`;
    case "layer":
      return `couche ${value}`;
    case "focus_brick":
      return `focus ${value}`;
    case "issue":
      return `issue ${value}`;
    case "recommendation":
      return `reco ${value}`;
    case "audit":
      return `audit ${value}`;
    case "delta":
      return `delta ${value}`;
    default:
      return token.replace(/_/g, " ");
  }
}

export function getSignalCorrelationsText(result: CorrelationResult): string {
  if (result.correlations.length === 0) {
    return "Aucune correlation detectee.";
  }

  const text = result.correlations
    .slice(0, 4)
    .map(
      (correlation) =>
        `${tokenLabel(correlation.pair[0])} <-> ${tokenLabel(correlation.pair[1])} (p ${(correlation.probabilityScore * 100).toFixed(0)}%, support ${(correlation.support * 100).toFixed(0)}%)`
    )
    .join(", ");

  return `Correlations probabilistes detectees: ${text}.`;
}
