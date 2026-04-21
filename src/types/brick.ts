export type BrickStatus =
  | "core"
  | "validated"
  | "experimental"
  | "personal"
  | "community";

export type RelationStatus =
  | "observation"
  | "correlation"
  | "probable_causality"
  | "robust_causality";

export type ReliabilityLevel = "low" | "medium" | "high";

export type MaturityStage =
  | "proposal"
  | "analysis"
  | "experimentation"
  | "calibration"
  | "validation"
  | "integration";

export type BrickOrigin = "registry" | "proposal";

export interface BrickSource {
  type: string;
  name: string;
  reliability: ReliabilityLevel;
  url?: string;
}

export interface BrickRelation {
  node: string;
  type: RelationStatus;
  confidence: number;
  delay?: string;
  note?: string;
}

export interface BrickDefinition {
  id: string;
  name: string;
  version: string;
  domain: string;
  status: BrickStatus;
  description: string;
  sources: BrickSource[];
  update_frequency: string;
  spatial_resolution: string;
  temporal_resolution: string;
  observables: string[];
  relations: {
    upstream: BrickRelation[];
    downstream: BrickRelation[];
  };
  visualization: {
    mode: string;
    color_scale: string;
  };
  maturity: {
    stage: MaturityStage;
  };
  notes: string[];
  origin: BrickOrigin;
}

export interface BrickManifest {
  bricks: string[];
}
