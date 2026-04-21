import type { DecisionLogEntry } from "./decision-log";
import type { GlobalSummary } from "./decision-global-summary";
import type { AuditIssueType, AuditStatus } from "./decision-auditor";
import type { RecommendationType } from "./decision-advisor";
import {
  buildMessageParts,
  buildMessageText,
  type MessageParts
} from "./decision-message-builder";
import { getTemporalNarrative } from "./decision-temporal-consistency";
import {
  clearSpeechState,
  evaluateSpeechStateOutput,
  type SpeechStateDecision
} from "./decision-speech-state";
import { getFocusReason, getFocusSignal, type FocusReason, type FocusSignal } from "./decision-focus-core";
import {
  clearFocusStabilityState,
  resolveFocusStabilityForEmission,
  type FocusStabilityLabel
} from "./decision-focus-stability";

export type DiscourseState = {
  lastStatus: AuditStatus | null;
  lastEmittedAt: number | null;
  consecutiveSameStatusCount: number;
};

type MessageSignature = {
  status: AuditStatus;
  issues: AuditIssueType[];
  recommendations: RecommendationType[];
  topPatterns: string[];
};

export type DiscourseTag = "emit" | "silence" | "presence";

export type DiscourseEvaluation = {
  emitted: boolean;
  text: string;
  summary: GlobalSummary;
  temporalPhrase?: string;
  focus?: FocusSignal;
  focusReason?: FocusReason;
  focusStabilityLabel?: FocusStabilityLabel;
  temporalTag?: string;
  discourseTag?: DiscourseTag;
  memorySentence?: string;
  messageParts: MessageParts | null;
  finalMessageParts: MessageParts | null;
  speechDecision: SpeechStateDecision;
  discourseState: DiscourseState;
};

const discourseState: DiscourseState = {
  lastStatus: null,
  lastEmittedAt: null,
  consecutiveSameStatusCount: 0
};

let statusBeforeCurrentStreak: AuditStatus | null = null;
let lastMessageSignature: MessageSignature | null = null;
let legacyWrapperCache:
  | {
      summary: GlobalSummary;
      logs?: DecisionLogEntry[];
      evaluation: DiscourseEvaluation;
    }
  | null = null;

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

function resolveStatusPersistenceSentence(status: AuditStatus): string {
  if (status === "alert") {
    return "Alerte persistante.";
  }

  if (status === "watch") {
    return "Surveillance maintenue.";
  }

  return "Situation stable confirmee.";
}

function resolveMemorySentence(currentStatus: AuditStatus): string | null {
  if (discourseState.consecutiveSameStatusCount < 2) {
    return null;
  }

  if (statusBeforeCurrentStreak) {
    const previousRank = statusRank(statusBeforeCurrentStreak);
    const currentRank = statusRank(currentStatus);

    if (currentRank < previousRank) {
      return "Amelioration confirmee.";
    }

    if (currentRank > previousRank) {
      return "Degradation confirmee.";
    }
  }

  return resolveStatusPersistenceSentence(currentStatus);
}

function cloneDiscourseState(): DiscourseState {
  return {
    lastStatus: discourseState.lastStatus,
    lastEmittedAt: discourseState.lastEmittedAt,
    consecutiveSameStatusCount: discourseState.consecutiveSameStatusCount
  };
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildMessageSignature(summary: GlobalSummary): MessageSignature {
  return {
    status: summary.status,
    issues: sortUnique(summary.audit.issues.map((issue) => issue.type)) as AuditIssueType[],
    recommendations: sortUnique(
      summary.recommendations.recommendations
        .map((recommendation) => recommendation.type)
        .filter((type) => type !== "no_action_needed")
    ) as RecommendationType[],
    topPatterns: sortUnique(summary.topPatterns.map((pattern) => pattern.pattern.join(" -> ")))
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function hasSignificantChange(
  previous: MessageSignature | null,
  current: MessageSignature
): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.status !== current.status ||
    !arraysEqual(previous.issues, current.issues) ||
    !arraysEqual(previous.recommendations, current.recommendations) ||
    !arraysEqual(previous.topPatterns, current.topPatterns)
  );
}

function updateDiscourseStateAfterEmission(currentStatus: AuditStatus, runIndex: number): string | null {
  if (discourseState.lastStatus === currentStatus) {
    discourseState.consecutiveSameStatusCount += 1;
  } else {
    statusBeforeCurrentStreak = discourseState.lastStatus;
    discourseState.consecutiveSameStatusCount = 1;
  }

  discourseState.lastStatus = currentStatus;
  discourseState.lastEmittedAt = runIndex;

  return resolveMemorySentence(currentStatus);
}

function resolveDiscourseTag(speechDecision: SpeechStateDecision): DiscourseTag {
  if (speechDecision.emitted) {
    return "emit";
  }

  return speechDecision.usedPresenceReminder ? "presence" : "silence";
}

export function getDiscourseState(): DiscourseState {
  return cloneDiscourseState();
}

export function clearDiscourseEngineState(): void {
  discourseState.lastStatus = null;
  discourseState.lastEmittedAt = null;
  discourseState.consecutiveSameStatusCount = 0;
  statusBeforeCurrentStreak = null;
  lastMessageSignature = null;
  legacyWrapperCache = null;
  clearSpeechState();
  clearFocusStabilityState();
}

export function evaluateDiscourse(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): DiscourseEvaluation {
  // Usage recommande:
  // const evaluation = evaluateDiscourse(summary, logs);
  // puis utiliser uniquement des helpers purs bases sur `evaluation`.
  const temporal = getTemporalNarrative(summary, logs);

  const baseParts = buildMessageParts(summary, {
    temporal: temporal.phrase
  });
  const baseText = buildMessageText(baseParts);

  const currentSignature = buildMessageSignature(summary);
  const isSignificantChange = hasSignificantChange(lastMessageSignature, currentSignature);

  if (isSignificantChange) {
    lastMessageSignature = currentSignature;
  }

  const speechDecision = evaluateSpeechStateOutput(baseText, isSignificantChange);
  const discourseTag = resolveDiscourseTag(speechDecision);

  if (!speechDecision.emitted) {
    return {
      emitted: false,
      text: speechDecision.text,
      summary,
      temporalPhrase: temporal.phrase,
      temporalTag: temporal.label,
      discourseTag,
      messageParts: null,
      finalMessageParts: null,
      speechDecision,
      discourseState: cloneDiscourseState()
    };
  }

  const memorySentence = updateDiscourseStateAfterEmission(summary.status, speechDecision.runIndex);
  const focusReason = getFocusReason(summary);
  const focus = getFocusSignal(summary);
  const focusStabilityLabel = resolveFocusStabilityForEmission(focus);

  const memoryParts = buildMessageParts(summary, {
    temporal: temporal.phrase,
    memory: memorySentence ?? undefined
  });

  const finalMessageParts: MessageParts = {
    ...memoryParts,
    focus: `${focusStabilityLabel}: ${focusReason.signal.value} (${focusReason.reason}).`
  };

  return {
    emitted: true,
    text: buildMessageText(finalMessageParts),
    summary,
    temporalPhrase: temporal.phrase,
    focus,
    focusReason,
    focusStabilityLabel,
    temporalTag: temporal.label,
    discourseTag,
    memorySentence: memorySentence ?? undefined,
    messageParts: memoryParts,
    finalMessageParts,
    speechDecision,
    discourseState: cloneDiscourseState()
  };
}

export function getDiscourseEvaluationForLegacyWrapper(
  summary: GlobalSummary,
  logs?: DecisionLogEntry[]
): DiscourseEvaluation {
  if (
    legacyWrapperCache &&
    legacyWrapperCache.summary === summary &&
    legacyWrapperCache.logs === logs
  ) {
    return legacyWrapperCache.evaluation;
  }

  const evaluation = evaluateDiscourse(summary, logs);
  legacyWrapperCache = {
    summary,
    logs,
    evaluation
  };

  return evaluation;
}

export function getDiscourseText(summary: GlobalSummary, logs?: DecisionLogEntry[]): string {
  return evaluateDiscourse(summary, logs).text;
}
