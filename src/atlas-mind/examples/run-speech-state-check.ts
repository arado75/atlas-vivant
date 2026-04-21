import {
  clearSpeechState,
  evaluateSpeechStateOutput,
  getSpeechState
} from "../decision-speech-state";

function printStep(label: string, text: string, isSignificantChange: boolean): void {
  const decision = evaluateSpeechStateOutput(text, isSignificantChange);
  const state = getSpeechState();

  console.log(
    `[AtlasMind][SpeechState][${label}] emitted=${decision.emitted} significant=${decision.isSignificantChange} reminder=${decision.usedPresenceReminder}`
  );
  console.log(
    `[AtlasMind][SpeechState][${label}] silenceCount=${state.silenceCount} lastPresenceEmissionAt=${state.lastPresenceEmissionAt}`
  );
  console.log(`[AtlasMind][SpeechState][${label}] message=${decision.text}`);
}

/**
 * Test manuel R1:
 * - silence progressif
 * - declenchement presence
 * - blocage cadence
 * - reset apres changement
 */
export function runAtlasMindSpeechStateExample() {
  clearSpeechState();

  const fullMessage =
    "Etat global: alert. Des desequilibres importants sont detectes. Activite moderee (stable).";

  printStep("initial_change_emit", fullMessage, true);
  printStep("silence_1", fullMessage, false);
  printStep("silence_2", fullMessage, false);
  printStep("presence_1", fullMessage, false);
  printStep("cadence_blocked_1", fullMessage, false);
  printStep("cadence_blocked_2", fullMessage, false);
  printStep("presence_2_spaced", fullMessage, false);
  printStep("reset_after_change", fullMessage, true);

  return {
    state: getSpeechState()
  };
}
