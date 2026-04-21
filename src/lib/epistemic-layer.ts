import type { MindEpistemicStatus } from "../atlas-mind/attention-events";
import type { RelationStatus } from "../types/brick";

export type EpistemicLayerFilter =
  | "all"
  | "observation_only"
  | "hypotheses"
  | "causal_probable_plus";

export const epistemicLayerFilterOptions: EpistemicLayerFilter[] = [
  "all",
  "observation_only",
  "hypotheses",
  "causal_probable_plus"
];

export function epistemicLayerFilterLabel(filter: EpistemicLayerFilter): string {
  switch (filter) {
    case "all":
      return "Tout";
    case "observation_only":
      return "Observation";
    case "hypotheses":
      return "Hypotheses";
    case "causal_probable_plus":
      return "Causalite+";
  }
}

export function relationStatusMatchesEpistemicFilter(
  status: RelationStatus,
  filter: EpistemicLayerFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "observation_only":
      return status === "observation";
    case "hypotheses":
      return status === "correlation" || status === "probable_causality";
    case "causal_probable_plus":
      return status === "probable_causality" || status === "robust_causality";
  }
}

export function mindStatusMatchesEpistemicFilter(
  status: MindEpistemicStatus,
  filter: EpistemicLayerFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "observation_only":
      return status === "observation";
    case "hypotheses":
      return status === "concomitance" || status === "correlation" || status === "probable_causality";
    case "causal_probable_plus":
      return status === "probable_causality" || status === "robust_causality";
  }
}

