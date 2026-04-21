export type SpeechState = {
  silenceCount: number;
  lastPresenceEmissionAt: number | null;
};

export type SpeechStateDecision = {
  emitted: boolean;
  text: string;
  silenceCount: number;
  lastPresenceEmissionAt: number | null;
  runIndex: number;
  usedPresenceReminder: boolean;
  isSignificantChange: boolean;
};

const SILENCE_THRESHOLD = 3;
const MIN_RUNS_BETWEEN_REMINDERS = 3;

const SILENCE_TEXT = "Pas de changement significatif.";
const PRESENCE_TEXT = "Sous surveillance. Aucun changement significatif.";

const speechState: SpeechState = {
  silenceCount: 0,
  lastPresenceEmissionAt: null
};

let runIndex = 0;

function canEmitPresenceReminder(currentRun: number): boolean {
  if (speechState.silenceCount < SILENCE_THRESHOLD) {
    return false;
  }

  if (speechState.lastPresenceEmissionAt === null) {
    return true;
  }

  return currentRun - speechState.lastPresenceEmissionAt >= MIN_RUNS_BETWEEN_REMINDERS;
}

export function clearSpeechState(): void {
  speechState.silenceCount = 0;
  speechState.lastPresenceEmissionAt = null;
  runIndex = 0;
}

export function getSpeechState(): SpeechState {
  return {
    silenceCount: speechState.silenceCount,
    lastPresenceEmissionAt: speechState.lastPresenceEmissionAt
  };
}

export function evaluateSpeechStateOutput(
  text: string,
  isSignificantChange: boolean
): SpeechStateDecision {
  runIndex += 1;

  if (isSignificantChange) {
    speechState.silenceCount = 0;
    speechState.lastPresenceEmissionAt = runIndex;

    return {
      emitted: true,
      text,
      silenceCount: speechState.silenceCount,
      lastPresenceEmissionAt: speechState.lastPresenceEmissionAt,
      runIndex,
      usedPresenceReminder: false,
      isSignificantChange
    };
  }

  speechState.silenceCount += 1;

  const usedPresenceReminder = canEmitPresenceReminder(runIndex);
  if (usedPresenceReminder) {
    speechState.lastPresenceEmissionAt = runIndex;
  }

  return {
    emitted: false,
    text: usedPresenceReminder ? PRESENCE_TEXT : SILENCE_TEXT,
    silenceCount: speechState.silenceCount,
    lastPresenceEmissionAt: speechState.lastPresenceEmissionAt,
    runIndex,
    usedPresenceReminder,
    isSignificantChange
  };
}

export function getSpeechStateOutput(
  text: string,
  isSignificantChange: boolean
): { emitted: boolean; text: string } {
  const decision = evaluateSpeechStateOutput(text, isSignificantChange);
  return {
    emitted: decision.emitted,
    text: decision.text
  };
}
