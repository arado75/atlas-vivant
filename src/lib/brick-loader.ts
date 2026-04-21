import YAML from "yaml";
import type {
  BrickDefinition,
  BrickManifest,
  BrickRelation,
  BrickSource
} from "../types/brick";

interface LoadResult {
  bricks: BrickDefinition[];
  errors: string[];
}

type BrickLoadEntry = { brick: BrickDefinition } | { error: string };

function ensureSources(value: unknown): BrickSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const source = entry as Record<string, unknown>;
      return {
        type: String(source.type ?? "dataset"),
        name: String(source.name ?? "Unnamed source"),
        reliability:
          source.reliability === "high" ||
          source.reliability === "medium" ||
          source.reliability === "low"
            ? source.reliability
            : "medium",
        url: typeof source.url === "string" ? source.url : undefined
      };
    });
}

function ensureRelations(value: unknown): BrickRelation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const relation = entry as Record<string, unknown>;
      return {
        node: String(relation.node ?? "unknown_node"),
        type:
          relation.type === "observation" ||
          relation.type === "correlation" ||
          relation.type === "probable_causality" ||
          relation.type === "robust_causality"
            ? relation.type
            : "correlation",
        confidence: Number(relation.confidence ?? 0.4),
        delay: typeof relation.delay === "string" ? relation.delay : undefined,
        note: typeof relation.note === "string" ? relation.note : undefined
      };
    });
}

function normalizeBrick(raw: unknown): BrickDefinition {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("invalid brick payload");
  }

  const brick = raw as Record<string, unknown>;
  if (typeof brick.id !== "string" || typeof brick.name !== "string") {
    throw new Error("missing brick id or name");
  }

  const relations = (brick.relations ?? {}) as Record<string, unknown>;
  const visualization = (brick.visualization ?? {}) as Record<string, unknown>;
  const maturity = (brick.maturity ?? {}) as Record<string, unknown>;

  return {
    id: brick.id,
    name: brick.name,
    version: typeof brick.version === "string" ? brick.version : "0.1.0",
    domain: typeof brick.domain === "string" ? brick.domain : "unknown",
    status:
      brick.status === "core" ||
      brick.status === "validated" ||
      brick.status === "experimental" ||
      brick.status === "personal" ||
      brick.status === "community"
        ? brick.status
        : "experimental",
    description:
      typeof brick.description === "string"
        ? brick.description
        : "No description provided.",
    sources: ensureSources(brick.sources),
    update_frequency:
      typeof brick.update_frequency === "string"
        ? brick.update_frequency
        : "unknown",
    spatial_resolution:
      typeof brick.spatial_resolution === "string"
        ? brick.spatial_resolution
        : "unknown",
    temporal_resolution:
      typeof brick.temporal_resolution === "string"
        ? brick.temporal_resolution
        : "unknown",
    observables: Array.isArray(brick.observables)
      ? brick.observables.map((item) => String(item))
      : [],
    relations: {
      upstream: ensureRelations(relations.upstream),
      downstream: ensureRelations(relations.downstream)
    },
    visualization: {
      mode: typeof visualization.mode === "string" ? visualization.mode : "overlay",
      color_scale:
        typeof visualization.color_scale === "string"
          ? visualization.color_scale
          : "aurora"
    },
    maturity: {
      stage:
        maturity.stage === "proposal" ||
        maturity.stage === "analysis" ||
        maturity.stage === "experimentation" ||
        maturity.stage === "calibration" ||
        maturity.stage === "validation" ||
        maturity.stage === "integration"
          ? maturity.stage
          : "analysis"
    },
    notes: Array.isArray(brick.notes) ? brick.notes.map((item) => String(item)) : [],
    origin: "registry"
  };
}

export async function loadBrickRegistry(): Promise<LoadResult> {
  const manifestResponse = await fetch("/bricks/manifest.json");
  if (!manifestResponse.ok) {
    throw new Error("unable to load brick manifest");
  }

  const manifest = (await manifestResponse.json()) as BrickManifest;
  const results = await Promise.all<BrickLoadEntry>(
    manifest.bricks.map(async (path) => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`unable to load ${path}`);
        }

        const text = await response.text();
        const raw = path.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
        return { brick: normalizeBrick(raw) };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? `${path}: ${error.message}`
              : `${path}: unknown error`
        };
      }
    })
  );

  return {
    bricks: results.flatMap((result) =>
      "brick" in result && result.brick ? [result.brick] : []
    ),
    errors: results.flatMap((result) =>
      "error" in result && result.error ? [result.error] : []
    )
  };
}

