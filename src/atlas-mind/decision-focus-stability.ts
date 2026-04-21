import type { FocusSignal } from "./decision-focus-core";

export type FocusStabilityState = {
  lastEmittedFocusType: FocusSignal["type"] | null;
  lastEmittedFocusValue: string | null;
};

export type FocusStabilityLabel =
  | "Point principal"
  | "Point principal maintenu"
  | "Nouveau point principal";

const focusStabilityState: FocusStabilityState = {
  lastEmittedFocusType: null,
  lastEmittedFocusValue: null
};

function sameFocus(signal: FocusSignal): boolean {
  return (
    focusStabilityState.lastEmittedFocusType === signal.type &&
    focusStabilityState.lastEmittedFocusValue === signal.value
  );
}

function updateFocusState(signal: FocusSignal): void {
  focusStabilityState.lastEmittedFocusType = signal.type;
  focusStabilityState.lastEmittedFocusValue = signal.value;
}

export function getFocusStabilityState(): FocusStabilityState {
  return {
    lastEmittedFocusType: focusStabilityState.lastEmittedFocusType,
    lastEmittedFocusValue: focusStabilityState.lastEmittedFocusValue
  };
}

export function clearFocusStabilityState(): void {
  focusStabilityState.lastEmittedFocusType = null;
  focusStabilityState.lastEmittedFocusValue = null;
}

export function resolveFocusStabilityForEmission(signal: FocusSignal): FocusStabilityLabel {
  let label: FocusStabilityLabel = "Point principal";

  if (focusStabilityState.lastEmittedFocusType !== null) {
    label = sameFocus(signal) ? "Point principal maintenu" : "Nouveau point principal";
  }

  updateFocusState(signal);
  return label;
}
