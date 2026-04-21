import type { TriageDecision } from "./types";
import type { MindOrchestrationOutput, MindOrchestratedRoute } from "./p2-02-orchestrator";

export type MindEventCategory = "temperature_anomaly" | "runtime_availability" | "data_quality" | "generic";
export type MindEpistemicStatus =
  | "observation"
  | "concomitance"
  | "correlation"
  | "probable_causality"
  | "robust_causality";

export interface MindAttentionEvent {
  id: string;
  createdAtMs: number;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  repeatCount: number;
  dedupeKey: string;
  ingressId: string;
  route: MindOrchestratedRoute;
  category: MindEventCategory;
  decision: TriageDecision;
  priority: "low" | "medium" | "high";
  epistemicStatus: MindEpistemicStatus;
  confidence: number;
  title: string;
  summary: string;
  cityLabel: string | null;
}

export function priorityRank(priority: "low" | "medium" | "high"): number {
  switch (priority) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}

function meanConfidenceFromCycleResult(cycleResult: MindOrchestrationOutput["cycleResult"]): number {
  if (!cycleResult || typeof cycleResult !== "object") {
    return 0.5;
  }

  const evaluations = (cycleResult as { evaluations?: Array<{ confidence?: unknown }> }).evaluations;
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return 0.5;
  }

  const values = evaluations
    .map((evaluation) => Number(evaluation.confidence))
    .filter((confidence) => Number.isFinite(confidence));

  if (values.length === 0) {
    return 0.5;
  }

  const avg = values.reduce((sum, confidence) => sum + confidence, 0) / values.length;
  return Math.max(0, Math.min(1, avg));
}

function extractCityLabel(cycleResult: MindOrchestrationOutput["cycleResult"]): string | null {
  if (!cycleResult || typeof cycleResult !== "object") {
    return null;
  }

  const withSnapshot = cycleResult as {
    snapshot?: {
      cityLabel?: unknown;
      city?: unknown;
    };
    cityQuery?: unknown;
  };

  if (typeof withSnapshot.snapshot?.cityLabel === "string" && withSnapshot.snapshot.cityLabel.trim().length > 0) {
    return withSnapshot.snapshot.cityLabel.trim();
  }

  if (typeof withSnapshot.snapshot?.city === "string" && withSnapshot.snapshot.city.trim().length > 0) {
    return withSnapshot.snapshot.city.trim();
  }

  if (typeof withSnapshot.cityQuery === "string" && withSnapshot.cityQuery.trim().length > 0) {
    return withSnapshot.cityQuery.trim();
  }

  return null;
}

function routeCategory(route: MindOrchestratedRoute): MindEventCategory {
  switch (route) {
    case "p2-01.temperature-mini-cycle":
      return "temperature_anomaly";
    case "p2-03.temperature-runtime-availability-cycle":
      return "runtime_availability";
    case "p2-04.temperature-data-quality-cycle":
      return "data_quality";
    default:
      return "generic";
  }
}

function routeEpistemicStatus(route: MindOrchestratedRoute): MindEpistemicStatus {
  switch (route) {
    case "p2-03.temperature-runtime-availability-cycle":
    case "p2-04.temperature-data-quality-cycle":
      return "observation";
    case "p2-01.temperature-mini-cycle":
      return "concomitance";
    default:
      return "observation";
  }
}

function routeTitle(route: MindOrchestratedRoute, cityLabel: string | null): string {
  switch (route) {
    case "p2-01.temperature-mini-cycle":
      return cityLabel ? `Anomalie thermique - ${cityLabel}` : "Anomalie thermique";
    case "p2-03.temperature-runtime-availability-cycle":
      return "Disponibilite runtime temperature";
    case "p2-04.temperature-data-quality-cycle":
      return cityLabel ? `Qualite des donnees - ${cityLabel}` : "Qualite des donnees temperature";
    default:
      return "Evenement Atlas Mind";
  }
}

function buildDedupeKey(
  route: MindOrchestratedRoute,
  category: MindEventCategory,
  decision: TriageDecision,
  cityLabel: string | null
): string {
  const normalizedCity = cityLabel ? cityLabel.trim().toLowerCase() : "global";
  return `${route}|${category}|${decision}|${normalizedCity}`;
}

export function buildMindAttentionEvent(output: MindOrchestrationOutput): MindAttentionEvent | null {
  if (!output.accepted || output.routedTo === "none") {
    return null;
  }

  if (output.decision === "ignore") {
    return null;
  }

  const cityLabel = extractCityLabel(output.cycleResult);
  const confidence = meanConfidenceFromCycleResult(output.cycleResult);
  const nowMs = Date.now();
  const category = routeCategory(output.routedTo);
  const dedupeKey = buildDedupeKey(output.routedTo, category, output.decision, cityLabel);

  return {
    id: `mind-event:${output.ingressId}:${nowMs}`,
    createdAtMs: nowMs,
    firstSeenAtMs: nowMs,
    lastSeenAtMs: nowMs,
    repeatCount: 1,
    dedupeKey,
    ingressId: output.ingressId,
    route: output.routedTo,
    category,
    decision: output.decision,
    priority: output.priority,
    epistemicStatus: routeEpistemicStatus(output.routedTo),
    confidence,
    title: routeTitle(output.routedTo, cityLabel),
    summary: output.reason,
    cityLabel
  };
}
