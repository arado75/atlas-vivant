import type { BrickStatus, RelationStatus } from "../types/brick";

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatRelationStatus(status: RelationStatus): string {
  switch (status) {
    case "observation":
      return "Observation";
    case "correlation":
      return "Correlation";
    case "probable_causality":
      return "Causalite probable";
    case "robust_causality":
      return "Causalite robuste";
  }
}

export function formatBrickStatus(status: BrickStatus): string {
  switch (status) {
    case "core":
      return "Noyau";
    case "validated":
      return "Validee";
    case "experimental":
      return "Experimentale";
    case "personal":
      return "Personnelle";
    case "community":
      return "Communautaire";
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
