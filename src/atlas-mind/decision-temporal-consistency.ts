import type { DecisionLogEntry } from "./decision-log";
import type { GlobalSummary } from "./decision-global-summary";
import type { AuditStatus } from "./decision-auditor";
import { getSystemState } from "./decision-state";
import { getStructuredMessage } from "./decision-message-builder";

export type TemporalNarrativeLabel =
  | "improving"
  | "degrading"
  | "persistent_alert"
  | "stable_ok"
  | "stable_watch"
  | "oscillating"
  | "insufficient_history";

export interface TemporalNarrative {
  label: TemporalNarrativeLabel;
  phrase: string;
  recentStatuses: AuditStatus[];
}

function statusRank(status: AuditStatus): number {
  switch (status) {
    case "alert":
      return 3;
    case "watch":
      return 2;
    default:
      return 1;
  }
}

function splitIntoThreeSegments(entries: DecisionLogEntry[]): DecisionLogEntry[][] {
  const sorted = [...entries].sort((left, right) => left.timestampMs - right.timestampMs);
  if (sorted.length === 0) {
    return [];
  }

  const totalSegments = 3;
  const baseSize = Math.floor(sorted.length / totalSegments);
  const remainder = sorted.length % totalSegments;

  const segments: DecisionLogEntry[][] = [];
  let offset = 0;

  for (let index = 0; index < totalSegments; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    if (size <= 0) {
      continue;
    }

    segments.push(sorted.slice(offset, offset + size));
    offset += size;
  }

  return segments.filter((segment) => segment.length > 0);
}

function deriveRecentStatuses(logs?: DecisionLogEntry[]): AuditStatus[] {
  if (!logs || logs.length === 0) {
    return [];
  }

  const segments = splitIntoThreeSegments(logs);
  if (segments.length === 0) {
    return [];
  }

  return segments.map((segment) => getSystemState(segment).status);
}

function isOscillating(statuses: AuditStatus[]): boolean {
  if (statuses.length < 3) {
    return false;
  }

  const lastThree = statuses.slice(-3);
  return lastThree[0] === lastThree[2] && lastThree[0] !== lastThree[1];
}

function isMonotonicImproving(statuses: AuditStatus[]): boolean {
  if (statuses.length < 2) {
    return false;
  }

  let hasStrictDrop = false;

  for (let index = 1; index < statuses.length; index += 1) {
    const previousRank = statusRank(statuses[index - 1]);
    const currentRank = statusRank(statuses[index]);

    if (currentRank > previousRank) {
      return false;
    }

    if (currentRank < previousRank) {
      hasStrictDrop = true;
    }
  }

  return hasStrictDrop;
}

function isMonotonicDegrading(statuses: AuditStatus[]): boolean {
  if (statuses.length < 2) {
    return false;
  }

  let hasStrictRise = false;

  for (let index = 1; index < statuses.length; index += 1) {
    const previousRank = statusRank(statuses[index - 1]);
    const currentRank = statusRank(statuses[index]);

    if (currentRank < previousRank) {
      return false;
    }

    if (currentRank > previousRank) {
      hasStrictRise = true;
    }
  }

  return hasStrictRise;
}

function inferFromSingleStatus(status: AuditStatus): TemporalNarrative {
  if (status === "alert") {
    return {
      label: "persistent_alert",
      phrase: "Alerte persistante.",
      recentStatuses: [status]
    };
  }

  if (status === "ok") {
    return {
      label: "stable_ok",
      phrase: "Situation stable.",
      recentStatuses: [status]
    };
  }

  return {
    label: "stable_watch",
    phrase: "Surveillance stable.",
    recentStatuses: [status]
  };
}

export function getTemporalNarrative(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): TemporalNarrative {
  const recentStatuses = deriveRecentStatuses(logs);

  if (recentStatuses.length === 0) {
    if (summary.trends.statusTrend === "falling") {
      return {
        label: "improving",
        phrase: "Amelioration en cours.",
        recentStatuses
      };
    }

    if (summary.trends.statusTrend === "rising") {
      return {
        label: "degrading",
        phrase: "Degradation recente detectee.",
        recentStatuses
      };
    }

    return inferFromSingleStatus(summary.status);
  }

  if (recentStatuses.length === 1) {
    return inferFromSingleStatus(recentStatuses[0]);
  }

  if (isOscillating(recentStatuses)) {
    return {
      label: "oscillating",
      phrase: "Variations recentes observees, situation instable.",
      recentStatuses
    };
  }

  const allSame = recentStatuses.every((status) => status === recentStatuses[0]);
  if (allSame) {
    return inferFromSingleStatus(recentStatuses[0]);
  }

  if (isMonotonicImproving(recentStatuses)) {
    return {
      label: "improving",
      phrase: "Amelioration en cours.",
      recentStatuses
    };
  }

  if (isMonotonicDegrading(recentStatuses)) {
    return {
      label: "degrading",
      phrase: "Degradation recente detectee.",
      recentStatuses
    };
  }

  return {
    label: "oscillating",
    phrase: "Variations recentes observees, situation instable.",
    recentStatuses
  };
}

export function getTemporalGlobalSummaryText(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): string {
  const narrative = getTemporalNarrative(summary, logs);
  return getStructuredMessage(summary, { temporal: narrative.phrase });
}
