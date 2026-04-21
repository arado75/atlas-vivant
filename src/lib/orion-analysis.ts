import YAML from "yaml";
import type {
  BrickDefinition,
  BrickRelation,
  BrickSource,
  BrickStatus,
  MaturityStage,
  ReliabilityLevel,
  RelationStatus
} from "../types/brick";

export interface OrionProposalInput {
  name: string;
  domain: string;
  description: string;
  observables: string;
  sources: string;
}

export interface OrionSuggestion {
  node: string;
  label: string;
  type: RelationStatus;
  confidence: number;
  reason: string;
}

export interface OrionAnalysis {
  confidence: number;
  recommendedStatus: BrickStatus;
  maturityStage: MaturityStage;
  warnings: string[];
  rationale: string[];
  suggestions: OrionSuggestion[];
  normalizedSources: BrickSource[];
}

const hintMatrix = [
  {
    brickId: "wind_patterns",
    label: "Vents planetaires",
    keywords: ["vent", "atmosphere", "pression", "jet stream"],
    type: "probable_causality" as RelationStatus
  },
  {
    brickId: "surface_temperature",
    label: "Temperature de surface",
    keywords: ["temperature", "chaleur", "vague de chaleur", "climat", "ocean"],
    type: "probable_causality" as RelationStatus
  },
  {
    brickId: "ocean_currents",
    label: "Courants marins",
    keywords: ["ocean", "courant", "salinite", "marine"],
    type: "probable_causality" as RelationStatus
  },
  {
    brickId: "biosphere_migrations",
    label: "Migrations biologiques",
    keywords: ["animal", "migration", "plancton", "krill", "biodiversite"],
    type: "correlation" as RelationStatus
  },
  {
    brickId: "healthy_life_expectancy",
    label: "Esperance de vie en bonne sante",
    keywords: ["sante", "bien-etre", "respiration", "pollution", "population"],
    type: "correlation" as RelationStatus
  }
];

function parseSources(rawSources: string): BrickSource[] {
  return rawSources
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) => {
      const reliability: ReliabilityLevel =
        value.toLowerCase().includes("peer") || value.toLowerCase().includes("noaa")
          ? "high"
          : value.toLowerCase().includes("blog")
            ? "low"
            : "medium";

      return {
        type: index === 0 ? "dataset" : "reference",
        name: value,
        reliability
      };
    });
}

export function analyzeProposal(input: OrionProposalInput): OrionAnalysis {
  const combinedText = `${input.name} ${input.description} ${input.observables}`.toLowerCase();
  const normalizedSources = parseSources(input.sources);
  const warnings: string[] = [];
  const rationale: string[] = [];

  if (input.description.trim().length < 40) {
    warnings.push("La description est encore courte pour etablir une hypothese testable.");
  } else {
    rationale.push("La description donne deja un mecanisme exploitable pour le MVP.");
  }

  if (normalizedSources.length === 0) {
    warnings.push("Aucune source fournie: la brique doit rester personnelle ou experimentale.");
  } else if (normalizedSources.length === 1) {
    warnings.push("Une seule source detectee: la confiance doit rester prudente.");
  } else {
    rationale.push("Plusieurs sources sont presentes, ce qui soutient une evaluation plus robuste.");
  }

  const suggestions = hintMatrix
    .filter((hint) =>
      hint.keywords.some((keyword) => combinedText.includes(keyword))
    )
    .map<OrionSuggestion>((hint, index) => ({
      node: hint.brickId,
      label: hint.label,
      type: hint.type,
      confidence: Math.max(0.42, 0.74 - index * 0.08),
      reason: `Motif detecte via les termes: ${hint.keywords.slice(0, 2).join(", ")}`
    }));

  if (suggestions.length === 0) {
    warnings.push("Aucune connexion forte detectee automatiquement avec le registre local.");
  } else {
    rationale.push("Orion detecte des connexions possibles avec les briques deja chargees.");
  }

  const sourceScore =
    normalizedSources.length === 0
      ? 0.18
      : normalizedSources.reduce((total, source) => {
          if (source.reliability === "high") {
            return total + 0.18;
          }

          if (source.reliability === "medium") {
            return total + 0.12;
          }

          return total + 0.07;
        }, 0);

  const descriptionScore = Math.min(input.description.trim().length / 220, 0.32);
  const relationScore = Math.min(suggestions.length * 0.1, 0.24);
  const confidence = Math.min(0.92, 0.16 + sourceScore + descriptionScore + relationScore);

  const recommendedStatus: BrickStatus =
    confidence >= 0.72 && normalizedSources.length >= 2
      ? "experimental"
      : normalizedSources.length === 0
        ? "personal"
        : "experimental";

  const maturityStage: MaturityStage =
    confidence >= 0.72
      ? "analysis"
      : normalizedSources.length > 0
        ? "proposal"
        : "proposal";

  return {
    confidence,
    recommendedStatus,
    maturityStage,
    warnings,
    rationale,
    suggestions,
    normalizedSources
  };
}

export function createProposalBrick(
  input: OrionProposalInput,
  analysis: OrionAnalysis
): BrickDefinition {
  const normalizedId = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const upstream = analysis.suggestions.slice(0, 2).map<BrickRelation>((suggestion) => ({
    node: suggestion.node,
    type: suggestion.type,
    confidence: suggestion.confidence,
    note: suggestion.reason
  }));

  return {
    id: normalizedId || "proposal_brick",
    name: input.name || "Unnamed proposal",
    version: "0.1.0",
    domain: input.domain || "experimental",
    status: analysis.recommendedStatus,
    description: input.description,
    sources: analysis.normalizedSources,
    update_frequency: "manual",
    spatial_resolution: "unknown",
    temporal_resolution: "unknown",
    observables: input.observables
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    relations: {
      upstream,
      downstream: []
    },
    visualization: {
      mode: "proposal",
      color_scale: "orion"
    },
    maturity: {
      stage: analysis.maturityStage
    },
    notes: analysis.warnings,
    origin: "proposal"
  };
}

export function proposalToYaml(brick: BrickDefinition): string {
  return YAML.stringify(brick);
}
