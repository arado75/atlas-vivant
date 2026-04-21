import { getRecentDecisionLogs, type DecisionLogEntry } from "./decision-log";
import { getSystemAudit } from "./decision-auditor";
import { getSystemRecommendations } from "./decision-advisor";
import { analysisConfig } from "./decision-config";

export type SignalPattern = {
  pattern: [string, string, string];
  count: number;
};

export type PatternResult = {
  patterns: SignalPattern[];
};

const MIN_PATTERN_COUNT = 2;

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

  const size = Math.min(analysisConfig.patternContextSize, entries.length);
  if (entries.length <= size) {
    return [entries];
  }

  const contexts: DecisionLogEntry[][] = [];
  for (let index = 0; index <= entries.length - size; index += 1) {
    contexts.push(entries.slice(index, index + size));
  }

  return contexts;
}

function makePatternKey(issueType: string, recommendationType: string, status: string): string {
  return `${issueType}|${recommendationType}|${status}`;
}

function parsePatternKey(key: string): [string, string, string] {
  const [issue = "", recommendation = "", status = ""] = key.split("|");
  return [issue, recommendation, status];
}

export function getSignalPatterns(logs?: DecisionLogEntry[]): PatternResult {
  const entries = sourceLogs(logs);
  const contexts = buildContexts(entries);
  const counts = new Map<string, number>();

  for (const context of contexts) {
    const audit = getSystemAudit(context);
    const recommendations = getSystemRecommendations(context);

    if (audit.issues.length === 0 || recommendations.recommendations.length === 0) {
      continue;
    }

    const seenPatterns = new Set<string>();

    for (const issue of audit.issues) {
      for (const recommendation of recommendations.recommendations) {
        const key = makePatternKey(issue.type, recommendation.type, audit.status);
        if (!seenPatterns.has(key)) {
          seenPatterns.add(key);
        }
      }
    }

    for (const key of seenPatterns) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const patterns = [...counts.entries()]
    .filter(([, count]) => count >= MIN_PATTERN_COUNT)
    .map(([key, count]) => ({
      pattern: parsePatternKey(key),
      count
    }))
    .sort((left, right) => {
      const countDelta = right.count - left.count;
      if (countDelta !== 0) {
        return countDelta;
      }

      const leftKey = left.pattern.join("|");
      const rightKey = right.pattern.join("|");
      return leftKey.localeCompare(rightKey);
    });

  return { patterns };
}

export function getSignalPatternsText(result: PatternResult): string {
  if (result.patterns.length === 0) {
    return "Aucun motif recurrent detecte.";
  }

  const text = result.patterns
    .map((item) => `${item.pattern[0]} -> ${item.pattern[1]} -> ${item.pattern[2]} (x${item.count})`)
    .join(", ");

  return `Motifs recurrents: ${text}.`;
}
