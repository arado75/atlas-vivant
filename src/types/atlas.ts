export type LayerKind = "flows" | "tracks" | "heat" | "pulses";

export type GraphMode = "root" | "tree";

export type TimeMode = "paused" | "realtime" | "accelerated";

export type LonLat = [number, number];

export type TemperatureSourceType = "real" | "interpolated" | "fallback";

export interface TimeWindowState {
  startMs: number;
  endMs: number;
  rightEdgeLockedToNow: boolean;
}

export interface SceneProfileLite {
  flowDensity: number;
  flowSpeed: number;
  trailPersistence: number;
  aggregationLevel: number;
}

export interface TimelineMoment {
  index: number;
  shortLabel: string;
  label: string;
  compareLabel: string;
  season: string;
  note: string;
}

export interface LayerMeta {
  id: string;
  brickId: string;
  label: string;
  family: string;
  description: string;
  kind: LayerKind;
  color: string;
  visibleByDefault: boolean;
}

export interface FlowFeature {
  id: string;
  label: string;
  points: LonLat[];
  color: string;
  opacity: number;
  width: number;
  confidence: number;
}

export interface TrackFeature {
  id: string;
  label: string;
  path: LonLat[];
  comparePath?: LonLat[];
  color: string;
  width: number;
  confidence: number;
}

export interface HeatFeature {
  id: string;
  label: string;
  center: LonLat;
  compareCenter?: LonLat;
  radius: number;
  color: string;
  intensity: number[];
  intensityTimesMs?: number[];
  sourceType?: TemperatureSourceType;
  confidence: number;
}

export interface PulseFeature {
  id: string;
  label: string;
  center: LonLat;
  color: string;
  radius: number;
  values: number[];
  confidence: number;
}

export type CityImportance = "high" | "medium" | "low";

export interface CityTemperatureFeature {
  id: string;
  label: string;
  position: LonLat;
  baselineOffsetC?: number;
  trendFactor?: number;
  sourceType?: TemperatureSourceType;
  importance?: CityImportance;
  hourlyTimesMs?: number[];
  hourlyTempC?: number[];
}

export interface EventZoneFeature {
  id: string;
  label: string;
  kind: "heatwave" | "storm";
  center: LonLat;
  radius: number;
  intensity: number;
  startMs: number;
  endMs: number;
}

export interface LayerDataset {
  flows?: FlowFeature[];
  tracks?: TrackFeature[];
  heat?: HeatFeature[];
  pulses?: PulseFeature[];
  cityTemperatures?: CityTemperatureFeature[];
  eventZones?: EventZoneFeature[];
}

export interface GraphNode {
  id: string;
  label: string;
  domain: string;
  description: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  status: import("./brick").RelationStatus;
  confidence: number;
  delay: string;
}
