// @ts-nocheck
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type WheelEventHandler
} from "react";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import { layerCatalog } from "../../data/mockCatalog";
import { mockLayerData } from "../../data/mockAtlasData";
import { temperatureReferenceCities } from "../../data/temperatureReferenceCities";
import { clamp } from "../../lib/formatters";
import { getTemperatureLegendStops, intensityToTemperatureC, temperatureToColor } from "../../lib/temperature-scale";
import {
  isPerfDebugEnabled,
  isPerfFlagEnabled,
  perfInc,
  perfNow,
  perfObserveDuration
} from "../../lib/perf-debug";
import { buildSceneProfileLite } from "../../lib/scene-profile-lite";
import {
  type TemperatureViewLevel,
  getTemperatureViewBudget,
  isRegionalTemperatureAnchorCity,
  resolveTemperatureViewLevel
} from "../../lib/temperature-view";
import { buildTimeEngine, formatWindowDate, formatWindowDuration } from "../../lib/time-engine";
import {
  loadTemperatureLayerRuntime,
  type TemperatureLayerRuntime,
  type TemperatureRuntimeRefreshEvent,
  type TemperatureRuntimeRefreshPhase
} from "../../lib/temperature/temperature-data-source";
import {
  type HoveredCityTemperature,
  type TemperatureMeshOptions,
  renderTemperatureCityPoint,
  renderTemperatureEventZone,
  renderTemperatureFieldMesh,
  renderTemperatureStreetLabels,
  renderTemperatureTooltip
} from "./temperature-overlay";
import type {
  FlowFeature,
  HeatFeature,
  LayerDataset,
  LonLat,
  PulseFeature,
  SceneProfileLite,
  TrackFeature,
  TemperatureSourceType
} from "../../types/atlas";

const viewBoxWidth = 1040;
const viewBoxHeight = 760;
const baseScale = 300;
const MIN_GLOBE_ZOOM = 0.66;
const MAX_GLOBE_ZOOM = 42;
const MAX_ROTATION_LAT = 82;
const WHEEL_BURST_GAP_MS = 420;
const WHEEL_BURST_RESET_MS = 520;
const WHEEL_DIRECTION_DEADZONE = 0.35;
const REALTIME_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DRAG_FRAME_MIN_ROTATION_DELTA = 0.03;
const INTERACTION_FLOW_LIMIT = 22;
const INTERACTION_TRACK_LIMIT = 18;
const INTERACTION_PULSE_LIMIT = 26;
const TEMPERATURE_LIGHT_SNAPSHOT_STORAGE_KEY = "atlas.temperature.lightSnapshot.v1";
const TEMPERATURE_DEBUG_REQUIRED_CITY_IDS = [
  "paris",
  "london",
  "new_york",
  "mexico_city",
  "sao_paulo",
  "lagos",
  "cairo",
  "mumbai",
  "tokyo",
  "sydney"
] as const;

type VisualRegime = "short" | "medium" | "long";
type RenderQualityMode = "auto" | "quality" | "eco";

const defaultView = {
  rotation: [-18, -16] as [number, number],
  zoom: 1.06
};

const AUTO_ECO_ENABLE_SCORE = 0.72;
const AUTO_ECO_DISABLE_SCORE = 0.36;
const FRAME_OVER_BUDGET_MS = 24;
const FRAME_RELIEF_MS = 18;
const GLOBE_INVERT_Y_STORAGE_KEY = "atlas.globe.invertY.v1";
const MAX_INTERACTION_PROFILE_SAMPLES = 120;
const MAX_INTERACTION_PROFILE_SESSIONS = 10;
const MAX_INTERACTION_FEATURE_SAMPLES = 320;
const MAX_INTERACTION_HOTSPOT_FEATURES = 8;
const INTERACTION_HOTSPOT_LOOKBACK_MS = 220;

const focusViews: Record<string, { rotation: [number, number]; zoom: number }> = {
  wind_patterns: { rotation: [-14, -20], zoom: 1.22 },
  surface_temperature: { rotation: [-12, -6], zoom: 1.28 },
  ocean_currents: { rotation: [-28, -2], zoom: 1.34 },
  aviation_routes: { rotation: [-8, 18], zoom: 1.46 },
  maritime_routes: { rotation: [-10, 8], zoom: 1.42 },
  biosphere_migrations: { rotation: [-32, 16], zoom: 1.48 },
  healthy_life_expectancy: { rotation: [-2, 24], zoom: 1.52 }
};

const landGeoJson = feature(
  worldAtlas as never,
  (worldAtlas as { objects: { countries: unknown } }).objects.countries as never
) as { type: string; features: unknown[] };

const fallbackTemperatureCityPool = temperatureReferenceCities
  .filter((city) => city.importance !== "low")
  .slice(0, 140);
const fallbackTemperatureDataset: LayerDataset = {
  ...mockLayerData.surface_temperature,
  cityTemperatures: fallbackTemperatureCityPool
};

interface ViewState {
  rotation: [number, number];
  zoom: number;
}

interface TemperatureRefreshUiState {
  phase: TemperatureRuntimeRefreshPhase | "idle";
  progress: number;
  detail: string;
  updatedAtMs: number;
}
interface TemperatureLightSnapshotCity {
  id: string;
  label: string;
  position: LonLat;
  sourceType: TemperatureSourceType;
  hourlyTimesMs: number[];
  hourlyTempC: number[];
}

interface TemperatureLightSnapshot {
  version: 1;
  capturedAtMs: number;
  cityTemperatures: TemperatureLightSnapshotCity[];
}

interface InteractionFrameSample {
  timestampMs: number;
  frameMs: number;
  qualityMode: RenderQualityMode;
  ecoActive: boolean;
}

interface InteractionFrameSessionSummary {
  startedAtMs: number;
  endedAtMs: number;
  frames: number;
  over24Frames: number;
  over32Frames: number;
  over50Frames: number;
  worstFrameMs: number;
  longestOver24Streak: number;
}

interface InteractionHotspotSummary {
  feature: string;
  hits: number;
  avgMs: number;
  maxMs: number;
}

interface InteractionFeatureSample {
  feature: string;
  durationMs: number;
  timestampMs: number;
}

interface InteractionFeatureHotspotStats {
  hits: number;
  totalMs: number;
  maxMs: number;
  lastSeenAtMs: number;
}

interface InteractionFrameProfileState {
  totalFrames: number;
  over24Frames: number;
  over32Frames: number;
  over50Frames: number;
  worstFrameMs: number;
  sessionCount: number;
  currentSessionStartedAtMs: number | null;
  currentSessionFrames: number;
  currentSessionOver24Frames: number;
  currentSessionOver32Frames: number;
  currentSessionOver50Frames: number;
  currentSessionWorstFrameMs: number;
  currentSessionCurrentOver24Streak: number;
  currentSessionLongestOver24Streak: number;
  recentOver24Samples: InteractionFrameSample[];
  recentSessions: InteractionFrameSessionSummary[];
  featureHotspots: Record<string, InteractionFeatureHotspotStats>;
}

interface InteractionPerfSummary {
  totalFrames: number;
  over24Frames: number;
  worstFrameMs: number;
  active: boolean;
  topHotspots: InteractionHotspotSummary[];
}

function createInteractionFrameProfileState(): InteractionFrameProfileState {
  return {
    totalFrames: 0,
    over24Frames: 0,
    over32Frames: 0,
    over50Frames: 0,
    worstFrameMs: 0,
    sessionCount: 0,
    currentSessionStartedAtMs: null,
    currentSessionFrames: 0,
    currentSessionOver24Frames: 0,
    currentSessionOver32Frames: 0,
    currentSessionOver50Frames: 0,
    currentSessionWorstFrameMs: 0,
    currentSessionCurrentOver24Streak: 0,
    currentSessionLongestOver24Streak: 0,
    recentOver24Samples: [],
    recentSessions: [],
    featureHotspots: {}
  };
}

function timestampNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function summarizeInteractionHotspots(
  hotspots: Record<string, InteractionFeatureHotspotStats>
): InteractionHotspotSummary[] {
  return Object.entries(hotspots)
    .map(([feature, stats]) => ({
      feature,
      hits: stats.hits,
      avgMs: Number((stats.totalMs / Math.max(1, stats.hits)).toFixed(2)),
      maxMs: Number(stats.maxMs.toFixed(2))
    }))
    .sort((left, right) => {
      if (right.hits !== left.hits) {
        return right.hits - left.hits;
      }
      if (right.avgMs !== left.avgMs) {
        return right.avgMs - left.avgMs;
      }
      return right.maxMs - left.maxMs;
    })
    .slice(0, 3);
}

function hotspotFeatureLabel(feature: string): string {
  switch (feature) {
    case "temperature_mesh":
      return "mesh temp";
    case "temperature_city_projection":
      return "villes temp";
    case "temperature_event_sort":
      return "zones temp";
    case "temperature_city_nodes":
      return "nodes temp";
    case "flows_nodes":
      return "flows";
    case "tracks_nodes":
      return "tracks";
    case "pulses_nodes":
      return "pulses";
    default:
      return feature.replace(/_/g, " ");
  }
}

function cloneInteractionFrameProfileState(profile: InteractionFrameProfileState): InteractionFrameProfileState {
  return JSON.parse(JSON.stringify(profile)) as InteractionFrameProfileState;
}

function readStoredInvertYPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.localStorage.getItem(GLOBE_INVERT_Y_STORAGE_KEY);
    if (!rawValue) {
      return false;
    }

    return rawValue === "1" || rawValue === "true" || rawValue === "yes";
  } catch {
    return false;
  }
}

function persistInvertYPreference(invertY: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(GLOBE_INVERT_Y_STORAGE_KEY, invertY ? "1" : "0");
  } catch {
    // ignore storage write failures.
  }
}

function buildTemperatureLightSnapshot(runtime: TemperatureLayerRuntime): TemperatureLightSnapshot | null {
  const cityTemperatures = (runtime.dataset.cityTemperatures ?? [])
    .filter((city) => {
      if (!Array.isArray(city.hourlyTimesMs) || !Array.isArray(city.hourlyTempC)) {
        return false;
      }

      if (city.hourlyTimesMs.length === 0 || city.hourlyTimesMs.length !== city.hourlyTempC.length) {
        return false;
      }

      return true;
    })
    .map((city) => ({
      id: city.id,
      label: city.label,
      position: city.position,
      sourceType: city.sourceType ?? "fallback",
      hourlyTimesMs: city.hourlyTimesMs!,
      hourlyTempC: city.hourlyTempC!
    }));

  if (cityTemperatures.length === 0) {
    return null;
  }

  return {
    version: 1,
    capturedAtMs: runtime.fetchedAtMs,
    cityTemperatures
  };
}

function persistTemperatureLightSnapshot(snapshot: TemperatureLightSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TEMPERATURE_LIGHT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage write failures to keep runtime resilient.
  }
}

function readTemperatureLightSnapshot(): TemperatureLightSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TEMPERATURE_LIGHT_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      version?: unknown;
      capturedAtMs?: unknown;
      cityTemperatures?: unknown;
    };

    if (parsed.version !== 1 || typeof parsed.capturedAtMs !== "number" || !Array.isArray(parsed.cityTemperatures)) {
      return null;
    }

    const cities: TemperatureLightSnapshotCity[] = parsed.cityTemperatures
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const value = entry as {
          id?: unknown;
          label?: unknown;
          position?: unknown;
          sourceType?: unknown;
          hourlyTimesMs?: unknown;
          hourlyTempC?: unknown;
        };

        if (
          typeof value.id !== "string" ||
          typeof value.label !== "string" ||
          !Array.isArray(value.position) ||
          value.position.length !== 2 ||
          typeof value.position[0] !== "number" ||
          typeof value.position[1] !== "number" ||
          !Array.isArray(value.hourlyTimesMs) ||
          !Array.isArray(value.hourlyTempC)
        ) {
          return null;
        }

        const hourlyTimesMs = value.hourlyTimesMs.filter((item): item is number => typeof item === "number");
        const hourlyTempC = value.hourlyTempC.filter((item): item is number => typeof item === "number");

        if (hourlyTimesMs.length === 0 || hourlyTimesMs.length !== hourlyTempC.length) {
          return null;
        }

        const sourceType =
          value.sourceType === "real" || value.sourceType === "interpolated" || value.sourceType === "fallback"
            ? value.sourceType
            : "fallback";

        return {
          id: value.id,
          label: value.label,
          position: [value.position[0], value.position[1]],
          sourceType,
          hourlyTimesMs,
          hourlyTempC
        };
      })
      .filter((entry): entry is TemperatureLightSnapshotCity => Boolean(entry));

    if (cities.length === 0) {
      return null;
    }

    return {
      version: 1,
      capturedAtMs: parsed.capturedAtMs,
      cityTemperatures: cities
    };
  } catch {
    return null;
  }
}

function buildTemperatureDatasetFromLightSnapshot(snapshot: TemperatureLightSnapshot): LayerDataset {
  return {
    heat: [],
    eventZones: [],
    cityTemperatures: snapshot.cityTemperatures
  };
}

function linePath(pathBuilder: ReturnType<typeof geoPath>, points: LonLat[]): string | null {
  if (points.length < 2) {
    return null;
  }

  return (
    pathBuilder({
      type: "LineString",
      coordinates: points
    }) ?? null
  );
}

function interpolatePoint(start: LonLat, end: LonLat, amount: number): LonLat {
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount
  ];
}

function interpolatePolyline(points: LonLat[], amount: number): LonLat {
  if (points.length === 1) {
    return points[0];
  }

  const segmentCount = points.length - 1;
  const wrapped = ((amount % 1) + 1) % 1;
  const scaled = wrapped * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaled));
  const localAmount = scaled - segmentIndex;
  return interpolatePoint(points[segmentIndex], points[segmentIndex + 1], localAmount);
}

function sampleSeries(values: number[], index: number): number {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  const wrapped = ((index % values.length) + values.length) % values.length;
  const left = Math.floor(wrapped);
  const right = (left + 1) % values.length;
  const amount = wrapped - left;
  return values[left] + (values[right] - values[left]) * amount;
}

function sampleTemporalSeriesAtTime(
  timesMs: number[] | undefined,
  values: number[] | undefined,
  cursorMs: number
): number | null {
  if (!timesMs || !values || timesMs.length === 0 || values.length === 0 || timesMs.length !== values.length) {
    return null;
  }

  if (cursorMs <= timesMs[0]) {
    return values[0];
  }

  const lastIndex = timesMs.length - 1;
  if (cursorMs >= timesMs[lastIndex]) {
    return values[lastIndex];
  }

  for (let index = 0; index < lastIndex; index += 1) {
    const leftTime = timesMs[index];
    const rightTime = timesMs[index + 1];

    if (cursorMs >= leftTime && cursorMs <= rightTime) {
      const ratio = clamp((cursorMs - leftTime) / Math.max(1, rightTime - leftTime), 0, 1);
      return values[index] + (values[index + 1] - values[index]) * ratio;
    }
  }

  return values[lastIndex];
}

function geoDistanceInDegrees(a: LonLat, b: LonLat): number {
  const meanLatRad = ((a[1] + b[1]) * 0.5 * Math.PI) / 180;
  const deltaLon = (a[0] - b[0]) * Math.cos(meanLatRad);
  const deltaLat = a[1] - b[1];
  return Math.hypot(deltaLon, deltaLat);
}

function sampleHeatTemperatureAtTime(heat: HeatFeature, cursorMs: number): number {
  const timed = sampleTemporalSeriesAtTime(heat.intensityTimesMs, heat.intensity, cursorMs);
  if (typeof timed === "number") {
    return intensityToTemperatureC(timed);
  }

  const date = new Date(cursorMs);
  const seasonalIndex = date.getUTCMonth() + (date.getUTCDate() - 1) / Math.max(1, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate());
  return intensityToTemperatureC(sampleSeries(heat.intensity, seasonalIndex));
}

function interpolateTemperatureFromHeatFeatures(position: LonLat, heatFeatures: HeatFeature[], cursorMs: number): number | null {
  if (heatFeatures.length === 0) {
    return null;
  }

  const ranked = heatFeatures
    .map((heat) => {
      const distance = Math.max(0.01, geoDistanceInDegrees(position, heat.center));
      const weight = 1 / (distance * distance + 0.2);
      return {
        temperatureC: sampleHeatTemperatureAtTime(heat, cursorMs),
        weight,
        distance
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 20);

  if (ranked.length === 0) {
    return null;
  }

  const aggregate = ranked.reduce(
    (accumulator, entry) => {
      accumulator.weighted += entry.temperatureC * entry.weight;
      accumulator.sum += entry.weight;
      return accumulator;
    },
    { weighted: 0, sum: 0 }
  );

  if (aggregate.sum <= 0.0001) {
    return null;
  }

  return aggregate.weighted / aggregate.sum;
}

function seriesRowsAroundCursor(
  timesMs: number[] | undefined,
  values: number[] | undefined,
  cursorMs: number,
  windowHours = 6
): Array<{ iso: string; tempC: number; deltaMinutes: number }> {
  if (!timesMs || !values || timesMs.length === 0 || values.length === 0 || timesMs.length !== values.length) {
    return [];
  }

  const windowMs = windowHours * 60 * 60 * 1000;

  return timesMs
    .map((timeMs, index) => ({
      iso: new Date(timeMs).toISOString(),
      tempC: values[index],
      deltaMinutes: Math.round((timeMs - cursorMs) / 60000)
    }))
    .filter((entry) => Math.abs(entry.deltaMinutes) <= (windowMs / 60000))
    .slice(0, 17);
}
function samplePathPoint(path: LonLat[], index: number): LonLat {
  if (path.length === 0) {
    return [0, 0];
  }

  if (path.length === 1) {
    return path[0];
  }

  const wrapped = ((index % path.length) + path.length) % path.length;
  const left = Math.floor(wrapped);
  const right = (left + 1) % path.length;
  const amount = wrapped - left;
  return interpolatePoint(path[left], path[right], amount);
}

function trailPoints(path: LonLat[], index: number, trailCount: number): LonLat[] {
  const points: LonLat[] = [];
  const cappedCount = Math.max(2, trailCount);

  for (let cursor = cappedCount; cursor >= 0; cursor -= 1) {
    points.push(samplePathPoint(path, index - cursor));
  }

  return points;
}

function simplifyPolyline(points: LonLat[], stride: number): LonLat[] {
  if (stride <= 1 || points.length <= 3) {
    return points;
  }

  const simplified: LonLat[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += stride) {
    simplified.push(points[index]);
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function stableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function isPointFrontFacing(point: LonLat, rotation: [number, number]): boolean {
  const degreesToRadians = Math.PI / 180;
  const longitude = point[0] * degreesToRadians;
  const latitude = point[1] * degreesToRadians;
  const centerLongitude = -rotation[0] * degreesToRadians;
  const centerLatitude = -rotation[1] * degreesToRadians;

  const cosineAngularDistance =
    Math.sin(centerLatitude) * Math.sin(latitude) +
    Math.cos(centerLatitude) * Math.cos(latitude) * Math.cos(longitude - centerLongitude);

  return cosineAngularDistance > 0.01;
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function globeCenterFromRotation(rotation: [number, number]): LonLat {
  return [normalizeLongitude(-rotation[0]), clamp(-rotation[1], -89, 89)];
}

function layerOpacity(dataset: LayerDataset): number {
  if (dataset.flows?.length) {
    return 0.96;
  }

  if (dataset.tracks?.length) {
    return 1;
  }

  if (dataset.heat?.length) {
    return 0.94;
  }

  return 0.9;
}

function modeLabel(mode: "paused" | "realtime" | "accelerated"): string {
  switch (mode) {
    case "paused":
      return "Pause";
    case "realtime":
      return "Temps reel";
    case "accelerated":
      return "Accelere";
  }
}

function qualityModeLabel(mode: RenderQualityMode): string {
  switch (mode) {
    case "auto":
      return "Auto";
    case "quality":
      return "Qualite";
    case "eco":
      return "Eco";
  }
}

function degradeTemperatureViewLevel(level: TemperatureViewLevel): TemperatureViewLevel {
  if (level === "local") {
    return "regional";
  }
  return "globe";
}

function visualRegimeFromAggregation(aggregationLevel: number): VisualRegime {
  if (aggregationLevel < 0.3) {
    return "short";
  }

  if (aggregationLevel < 0.72) {
    return "medium";
  }

  return "long";
}

function formatRefreshPhaseLabel(state: TemperatureRefreshUiState): string {
  if (state.phase === "download") {
    return `Telechargement: ${Math.round(state.progress * 100)}%`;
  }

  if (state.phase === "processing") {
    return `Traitement: ${Math.round(state.progress * 100)}%`;
  }

  if (state.phase === "ready") {
    return "Pret. Globe consultable.";
  }

  if (state.phase === "error") {
    return "Mise a jour indisponible.";
  }

  return "En attente de synchronisation.";
}
function formatSnapshotAgeLabel(ageMinutes: number | null): string {
  if (ageMinutes === null) {
    return "--";
  }

  if (ageMinutes <= 0) {
    return "<1 min";
  }

  return `${ageMinutes} min`;
}


function formatRuntimeProvider(provider: TemperatureLayerRuntime["source"] | null): string | null {
  if (provider === "open-meteo") {
    return "Open-Meteo";
  }

  if (provider === "met-norway") {
    return "MET Norway";
  }

  return null;
}

type BrickFamily = "wind" | "ocean" | "aviation" | "maritime" | "biosphere" | "health";

interface FamilySignature {
  family: BrickFamily;
  density: number;
  speed: number;
  persistence: number;
  aggregationBias: number;
  longRetention: number;
  dashShort: string;
  dashMedium: string;
  trailScale: number;
  markerScale: number;
  jitter: number;
  pulseRings: number;
}

const familyByLayerId: Record<string, BrickFamily> = {
  wind_patterns: "wind",
  ocean_currents: "ocean",
  surface_temperature: "ocean",
  aviation_routes: "aviation",
  maritime_routes: "maritime",
  biosphere_migrations: "biosphere",
  healthy_life_expectancy: "health"
};

const familySignatures: Record<BrickFamily, FamilySignature> = {
  wind: {
    family: "wind",
    density: 1.24,
    speed: 1.2,
    persistence: 0.92,
    aggregationBias: -0.06,
    longRetention: 0.64,
    dashShort: "18 12",
    dashMedium: "22 14",
    trailScale: 1,
    markerScale: 1,
    jitter: 0,
    pulseRings: 1
  },
  ocean: {
    family: "ocean",
    density: 0.84,
    speed: 0.72,
    persistence: 1.26,
    aggregationBias: 0.1,
    longRetention: 0.86,
    dashShort: "30 22",
    dashMedium: "36 26",
    trailScale: 1.2,
    markerScale: 0.82,
    jitter: 0,
    pulseRings: 1
  },
  aviation: {
    family: "aviation",
    density: 1.14,
    speed: 1.42,
    persistence: 0.78,
    aggregationBias: 0.12,
    longRetention: 0.42,
    dashShort: "8 16",
    dashMedium: "10 14",
    trailScale: 1.06,
    markerScale: 1.26,
    jitter: 0.03,
    pulseRings: 1
  },
  maritime: {
    family: "maritime",
    density: 0.74,
    speed: 0.62,
    persistence: 1.34,
    aggregationBias: 0.22,
    longRetention: 0.9,
    dashShort: "24 18",
    dashMedium: "28 20",
    trailScale: 1.44,
    markerScale: 0.78,
    jitter: 0.01,
    pulseRings: 1
  },
  biosphere: {
    family: "biosphere",
    density: 0.92,
    speed: 0.88,
    persistence: 0.72,
    aggregationBias: -0.03,
    longRetention: 0.58,
    dashShort: "6 18",
    dashMedium: "8 18",
    trailScale: 0.84,
    markerScale: 0.9,
    jitter: 0.18,
    pulseRings: 1
  },
  health: {
    family: "health",
    density: 0.56,
    speed: 0.54,
    persistence: 1.16,
    aggregationBias: 0.18,
    longRetention: 0.84,
    dashShort: "10 18",
    dashMedium: "12 18",
    trailScale: 1,
    markerScale: 1,
    jitter: 0,
    pulseRings: 3
  }
};

function resolveFamilySignature(layerId: string): FamilySignature {
  const family = familyByLayerId[layerId] ?? "wind";
  return familySignatures[family];
}

function sceneProfileForFamily(sceneProfile: SceneProfileLite, signature: FamilySignature): SceneProfileLite {
  return {
    flowDensity: clamp(sceneProfile.flowDensity * signature.density, 0.16, 1.5),
    flowSpeed: sceneProfile.flowSpeed <= 0 ? 0 : clamp(sceneProfile.flowSpeed * signature.speed, 0.08, 3),
    trailPersistence: clamp(sceneProfile.trailPersistence * signature.persistence, 0.14, 1),
    aggregationLevel: clamp(sceneProfile.aggregationLevel + signature.aggregationBias, 0, 1)
  };
}

function shouldKeepEntity(
  entityId: string,
  entityIndex: number,
  visualRegime: VisualRegime,
  signature: FamilySignature,
  emphasized: boolean,
  phase: number
): boolean {
  if (emphasized || visualRegime === "short") {
    return true;
  }

  const hashNorm = ((stableHash(entityId) + entityIndex * 19) % 100) / 100;
  const regimeGate = visualRegime === "medium" ? 0.9 - Math.max(0, signature.aggregationBias) * 0.45 : signature.longRetention;
  const variance =
    signature.family === "biosphere"
      ? ((Math.sin((phase + hashNorm * 0.5) * Math.PI * 2) + 1) * 0.06 - 0.03)
      : 0;

  return hashNorm <= clamp(regimeGate + variance, 0.12, 0.98);
}
export function InteractiveGlobe() {
  const perfDebugEnabled = isPerfDebugEnabled();
  const activeLayers = useAtlasStore((state) => state.activeLayers);
  const compareEnabled = useAtlasStore((state) => state.compareEnabled);
  const timeMode = useAtlasStore((state) => state.timeMode);
  const selectedBrickId = useAtlasStore((state) => state.selectedBrickId);
  const multiScaleViewPreset = useAtlasStore((state) => state.multiScaleViewPreset);
  const setFocusedTemperatureCity = useAtlasStore((state) => state.setFocusedTemperatureCity);
  const timeWindow = useAtlasStore((state) => state.timeWindow);
  const [viewState, setViewState] = useState<ViewState>(defaultView);
  const [globeHasFocus, setGlobeHasFocus] = useState(false);
  const [isDragInteractionActive, setIsDragInteractionActive] = useState(false);
  const [isZoomInteractionActive, setIsZoomInteractionActive] = useState(false);
  const [invertYDrag, setInvertYDrag] = useState<boolean>(() => readStoredInvertYPreference());
  const [renderQualityMode, setRenderQualityMode] = useState<RenderQualityMode>("auto");
  const [autoEcoActive, setAutoEcoActive] = useState(false);
  const [interactionPerfSummary, setInteractionPerfSummary] = useState<InteractionPerfSummary>({
    totalFrames: 0,
    over24Frames: 0,
    worstFrameMs: 0,
    active: false,
    topHotspots: []
  });
  const [hoveredCity, setHoveredCity] = useState<HoveredCityTemperature | null>(null);
  const [temperatureViewLevel, setTemperatureViewLevel] = useState<TemperatureViewLevel>("globe");
  const [temperatureRuntime, setTemperatureRuntime] = useState<TemperatureLayerRuntime | null>(null);
  const [temperatureLightSnapshot, setTemperatureLightSnapshot] = useState<TemperatureLightSnapshot | null>(() => readTemperatureLightSnapshot());
  const [temperatureRefreshUi, setTemperatureRefreshUi] = useState<TemperatureRefreshUiState>({
    phase: "idle",
    progress: 0,
    detail: "idle",
    updatedAtMs: Date.now()
  });
  const [nextTemperatureRefreshAtMs, setNextTemperatureRefreshAtMs] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewStateRef = useRef<ViewState>(defaultView);
  const targetViewRef = useRef<ViewState>(defaultView);
  const temperatureViewRef = useRef<TemperatureViewLevel>("globe");
  const temperatureRefreshRunRef = useRef(0);
  const wheelFocusRef = useRef<{ lonLat: LonLat | null; lastEventMs: number; lastDirection: number }>({
    lonLat: null,
    lastEventMs: 0,
    lastDirection: 0
  });
  const wheelResetTimeoutRef = useRef<number | null>(null);
  const zoomInteractionTimeoutRef = useRef<number | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const pendingWheelFactorRef = useRef(1);
  const dragOrigin = useRef<{ x: number; y: number; rotation: [number, number] } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragRotationRef = useRef<[number, number] | null>(null);
  const hoverClearTimeoutRef = useRef<number | null>(null);
  const hoverClearScheduledAtRef = useRef<number | null>(null);
  const hoverEventTimestampRef = useRef<number | null>(null);
  const lastHoverCityIdRef = useRef<string | null>(null);
  const interactionActiveRef = useRef(false);
  const renderQualityModeRef = useRef<RenderQualityMode>("auto");
  const autoEcoActiveRef = useRef(false);
  const framePressureScoreRef = useRef(0);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const frameWatchRafRef = useRef<number | null>(null);
  const interactionProfileRef = useRef<InteractionFrameProfileState>(createInteractionFrameProfileState());
  const interactionFeatureSamplesRef = useRef<InteractionFeatureSample[]>([]);
  const interactionProfilePublishAtRef = useRef(0);
  const pendingRuntimeRef = useRef<TemperatureLayerRuntime | null>(null);
  const temperatureMeshCacheRef = useRef<{ signature: string; node: JSX.Element | null } | null>(null);

  const timeEngine = useMemo(() => buildTimeEngine(timeWindow, Date.now()), [timeWindow]);
  const sceneProfile = useMemo(
    () => buildSceneProfileLite(timeEngine.windowDurationMs, timeMode),
    [timeEngine.windowDurationMs, timeMode]
  );
  const effectiveEcoMode = renderQualityMode === "eco" || (renderQualityMode === "auto" && autoEcoActive);
  const effectiveSceneProfile = useMemo(() => {
    if (!effectiveEcoMode) {
      return sceneProfile;
    }

    return {
      flowDensity: clamp(sceneProfile.flowDensity * 0.72, 0.18, 1),
      flowSpeed: clamp(sceneProfile.flowSpeed * 0.9, 0, 2.2),
      trailPersistence: clamp(sceneProfile.trailPersistence * 0.84, 0.14, 1),
      aggregationLevel: clamp(sceneProfile.aggregationLevel + 0.16, 0, 1)
    };
  }, [sceneProfile, effectiveEcoMode]);

  const temperatureReferenceMs = Math.floor(timeEngine.endMs / (60 * 60 * 1000)) * (60 * 60 * 1000);
  const temperatureCityTemplates = useMemo(
    () =>
      temperatureReferenceCities.map((city) => ({ id: city.id, label: city.label, position: city.position })),
    []
  );

  const visualRegime = useMemo(
    () => visualRegimeFromAggregation(effectiveSceneProfile.aggregationLevel),
    [effectiveSceneProfile.aggregationLevel]
  );
  const effectiveTemperatureViewLevel = effectiveEcoMode
    ? degradeTemperatureViewLevel(temperatureViewLevel)
    : temperatureViewLevel;

  const temperatureViewBudget = useMemo(() => {
    const baseBudget = getTemperatureViewBudget(effectiveTemperatureViewLevel);
    if (!effectiveEcoMode) {
      return baseBudget;
    }

    return {
      maxEventZones: Math.max(0, Math.floor(baseBudget.maxEventZones * 0.5)),
      maxCities: Math.max(6, Math.floor(baseBudget.maxCities * 0.62)),
      maxHeatCells: Math.max(42, Math.floor(baseBudget.maxHeatCells * 0.55))
    };
  }, [effectiveTemperatureViewLevel, effectiveEcoMode]);
  const isFrontFacing = useMemo(
    () => (point: LonLat) => isPointFrontFacing(point, viewState.rotation),
    [viewState.rotation]
  );
  const cameraCenter = useMemo(() => globeCenterFromRotation(viewState.rotation), [viewState.rotation]);
  const temperatureMeshOptions = useMemo<TemperatureMeshOptions>(
    () => ({
      cameraCenter,
      zoom: viewState.zoom,
      refinementMode: effectiveEcoMode ? "off" : "france_paris"
    }),
    [cameraCenter, viewState.zoom, effectiveEcoMode]
  );

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([viewBoxWidth / 2, viewBoxHeight / 2 + 18])
        .scale(baseScale * viewState.zoom)
        .rotate(viewState.rotation)
        .clipAngle(90),
    [viewState]
  );

  const pathBuilder = useMemo(() => geoPath(projection), [projection]);
  const staticPathStartMs = perfNow();
  const spherePath = pathBuilder({ type: "Sphere" }) ?? "";
  const graticulePath = pathBuilder(geoGraticule10()) ?? "";
  perfInc("base_path_calls", 2);
  perfObserveDuration("base_path_ms", perfNow() - staticPathStartMs);

  const landPathStartMs = perfNow();
  const landPath = useMemo(() => {
    const path = pathBuilder(landGeoJson as never) ?? "";
    perfInc("land_path_calls", path ? 1 : 0);
    return path;
  }, [pathBuilder]);
  perfObserveDuration("land_path_compute_ms", perfNow() - landPathStartMs);

  const baseVisibleLayers = useMemo(
    () => layerCatalog.filter((layer) => activeLayers[layer.id]),
    [activeLayers]
  );
  const selectedLayer = layerCatalog.find((layer) => layer.brickId === selectedBrickId);
  const selectedLayerId = selectedLayer?.id;
  const hasFocusedLayer = Boolean(selectedLayerId && activeLayers[selectedLayerId]);
  const focusColor = selectedLayer?.color ?? "#8fcfff";
  const breathing = 0;
  const animatedCycleIndex = timeEngine.cycleIndex % 12;
  const globalPhase = timeEngine.endNorm % 1;

  useEffect(() => {
    const focusView = selectedBrickId ? focusViews[selectedBrickId] ?? defaultView : defaultView;
    const [focusLon, focusLat] = focusView.rotation;

    const targetZoom =
      multiScaleViewPreset === "planetary"
        ? 1.02
        : multiScaleViewPreset === "systemic"
          ? Math.max(1.18, focusView.zoom)
          : multiScaleViewPreset === "regional"
            ? Math.max(1.82, focusView.zoom * 1.44)
            : Math.max(3.2, focusView.zoom * 2.5);

    setViewState((current) => {
      const nextRotation: [number, number] = [focusLon, clamp(focusLat, -MAX_ROTATION_LAT, MAX_ROTATION_LAT)];
      const nextZoom = clamp(targetZoom, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM);
      const isSameRotation =
        Math.abs(current.rotation[0] - nextRotation[0]) < 0.01 &&
        Math.abs(current.rotation[1] - nextRotation[1]) < 0.01;
      const isSameZoom = Math.abs(current.zoom - nextZoom) < 0.01;
      return isSameRotation && isSameZoom
        ? current
        : {
            rotation: nextRotation,
            zoom: nextZoom
          };
    });
  }, [multiScaleViewPreset, selectedBrickId]);

  const liveTemperatureDataset = temperatureRuntime?.dataset ?? null;
  const persistedTemperatureDataset = temperatureLightSnapshot
    ? buildTemperatureDatasetFromLightSnapshot(temperatureLightSnapshot)
    : null;
  const displayedTemperatureDataset =
    liveTemperatureDataset ?? persistedTemperatureDataset ?? fallbackTemperatureDataset;
  const temperatureSampleCursor = timeEngine.endMs;
  const temperatureSampler = temperatureRuntime?.getTemperature;
  const forcedInteractionActive = isPerfFlagEnabled("forceInteractionActive");
  const effectiveInteractionActive = isDragInteractionActive || isZoomInteractionActive || forcedInteractionActive;
  const performanceThrottleActive = effectiveInteractionActive || effectiveEcoMode;
  const recordInteractionFeatureSample = (feature: string, durationMs: number) => {
    if (!effectiveInteractionActive || durationMs < 0.2) {
      return;
    }

    const nextSample: InteractionFeatureSample = {
      feature,
      durationMs: Number(durationMs.toFixed(3)),
      timestampMs: timestampNow()
    };
    const buffer = interactionFeatureSamplesRef.current;
    buffer.push(nextSample);
    if (buffer.length > MAX_INTERACTION_FEATURE_SAMPLES) {
      buffer.splice(0, buffer.length - MAX_INTERACTION_FEATURE_SAMPLES);
    }
  };

  const visibleLayers = useMemo(() => {
    if (!performanceThrottleActive) {
      return baseVisibleLayers;
    }

    const prioritizedLayerIds = new Set<string>(["surface_temperature"]);
    if (hasFocusedLayer && selectedLayerId) {
      prioritizedLayerIds.add(selectedLayerId);
    }

    return baseVisibleLayers.filter((layer) => prioritizedLayerIds.has(layer.id));
  }, [baseVisibleLayers, performanceThrottleActive, hasFocusedLayer, selectedLayerId]);
  const temperatureLayerActive = Boolean(activeLayers.surface_temperature);
  const temperatureHoverCandidates = useMemo(() => {
    if (!temperatureLayerActive) {
      return [] as HoveredCityTemperature[];
    }

    const allCities = displayedTemperatureDataset.cityTemperatures ?? [];
    const centerX = viewBoxWidth / 2;
    const centerY = viewBoxHeight / 2 + 18;
    const ranked = allCities
      .map((city) => {
        if (!isFrontFacing(city.position)) {
          return null;
        }

        const projected = projection(city.position);
        if (!projected) {
          return null;
        }

        const distance = Math.hypot(projected[0] - centerX, projected[1] - centerY);
        const sampledTemperatureC = temperatureSampler
          ? temperatureSampler(city.position[1], city.position[0], temperatureSampleCursor)
          : interpolateTemperatureFromHeatFeatures(
              city.position,
              displayedTemperatureDataset.heat ?? [],
              temperatureSampleCursor
            );
        return {
          score: distance,
          payload: {
            id: city.id,
            label: city.label,
            x: projected[0],
            y: projected[1],
            temperatureC: sampledTemperatureC,
            deltaC: 0,
            color: temperatureToColor(sampledTemperatureC),
            kind: "city" as const,
            sourceType: city.sourceType ?? (temperatureSampler ? "interpolated" : "fallback")
          }
        };
      })
      .filter((entry): entry is { score: number; payload: HoveredCityTemperature } => Boolean(entry))
      .sort((left, right) => left.score - right.score)
      .slice(0, 180)
      .map((entry) => entry.payload);

    return ranked;
  }, [
    temperatureLayerActive,
    displayedTemperatureDataset,
    isFrontFacing,
    projection,
    temperatureSampler,
    temperatureSampleCursor
  ]);

  const setTemperatureHover = (payload: HoveredCityTemperature | null) => {
    setHoveredCity((current) => {
      if (!payload && !current) {
        return current;
      }

      if (!payload || !current) {
        return payload;
      }

      const sameKind = current.kind === payload.kind;
      const sameId = current.id === payload.id;
      const sameSource = current.sourceType === payload.sourceType;
      const samePosition = Math.abs(current.x - payload.x) < 0.35 && Math.abs(current.y - payload.y) < 0.35;
      const sameThermalValue =
        Math.abs(current.temperatureC - payload.temperatureC) < 0.05 &&
        Math.abs(current.deltaC - payload.deltaC) < 0.05;

      return sameKind && sameId && sameSource && samePosition && sameThermalValue ? current : payload;
    });

    if (payload?.kind === "city") {
      if (lastHoverCityIdRef.current !== payload.id) {
        lastHoverCityIdRef.current = payload.id;
        setFocusedTemperatureCity({
          id: payload.id,
          label: payload.label,
          updatedAtMs: Date.now()
        });
      }
      return;
    }

    lastHoverCityIdRef.current = null;
  };

  const clearWheelFocus = () => {
    wheelFocusRef.current = {
      lonLat: null,
      lastEventMs: 0,
      lastDirection: 0
    };
  };

  const scheduleTemperatureHoverClear = (expectedId: string) => {
    setHoveredCity((current) => (current?.id === expectedId ? null : current));
  };

  const applyTemperatureRuntime = (runtime: TemperatureLayerRuntime) => {
    setTemperatureRuntime(runtime);
    setNextTemperatureRefreshAtMs(runtime.fetchedAtMs + REALTIME_REFRESH_INTERVAL_MS);

    const snapshot = buildTemperatureLightSnapshot(runtime);
    if (snapshot) {
      setTemperatureLightSnapshot(snapshot);
      persistTemperatureLightSnapshot(snapshot);
    }
  };

  useEffect(() => {
    viewStateRef.current = viewState;
    targetViewRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    temperatureViewRef.current = temperatureViewLevel;
  }, [temperatureViewLevel]);

  useEffect(() => {
    renderQualityModeRef.current = renderQualityMode;
  }, [renderQualityMode]);

  useEffect(() => {
    autoEcoActiveRef.current = autoEcoActive;
  }, [autoEcoActive]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const mode = query.get("renderQuality");
    if (mode === "auto" || mode === "quality" || mode === "eco") {
      setRenderQualityMode(mode);
    }

    const invertYQuery = query.get("invertY");
    if (invertYQuery === "1" || invertYQuery === "true" || invertYQuery === "yes") {
      setInvertYDrag(true);
    }
    if (invertYQuery === "0" || invertYQuery === "false" || invertYQuery === "no") {
      setInvertYDrag(false);
    }
  }, []);

  useEffect(() => {
    persistInvertYPreference(invertYDrag);
  }, [invertYDrag]);

  useEffect(() => {
    if (renderQualityMode === "auto") {
      return;
    }

    framePressureScoreRef.current = 0;
    setAutoEcoActive(false);
  }, [renderQualityMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tick = (timestampMs: number) => {
      const previous = lastFrameTimestampRef.current;
      lastFrameTimestampRef.current = timestampMs;

      const activeQualityMode = renderQualityModeRef.current;
      const activeEcoMode = autoEcoActiveRef.current;
      if (previous !== null) {
        const deltaMs = timestampMs - previous;
        if (activeQualityMode === "auto") {
          const overload = deltaMs > FRAME_OVER_BUDGET_MS ? Math.min(1, (deltaMs - FRAME_RELIEF_MS) / 18) : 0;
          const relief = deltaMs <= FRAME_RELIEF_MS ? 0.05 : 0.012;
          const nextScore = clamp(framePressureScoreRef.current + overload * 0.11 - relief, 0, 1);
          framePressureScoreRef.current = nextScore;

          setAutoEcoActive((current) => {
            if (current) {
              return nextScore > AUTO_ECO_DISABLE_SCORE;
            }
            return nextScore >= AUTO_ECO_ENABLE_SCORE;
          });
        }

        const interactionActive = interactionActiveRef.current;
        const profile = interactionProfileRef.current;
        if (interactionActive) {
          if (profile.currentSessionStartedAtMs === null) {
            profile.currentSessionStartedAtMs = Date.now();
            profile.currentSessionFrames = 0;
            profile.currentSessionOver24Frames = 0;
            profile.currentSessionOver32Frames = 0;
            profile.currentSessionOver50Frames = 0;
            profile.currentSessionWorstFrameMs = 0;
            profile.currentSessionCurrentOver24Streak = 0;
            profile.currentSessionLongestOver24Streak = 0;
            profile.sessionCount += 1;
          }

          profile.totalFrames += 1;
          profile.currentSessionFrames += 1;
          profile.worstFrameMs = Math.max(profile.worstFrameMs, deltaMs);
          profile.currentSessionWorstFrameMs = Math.max(profile.currentSessionWorstFrameMs, deltaMs);
          perfInc("interaction_frame_samples", 1);
          perfObserveDuration("interaction_frame_ms", deltaMs);

          if (deltaMs > FRAME_OVER_BUDGET_MS) {
            profile.over24Frames += 1;
            profile.currentSessionOver24Frames += 1;
            profile.currentSessionCurrentOver24Streak += 1;
            profile.currentSessionLongestOver24Streak = Math.max(
              profile.currentSessionLongestOver24Streak,
              profile.currentSessionCurrentOver24Streak
            );
            perfInc("interaction_frames_over24", 1);
            profile.recentOver24Samples.push({
              timestampMs: Date.now(),
              frameMs: Number(deltaMs.toFixed(3)),
              qualityMode: activeQualityMode,
              ecoActive: activeEcoMode
            });
            if (profile.recentOver24Samples.length > MAX_INTERACTION_PROFILE_SAMPLES) {
              profile.recentOver24Samples.splice(
                0,
                profile.recentOver24Samples.length - MAX_INTERACTION_PROFILE_SAMPLES
              );
            }

            const sampleCutoff = timestampMs - INTERACTION_HOTSPOT_LOOKBACK_MS;
            const recentFeatureSamples = interactionFeatureSamplesRef.current.filter(
              (sample) => sample.timestampMs >= sampleCutoff
            );
            interactionFeatureSamplesRef.current = recentFeatureSamples;

            if (recentFeatureSamples.length > 0) {
              const topSamples = [...recentFeatureSamples]
                .sort((left, right) => right.durationMs - left.durationMs)
                .slice(0, 3);
              for (const sample of topSamples) {
                const currentHotspot = profile.featureHotspots[sample.feature] ?? {
                  hits: 0,
                  totalMs: 0,
                  maxMs: 0,
                  lastSeenAtMs: 0
                };
                currentHotspot.hits += 1;
                currentHotspot.totalMs += sample.durationMs;
                currentHotspot.maxMs = Math.max(currentHotspot.maxMs, sample.durationMs);
                currentHotspot.lastSeenAtMs = Date.now();
                profile.featureHotspots[sample.feature] = currentHotspot;
              }
            } else {
              const unknownHotspot = profile.featureHotspots.unknown ?? {
                hits: 0,
                totalMs: 0,
                maxMs: 0,
                lastSeenAtMs: 0
              };
              unknownHotspot.hits += 1;
              unknownHotspot.lastSeenAtMs = Date.now();
              profile.featureHotspots.unknown = unknownHotspot;
            }

            const hotspotEntries = Object.entries(profile.featureHotspots).sort((left, right) => {
              if (right[1].hits !== left[1].hits) {
                return right[1].hits - left[1].hits;
              }
              return right[1].lastSeenAtMs - left[1].lastSeenAtMs;
            });
            if (hotspotEntries.length > MAX_INTERACTION_HOTSPOT_FEATURES) {
              const keep = new Set(hotspotEntries.slice(0, MAX_INTERACTION_HOTSPOT_FEATURES).map(([feature]) => feature));
              profile.featureHotspots = Object.fromEntries(
                Object.entries(profile.featureHotspots).filter(([feature]) => keep.has(feature))
              );
            }
          } else {
            profile.currentSessionCurrentOver24Streak = 0;
          }

          if (deltaMs > 32) {
            profile.over32Frames += 1;
            profile.currentSessionOver32Frames += 1;
            perfInc("interaction_frames_over32", 1);
          }
          if (deltaMs > 50) {
            profile.over50Frames += 1;
            profile.currentSessionOver50Frames += 1;
            perfInc("interaction_frames_over50", 1);
          }
        } else if (profile.currentSessionStartedAtMs !== null) {
          profile.recentSessions.push({
            startedAtMs: profile.currentSessionStartedAtMs,
            endedAtMs: Date.now(),
            frames: profile.currentSessionFrames,
            over24Frames: profile.currentSessionOver24Frames,
            over32Frames: profile.currentSessionOver32Frames,
            over50Frames: profile.currentSessionOver50Frames,
            worstFrameMs: Number(profile.currentSessionWorstFrameMs.toFixed(3)),
            longestOver24Streak: profile.currentSessionLongestOver24Streak
          });
          if (profile.recentSessions.length > MAX_INTERACTION_PROFILE_SESSIONS) {
            profile.recentSessions.splice(0, profile.recentSessions.length - MAX_INTERACTION_PROFILE_SESSIONS);
          }

          profile.currentSessionStartedAtMs = null;
          profile.currentSessionFrames = 0;
          profile.currentSessionOver24Frames = 0;
          profile.currentSessionOver32Frames = 0;
          profile.currentSessionOver50Frames = 0;
          profile.currentSessionWorstFrameMs = 0;
          profile.currentSessionCurrentOver24Streak = 0;
          profile.currentSessionLongestOver24Streak = 0;
        }

        if (timestampMs - interactionProfilePublishAtRef.current > 500) {
          interactionProfilePublishAtRef.current = timestampMs;
          setInteractionPerfSummary({
            totalFrames: profile.totalFrames,
            over24Frames: profile.over24Frames,
            worstFrameMs: Number(profile.worstFrameMs.toFixed(3)),
            active: interactionActive,
            topHotspots: summarizeInteractionHotspots(profile.featureHotspots)
          });
        }
      }

      frameWatchRafRef.current = window.requestAnimationFrame(tick);
    };

    frameWatchRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameWatchRafRef.current !== null) {
        window.cancelAnimationFrame(frameWatchRafRef.current);
        frameWatchRafRef.current = null;
      }
    };
  }, [renderQualityMode]);

  useEffect(() => {
    interactionActiveRef.current = effectiveInteractionActive;
    if (!effectiveInteractionActive && pendingRuntimeRef.current) {
      const stagedRuntime = pendingRuntimeRef.current;
      pendingRuntimeRef.current = null;
      applyTemperatureRuntime(stagedRuntime);
    }
    if (!effectiveInteractionActive) {
      interactionFeatureSamplesRef.current = [];
    }
  }, [effectiveInteractionActive]);

  useEffect(
    () => () => {
      if (wheelResetTimeoutRef.current !== null) {
        window.clearTimeout(wheelResetTimeoutRef.current);
      }
      if (zoomInteractionTimeoutRef.current !== null) {
        window.clearTimeout(zoomInteractionTimeoutRef.current);
      }
      if (hoverClearTimeoutRef.current !== null) {
        window.clearTimeout(hoverClearTimeoutRef.current);
      }
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
      }
      if (frameWatchRafRef.current !== null) {
        window.cancelAnimationFrame(frameWatchRafRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setTemperatureViewLevel((previousLevel) => resolveTemperatureViewLevel(viewState.zoom, previousLevel));
  }, [viewState.zoom]);

  useEffect(() => {
    const runId = ++temperatureRefreshRunRef.current;
    let cancelled = false;

    async function refreshRuntime(forceRefresh: boolean) {
      try {
        const runtime = await loadTemperatureLayerRuntime(temperatureReferenceMs, temperatureCityTemplates, Date.now(), {
          forceRefresh,
          onRefreshEvent: (event: TemperatureRuntimeRefreshEvent) => {
            if (cancelled || runId !== temperatureRefreshRunRef.current) {
              return;
            }

            setTemperatureRefreshUi({
              phase: event.phase,
              progress: event.progress,
              detail: event.detail,
              updatedAtMs: event.timestampMs
            });
          }
        });

        if (cancelled || runId !== temperatureRefreshRunRef.current) {
          return;
        }

        if (runtime) {
          if (interactionActiveRef.current) {
            pendingRuntimeRef.current = runtime;
            setNextTemperatureRefreshAtMs(runtime.fetchedAtMs + REALTIME_REFRESH_INTERVAL_MS);
          } else {
            applyTemperatureRuntime(runtime);
          }
        } else {
          setNextTemperatureRefreshAtMs(Date.now() + REALTIME_REFRESH_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && runId === temperatureRefreshRunRef.current) {
          setTemperatureRefreshUi({
            phase: "error",
            progress: 1,
            detail: "runtime_unavailable",
            updatedAtMs: Date.now()
          });
          setNextTemperatureRefreshAtMs(Date.now() + REALTIME_REFRESH_INTERVAL_MS);
        }
      }
    }

    refreshRuntime(false);
    const timer = window.setInterval(() => {
      refreshRuntime(true);
    }, REALTIME_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [temperatureReferenceMs, temperatureCityTemplates]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    if (!query.has("tempDebug")) {
      return;
    }

    const datasetCities = displayedTemperatureDataset.cityTemperatures ?? [];
    const cityById = new Map(datasetCities.map((city) => [city.id, city]));

    const reportRequiredCities = () =>
      TEMPERATURE_DEBUG_REQUIRED_CITY_IDS.map((cityId) => {
        const templateCity = temperatureReferenceCities.find((entry) => entry.id === cityId) ?? null;
        const runtimeCity = cityById.get(cityId);

        const sampledFromSeries = runtimeCity
          ? sampleTemporalSeriesAtTime(
              runtimeCity.hourlyTimesMs,
              runtimeCity.hourlyTempC,
              temperatureSampleCursor
            )
          : null;

        const sampledFromSampler =
          sampledFromSeries === null && templateCity && temperatureSampler
            ? temperatureSampler(templateCity.position[1], templateCity.position[0], temperatureSampleCursor)
            : null;

        const sampledFromHeat =
          sampledFromSeries === null && sampledFromSampler === null && templateCity
            ? interpolateTemperatureFromHeatFeatures(
                templateCity.position,
                displayedTemperatureDataset.heat ?? [],
                temperatureSampleCursor
              )
            : null;

        const sampledTemperatureC =
          typeof sampledFromSeries === "number"
            ? sampledFromSeries
            : typeof sampledFromSampler === "number"
              ? sampledFromSampler
              : typeof sampledFromHeat === "number"
                ? sampledFromHeat
                : null;

        return {
          id: cityId,
          label: runtimeCity?.label ?? templateCity?.label ?? cityId,
          sampledTemperatureC,
          sourceType: runtimeCity?.sourceType ?? (temperatureRuntime ? "interpolated" : "fallback")
        };
      });

    (window as unknown as { __atlasTempDebug?: unknown }).__atlasTempDebug = {
      sampleCursorIso: new Date(temperatureSampleCursor).toISOString(),
      lastOpenMeteoRefreshIso: temperatureRuntime ? new Date(temperatureRuntime.fetchedAtMs).toISOString() : null,
      reportRequiredCities
    };
  }, [displayedTemperatureDataset, temperatureRuntime, temperatureSampleCursor, temperatureSampler]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    if (!query.has("perfDebug")) {
      return;
    }

    (window as unknown as { __atlasPerfApi?: unknown }).__atlasPerfApi = {
      setLayerActive: (layerId: string, isActive: boolean) => {
        useAtlasStore.setState((state) => ({
          activeLayers: {
            ...state.activeLayers,
            [layerId]: Boolean(isActive)
          }
        }));
      },
      getLayerActive: (layerId: string) => Boolean(useAtlasStore.getState().activeLayers[layerId]),
      setQualityMode: (mode: RenderQualityMode) => {
        if (mode === "auto" || mode === "quality" || mode === "eco") {
          setRenderQualityMode(mode);
        }
      },
      getQualityMode: () => renderQualityMode,
      getAutoEcoActive: () => autoEcoActive,
      setInvertY: (invertY: boolean) => {
        setInvertYDrag(Boolean(invertY));
      },
      getInvertY: () => invertYDrag,
      getInteractionFrameProfile: () => cloneInteractionFrameProfileState(interactionProfileRef.current),
      resetInteractionFrameProfile: () => {
        interactionProfileRef.current = createInteractionFrameProfileState();
        interactionFeatureSamplesRef.current = [];
        interactionProfilePublishAtRef.current = 0;
        setInteractionPerfSummary({
          totalFrames: 0,
          over24Frames: 0,
          worstFrameMs: 0,
          active: interactionActiveRef.current,
          topHotspots: []
        });
      },
      resetPerf: () => {
        const perfRegistry = (window as unknown as { __ATLAS_PERF__?: { snapshotAndReset?: () => unknown } }).__ATLAS_PERF__;
        return perfRegistry?.snapshotAndReset ? perfRegistry.snapshotAndReset() : null;
      }
    };
  }, [renderQualityMode, autoEcoActive, invertYDrag]);

  const onPointerDown: PointerEventHandler<SVGSVGElement> = (event) => {
    if (event.button !== 0) {
      return;
    }

    dragOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      rotation: [...viewStateRef.current.rotation] as [number, number]
    };
    setIsDragInteractionActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updatePassiveTemperatureHover = (clientX: number, clientY: number, svg: SVGSVGElement) => {
    if (!temperatureLayerActive || temperatureHoverCandidates.length === 0) {
      return;
    }
    perfInc("hover_probe_moves", 1);

    let cursorX = Number.NaN;
    let cursorY = Number.NaN;
    const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    if (ctm && typeof svg.createSVGPoint === "function") {
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = clientX;
      svgPoint.y = clientY;
      const localPoint = svgPoint.matrixTransform(ctm.inverse());
      cursorX = localPoint.x;
      cursorY = localPoint.y;
    } else {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      cursorX = ((event.clientX - rect.left) * viewBoxWidth) / rect.width;
      cursorY = ((event.clientY - rect.top) * viewBoxHeight) / rect.height;
    }

    if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY)) {
      return;
    }

    if (typeof document !== "undefined") {
      const buttonGroups = Array.from(document.querySelectorAll<SVGGElement>("g[role='button'][aria-label]"));
      let pointedByProximity: SVGGElement | null = null;
      let pointedDistance = Number.POSITIVE_INFINITY;
      for (const group of buttonGroups) {
        const rect = group.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(centerX - clientX, centerY - clientY);
        if (distance < pointedDistance) {
          pointedDistance = distance;
          pointedByProximity = group;
        }
      }
      const pointedElement = document.elementFromPoint(clientX, clientY);
      const pointedGroup =
        (pointedByProximity && pointedDistance <= 44 ? pointedByProximity : null) ??
        pointedElement?.closest?.("g[role='button'][aria-label]") ??
        null;
      const pointedLabel = pointedGroup?.getAttribute?.("aria-label")?.trim();
      if (pointedLabel && pointedLabel.length > 0) {
        const pointedToken = pointedLabel.split(/\s+/)[0]?.toLowerCase() ?? "";
        if (pointedToken.length > 0) {
          const directMatch = temperatureHoverCandidates.find(
            (city) =>
              city.label.toLowerCase().startsWith(pointedToken) ||
              city.label.toLowerCase().includes(pointedToken) ||
              pointedToken.startsWith(city.label.toLowerCase())
          );
          if (directMatch) {
            perfInc("hover_probe_direct_match", 1);
            setTemperatureHover(directMatch);
            return;
          }
        }
      }
    }

    let nearest: HoveredCityTemperature | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const city of temperatureHoverCandidates) {
      const distance = Math.hypot(city.x - cursorX, city.y - cursorY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = city;
      }
    }

    const hoverRadius = effectiveTemperatureViewLevel === "local" ? 16 : 13;
    if (nearest && nearestDistance <= hoverRadius) {
      perfInc("hover_probe_nearest_match", 1);
      setTemperatureHover(nearest);
      return;
    }

    if (hoveredCity?.kind === "city") {
      perfInc("hover_probe_clear", 1);
      setTemperatureHover(null);
    }
  };

  const onPointerMove: PointerEventHandler<SVGSVGElement> = (event) => {
    if (!dragOrigin.current) {
      updatePassiveTemperatureHover(event.clientX, event.clientY, event.currentTarget);
      return;
    }

    event.preventDefault();
    const dragScale = 0.18 / Math.max(0.9, viewStateRef.current.zoom * 0.75);
    const deltaX = event.clientX - dragOrigin.current.x;
    const deltaY = event.clientY - dragOrigin.current.y;
    const verticalDelta = invertYDrag ? -deltaY : deltaY;
    const nextRotation: [number, number] = [
      dragOrigin.current.rotation[0] + deltaX * dragScale,
      clamp(dragOrigin.current.rotation[1] + verticalDelta * dragScale, -MAX_ROTATION_LAT, MAX_ROTATION_LAT)
    ];

    pendingDragRotationRef.current = nextRotation;
    if (dragFrameRef.current === null) {
      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const pendingRotation = pendingDragRotationRef.current;
        pendingDragRotationRef.current = null;
        if (!pendingRotation) {
          return;
        }

        setViewState((current) => {
          const delta =
            Math.abs(current.rotation[0] - pendingRotation[0]) +
            Math.abs(current.rotation[1] - pendingRotation[1]);
          if (delta < DRAG_FRAME_MIN_ROTATION_DELTA) {
            return current;
          }

          return {
            ...current,
            rotation: pendingRotation
          };
        });
      });
    }
  };

  const onMouseMove: MouseEventHandler<SVGSVGElement> = (event) => {
    if (dragOrigin.current) {
      return;
    }

    updatePassiveTemperatureHover(event.clientX, event.clientY, event.currentTarget);
  };

  const releasePointer: PointerEventHandler<SVGSVGElement> = (event) => {
    dragOrigin.current = null;
    pendingDragRotationRef.current = null;
    setIsDragInteractionActive(false);
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel: WheelEventHandler<SVGSVGElement> = (event) => {
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * 0.0014);
    pendingWheelFactorRef.current = clamp(pendingWheelFactorRef.current * zoomFactor, 0.62, 1.62);
    if (wheelFrameRef.current === null) {
      wheelFrameRef.current = window.requestAnimationFrame(() => {
        wheelFrameRef.current = null;
        const factor = pendingWheelFactorRef.current;
        pendingWheelFactorRef.current = 1;
        if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.001) {
          return;
        }

        setViewState((current) => ({
          ...current,
          zoom: clamp(current.zoom * factor, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM)
        }));
      });
    }
    setIsZoomInteractionActive(true);

    if (zoomInteractionTimeoutRef.current !== null) {
      window.clearTimeout(zoomInteractionTimeoutRef.current);
    }

    zoomInteractionTimeoutRef.current = window.setTimeout(() => {
      setIsZoomInteractionActive(false);
      zoomInteractionTimeoutRef.current = null;
    }, 180);
  };

  const onKeyDown: KeyboardEventHandler<SVGSVGElement> = (event) => {
    const current = viewStateRef.current;
    const rotationStep = 6 / Math.max(0.9, current.zoom);
    let handled = true;
    let nextRotation: [number, number] = [...current.rotation];
    let nextZoom = current.zoom;

    switch (event.key) {
      case "ArrowLeft":
        nextRotation = [current.rotation[0] + rotationStep, current.rotation[1]];
        break;
      case "ArrowRight":
        nextRotation = [current.rotation[0] - rotationStep, current.rotation[1]];
        break;
      case "ArrowUp":
        nextRotation = [current.rotation[0], current.rotation[1] + rotationStep];
        break;
      case "ArrowDown":
        nextRotation = [current.rotation[0], current.rotation[1] - rotationStep];
        break;
      case "+":
      case "=":
        nextZoom = clamp(current.zoom * 1.08, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM);
        setIsZoomInteractionActive(true);
        break;
      case "-":
      case "_":
        nextZoom = clamp(current.zoom / 1.08, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM);
        setIsZoomInteractionActive(true);
        break;
      case "r":
      case "R":
        nextRotation = [...defaultView.rotation];
        nextZoom = defaultView.zoom;
        break;
      default:
        handled = false;
    }

    if (!handled) {
      return;
    }

    event.preventDefault();
    setViewState({
      rotation: [
        nextRotation[0],
        clamp(nextRotation[1], -MAX_ROTATION_LAT, MAX_ROTATION_LAT)
      ],
      zoom: nextZoom
    });
  };

  const runtimeProviderLabel = formatRuntimeProvider(temperatureRuntime?.source ?? null);
  const temperatureLegendStops = useMemo(() => getTemperatureLegendStops(), []);
  const runtimeStatusLabel = runtimeProviderLabel
    ? `Source live: ${runtimeProviderLabel}`
    : "Source live indisponible - fallback local actif";
  const qualityStatusLabel =
    renderQualityMode === "auto"
      ? `Rendu ${qualityModeLabel(renderQualityMode)} (${autoEcoActive ? "eco actif" : "qualite standard"})`
      : `Rendu ${qualityModeLabel(renderQualityMode)}`;
  const interactionPerfLabel =
    interactionPerfSummary.totalFrames > 0
      ? `Perf interaction >24ms: ${interactionPerfSummary.over24Frames}/${interactionPerfSummary.totalFrames} | pic ${interactionPerfSummary.worstFrameMs.toFixed(1)}ms`
      : "Perf interaction >24ms: en attente";
  const interactionHotspotLabel =
    interactionPerfSummary.topHotspots.length > 0
      ? `Hotspots >24ms: ${interactionPerfSummary.topHotspots
          .map(
            (hotspot) =>
              `${hotspotFeatureLabel(hotspot.feature)} (${hotspot.hits}x, avg ${hotspot.avgMs.toFixed(1)}ms)`
          )
          .join(" | ")}`
      : "Hotspots >24ms: en attente";
  const multiScaleLabel =
    multiScaleViewPreset === "planetary"
      ? "Echelle planetaire"
      : multiScaleViewPreset === "systemic"
        ? "Echelle systemique"
        : multiScaleViewPreset === "regional"
          ? "Echelle regionale"
          : "Echelle locale";

  return (
    <section
      id="atlas-globe-panel"
      className={`globe-panel globe-panel-organic ${effectiveInteractionActive ? "is-interacting" : ""}`}
    >
      <div className="globe-runtime-status" aria-live="polite">
        <span>{runtimeStatusLabel}</span>
        <span>{formatRefreshPhaseLabel(temperatureRefreshUi)}</span>
        <span>{qualityStatusLabel}</span>
        <span>{interactionPerfLabel}</span>
        <span>{interactionHotspotLabel}</span>
        <span>{multiScaleLabel}</span>
        <div className="globe-quality-controls" role="group" aria-label="Qualite de rendu">
          {(["auto", "quality", "eco"] as RenderQualityMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`globe-quality-chip ${renderQualityMode === mode ? "is-active" : ""}`}
              onClick={() => setRenderQualityMode(mode)}
              aria-pressed={renderQualityMode === mode}
            >
              {qualityModeLabel(mode)}
            </button>
          ))}
        </div>
        <div className="globe-pointer-controls" role="group" aria-label="Controle vertical souris">
          <button
            type="button"
            className={`globe-quality-chip ${!invertYDrag ? "is-active" : ""}`}
            onClick={() => setInvertYDrag(false)}
            aria-pressed={!invertYDrag}
            title="Deplacer la souris vers le bas fait descendre le globe."
          >
            Y normal
          </button>
          <button
            type="button"
            className={`globe-quality-chip ${invertYDrag ? "is-active" : ""}`}
            onClick={() => setInvertYDrag(true)}
            aria-pressed={invertYDrag}
            title="Deplacer la souris vers le bas fait monter le globe."
          >
            Y inverse
          </button>
        </div>
      </div>
      <div className="temperature-scale-legend" aria-label="Legende thermique en degres Celsius">
        <span className="temperature-scale-title">Echelle temperature (C)</span>
        <div className="temperature-scale-row">
          {temperatureLegendStops.map((stop) => (
            <span key={stop.tempC} className="temperature-scale-stop">
              <span className="temperature-scale-swatch" style={{ backgroundColor: stop.color }} />
              <small>{stop.tempC}</small>
            </span>
          ))}
        </div>
      </div>
      <svg
        ref={svgRef}
        className={`globe-canvas ${globeHasFocus ? "has-focus" : ""}`}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onMouseMove={onMouseMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onWheel={onWheel}
        onPointerLeave={() => {
          dragOrigin.current = null;
          pendingDragRotationRef.current = null;
          setIsDragInteractionActive(false);
          if (dragFrameRef.current !== null) {
            window.cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
          }
          clearWheelFocus();
          if (hoverClearTimeoutRef.current !== null) {
            window.clearTimeout(hoverClearTimeoutRef.current);
            hoverClearTimeoutRef.current = null;
            hoverClearScheduledAtRef.current = null;
          }
          setHoveredCity(null);
        }}
        onFocus={() => setGlobeHasFocus(true)}
        onBlur={() => {
          setGlobeHasFocus(false);
          clearWheelFocus();
        }}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="application"
        aria-label="Globe Atlas Vivant interactif"
      >
        <defs>
          <clipPath id="sphere-clip">
            <path d={spherePath} />
          </clipPath>
          <radialGradient id="spaceGlow" cx="50%" cy="45%" r="58%">
            <stop offset="0%" stopColor="rgba(92,162,236,0.34)" />
            <stop offset="60%" stopColor="rgba(13,28,53,0.06)" />
            <stop offset="100%" stopColor="rgba(5,10,20,0)" />
          </radialGradient>
          <filter id="temperature-field-blur-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.1" />
          </filter>
          <filter id="temperature-field-blur-mid" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id="temperature-field-blur-local" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        <rect width={viewBoxWidth} height={viewBoxHeight} fill="transparent" />
        <circle
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight / 2 + 18}
          r={baseScale * viewState.zoom * (1.24 + breathing)}
          fill="url(#spaceGlow)"
          opacity={timeMode === "paused" ? 0.72 : 1}
        />
        <circle
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight / 2 + 18}
          r={baseScale * viewState.zoom * (1.12 + breathing * 1.6)}
          fill={focusColor}
          fillOpacity={
            hasFocusedLayer
              ? 0.042 + effectiveSceneProfile.flowDensity * 0.015
              : 0.018 + effectiveSceneProfile.flowDensity * 0.008
          }
        />
        <circle
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight / 2 + 18}
          r={baseScale * viewState.zoom * 1.02}
          className="sphere-ring"
          stroke={focusColor}
          strokeOpacity={hasFocusedLayer ? 0.38 : 0.16}
        />

        <path className="sphere-fill" d={spherePath} />
        <path className="graticule-path" d={graticulePath} opacity={hasFocusedLayer ? 0.44 : 1} />

        <g clipPath="url(#sphere-clip)">
          {landPath ? <path d={landPath} className="land-path" opacity={hasFocusedLayer ? 0.52 : 1} /> : null}

          {visibleLayers.map((layer) => {
            const dataset = layer.id === "surface_temperature" ? displayedTemperatureDataset : mockLayerData[layer.id];
            if (!dataset) {
              return null;
            }

            const signature = resolveFamilySignature(layer.id);
            const familyProfile = sceneProfileForFamily(effectiveSceneProfile, signature);
            const emphasized = selectedLayerId === layer.id;
            const isTemperatureLayer = layer.id === "surface_temperature";
            const opacityWeight = hasFocusedLayer
              ? emphasized
                ? 1.28
                : 0.012 + (1 - familyProfile.aggregationLevel) * 0.05
              : visualRegime === "long"
                ? 0.7 + signature.longRetention * 0.22
                : visualRegime === "medium"
                  ? 0.88 + signature.density * 0.06
                  : 0.94 + signature.density * 0.05;
            const finalOpacityWeight =
              isTemperatureLayer && hasFocusedLayer && !emphasized
                ? Math.max(opacityWeight, 0.72)
                : opacityWeight;

            const temperatureEventZones =
              isTemperatureLayer && !effectiveInteractionActive
                ? (() => {
                    const eventSortStartMs = timestampNow();
                    const sorted = [...(dataset.eventZones ?? [])]
                      .sort((left, right) => right.intensity - left.intensity)
                      .slice(0, temperatureViewBudget.maxEventZones);
                    recordInteractionFeatureSample("temperature_event_sort", timestampNow() - eventSortStartMs);
                    return sorted;
                  })()
                : [];

            const temperatureCities = isTemperatureLayer && !effectiveInteractionActive
              ? (() => {
                  const cityProjectionStartMs = timestampNow();
                  const allCities = dataset.cityTemperatures ?? [];
                  const centerX = viewBoxWidth / 2;
                  const centerY = viewBoxHeight / 2 + 18;

                  const ranked = allCities
                    .map((city) => {
                      if (!isFrontFacing(city.position)) {
                        return null;
                      }

                      const projected = projection(city.position);
                      perfInc("temperature_overlay_projection_calls", 1);
                      if (!projected) {
                        return null;
                      }

                      const distance = Math.hypot(projected[0] - centerX, projected[1] - centerY);
                      const anchorBias =
                        (effectiveTemperatureViewLevel === "regional" || effectiveTemperatureViewLevel === "globe") &&
                        isRegionalTemperatureAnchorCity(city.id)
                          ? -150
                          : 0;

                      return {
                        city,
                        score: distance + anchorBias
                      };
                    })
                    .filter((entry): entry is { city: (typeof allCities)[number]; score: number } => Boolean(entry))
                    .sort((left, right) => left.score - right.score)
                    .slice(0, temperatureViewBudget.maxCities)
                    .map((entry) => entry.city);

                  const cityProjectionDurationMs = timestampNow() - cityProjectionStartMs;
                  recordInteractionFeatureSample("temperature_city_projection", cityProjectionDurationMs);
                  if (perfDebugEnabled) {
                    perfInc("temperature_city_projection_batches", 1);
                    perfObserveDuration("temperature_city_projection_ms", cityProjectionDurationMs);
                  }

                  return ranked;
                })()
              : [];

            const temperatureHeat = !isTemperatureLayer ? dataset.heat ?? [] : [];

            if (isTemperatureLayer) {
              perfInc("temperature_city_candidates", temperatureCities.length);
              perfInc("temperature_heat_candidates", temperatureHeat.length);
              perfInc("temperature_zone_candidates", temperatureEventZones.length);
            }

            const temperatureMeshSignature = isTemperatureLayer
              ? [
                  temperatureRuntime?.fetchedAtMs ?? 0,
                  temperatureSampleCursor,
                  effectiveTemperatureViewLevel,
                  temperatureMeshOptions.refinementMode ?? "off",
                  viewState.zoom.toFixed(4),
                  viewState.rotation[0].toFixed(3),
                  viewState.rotation[1].toFixed(3),
                  effectiveInteractionActive ? 1 : 0
                ].join("|")
              : "";

            const temperatureFieldMesh = isTemperatureLayer && !effectiveInteractionActive
              ? (() => {
                  const meshStartMs = timestampNow();
                  if (temperatureMeshCacheRef.current?.signature === temperatureMeshSignature) {
                    perfInc("mesh_cache_hits", 1);
                    recordInteractionFeatureSample("temperature_mesh", timestampNow() - meshStartMs);
                    return temperatureMeshCacheRef.current.node;
                  }

                  perfInc("mesh_cache_misses", 1);
                  const node = renderTemperatureFieldMesh(
                    projection,
                    temperatureSampleCursor,
                    effectiveTemperatureViewLevel,
                    temperatureSampler,
                    dataset.heat ?? [],
                    isFrontFacing,
                    (payload) => setTemperatureHover(payload),
                    (hoverId) => scheduleTemperatureHoverClear(hoverId),
                    effectiveInteractionActive,
                    temperatureMeshOptions
                  );
                  recordInteractionFeatureSample("temperature_mesh", timestampNow() - meshStartMs);
                  temperatureMeshCacheRef.current = {
                    signature: temperatureMeshSignature,
                    node
                  };

                  return node;
                })()
              : null;

            if (isTemperatureLayer && effectiveInteractionActive) {
              perfInc("mesh_suspended_interaction_frames", 1);
            }

            const ecoLimitMultiplier = effectiveEcoMode ? 1.9 : 3;
            const flowEntries = effectiveInteractionActive
              ? (dataset.flows ?? []).slice(0, emphasized ? INTERACTION_FLOW_LIMIT * 2 : INTERACTION_FLOW_LIMIT)
              : effectiveEcoMode
                ? (dataset.flows ?? []).slice(0, emphasized ? Math.floor(INTERACTION_FLOW_LIMIT * ecoLimitMultiplier * 1.5) : Math.floor(INTERACTION_FLOW_LIMIT * ecoLimitMultiplier))
                : dataset.flows ?? [];
            const trackEntries = effectiveInteractionActive
              ? (dataset.tracks ?? []).slice(0, emphasized ? INTERACTION_TRACK_LIMIT * 2 : INTERACTION_TRACK_LIMIT)
              : effectiveEcoMode
                ? (dataset.tracks ?? []).slice(0, emphasized ? Math.floor(INTERACTION_TRACK_LIMIT * ecoLimitMultiplier * 1.5) : Math.floor(INTERACTION_TRACK_LIMIT * ecoLimitMultiplier))
                : dataset.tracks ?? [];
            const pulseEntries = effectiveInteractionActive
              ? (dataset.pulses ?? []).slice(0, emphasized ? INTERACTION_PULSE_LIMIT * 2 : INTERACTION_PULSE_LIMIT)
              : effectiveEcoMode
                ? (dataset.pulses ?? []).slice(0, emphasized ? Math.floor(INTERACTION_PULSE_LIMIT * ecoLimitMultiplier * 1.5) : Math.floor(INTERACTION_PULSE_LIMIT * ecoLimitMultiplier))
                : dataset.pulses ?? [];
            const temperatureEventZoneNodes = isTemperatureLayer
              ? (() => {
                  const nodesStartMs = timestampNow();
                  const nodes = temperatureEventZones.map((zone, zoneIndex) =>
                    renderTemperatureEventZone(
                      zone,
                      dataset.heat ?? [],
                      projection,
                      temperatureSampleCursor,
                      globalPhase,
                      emphasized,
                      zoneIndex,
                      timeWindow,
                      effectiveTemperatureViewLevel,
                      isFrontFacing,
                      temperatureSampler,
                      (payload) => setTemperatureHover(payload),
                      () => scheduleTemperatureHoverClear(zone.id)
                    )
                  );
                  recordInteractionFeatureSample("temperature_event_nodes", timestampNow() - nodesStartMs);
                  return nodes;
                })()
              : [];
            const temperatureCityNodes = isTemperatureLayer
              ? (() => {
                  const nodesStartMs = timestampNow();
                  const nodes = temperatureCities.map((city) =>
                    renderTemperatureCityPoint(
                      city,
                      dataset.heat ?? [],
                      projection,
                      temperatureSampleCursor,
                      effectiveTemperatureViewLevel,
                      isRegionalTemperatureAnchorCity(city.id),
                      isFrontFacing,
                      temperatureSampler,
                      (payload) => setTemperatureHover(payload),
                      () => scheduleTemperatureHoverClear(city.id)
                    )
                  );
                  recordInteractionFeatureSample("temperature_city_nodes", timestampNow() - nodesStartMs);
                  return nodes;
                })()
              : [];
            const flowNodes = (() => {
              const nodesStartMs = timestampNow();
              const nodes = flowEntries.map((entry, flowIndex) =>
                renderFlow(
                  entry,
                  projection,
                  pathBuilder,
                  globalPhase,
                  familyProfile,
                  visualRegime,
                  emphasized,
                  flowIndex,
                  signature,
                  isFrontFacing
                )
              );
              recordInteractionFeatureSample("flows_nodes", timestampNow() - nodesStartMs);
              return nodes;
            })();
            const trackNodes = (() => {
              const nodesStartMs = timestampNow();
              const nodes = trackEntries.map((entry, trackIndex) =>
                renderTrack(
                  entry,
                  projection,
                  pathBuilder,
                  animatedCycleIndex,
                  compareEnabled,
                  emphasized,
                  familyProfile,
                  visualRegime,
                  trackIndex,
                  globalPhase,
                  signature,
                  isFrontFacing
                )
              );
              recordInteractionFeatureSample("tracks_nodes", timestampNow() - nodesStartMs);
              return nodes;
            })();
            const pulseNodes = (() => {
              const nodesStartMs = timestampNow();
              const nodes = pulseEntries.map((entry, pulseIndex) =>
                renderPulse(
                  entry,
                  projection,
                  animatedCycleIndex,
                  familyProfile,
                  visualRegime,
                  emphasized,
                  pulseIndex,
                  globalPhase,
                  signature,
                  isFrontFacing
                )
              );
              recordInteractionFeatureSample("pulses_nodes", timestampNow() - nodesStartMs);
              return nodes;
            })();
            return (
              <g key={layer.id} opacity={layerOpacity(dataset) * finalOpacityWeight}>

                {temperatureFieldMesh}
                {!isTemperatureLayer
                  ? temperatureHeat.map((entry) =>
                      renderHeat(
                        entry,
                        projection,
                        animatedCycleIndex,
                        familyProfile,
                        visualRegime,
                        emphasized,
                        signature,
                        globalPhase,
                        isFrontFacing
                      )
                    )
                  : null}
                {flowNodes}
                {trackNodes}
                {pulseNodes}
                {isTemperatureLayer ? temperatureEventZoneNodes : null}
                {isTemperatureLayer ? temperatureCityNodes : null}
              </g>
            );
          })}
        </g>

        {renderTemperatureStreetLabels(hoveredCity, effectiveTemperatureViewLevel)}
        {hoveredCity ? renderTemperatureTooltip(hoveredCity, viewBoxWidth, viewBoxHeight) : null}

        <path className="sphere-outline" d={spherePath} />
      </svg>
    </section>
  );
}

function renderFlow(
  flow: FlowFeature,
  projection: ReturnType<typeof geoOrthographic>,
  pathBuilder: ReturnType<typeof geoPath>,
  phase: number,
  sceneProfile: SceneProfileLite,
  visualRegime: VisualRegime,
  emphasized: boolean,
  flowIndex: number,
  signature: FamilySignature,
  isFrontFacing: (point: LonLat) => boolean
) {
  const aggregation = sceneProfile.aggregationLevel;

  if (!shouldKeepEntity(flow.id, flowIndex, visualRegime, signature, emphasized, phase)) {
    return null;
  }

  const longStride = signature.family === "ocean" ? (aggregation > 0.9 ? 4 : 3) : aggregation > 0.9 ? 3 : 2;
  const corridorPoints = visualRegime === "long" ? simplifyPolyline(flow.points, longStride) : flow.points;

  const path = linePath(pathBuilder, corridorPoints);
  if (!path) {
    return null;
  }

  if (visualRegime === "long") {
    return (
      <g key={flow.id}>
        <path
          d={path}
          fill="none"
          stroke={flow.color}
          strokeOpacity={emphasized ? 0.28 : signature.family === "ocean" ? 0.18 : 0.14}
          strokeWidth={emphasized ? flow.width * (12.2 * signature.trailScale) : flow.width * (8.2 * signature.trailScale)}
          strokeLinecap="round"
        />
        <path
          d={path}
          fill="none"
          stroke={flow.color}
          strokeOpacity={emphasized ? 0.94 : signature.family === "ocean" ? 0.74 : 0.64}
          strokeWidth={emphasized ? flow.width * 3.4 : flow.width * 2.2}
          strokeLinecap="round"
        />
      </g>
    );
  }

  const individualVisibility = clamp(1 - aggregation * (1 + signature.aggregationBias * 0.5), 0.08, 1);
  const densityFactor = visualRegime === "short" ? 1.35 : 0.9;
  const pulseBoost = signature.family === "wind" ? 1.35 : signature.family === "ocean" ? 0.56 : 1;
  const pulseCount =
    sceneProfile.flowSpeed <= 0
      ? 0
      : Math.max(
          visualRegime === "short" ? 3 : 1,
          Math.round((emphasized ? 8 : 5) * sceneProfile.flowDensity * densityFactor * individualVisibility * pulseBoost)
        );

  const dashPattern = visualRegime === "short" ? signature.dashShort : signature.dashMedium;
  const dashOffset = -(phase * 220 * sceneProfile.flowSpeed * signature.speed * (visualRegime === "short" ? 3.6 : 2.4));

  return (
    <g key={flow.id}>
      <path
        d={path}
        fill="none"
        stroke={flow.color}
        strokeOpacity={emphasized ? 0.2 : flow.opacity * 0.08}
        strokeWidth={emphasized ? flow.width * (6.2 + aggregation * 1.3) * signature.trailScale : flow.width * (2.4 + aggregation) * signature.trailScale}
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke={flow.color}
        strokeOpacity={emphasized ? 0.92 : flow.opacity * 0.5}
        strokeWidth={emphasized ? flow.width * (1.9 + aggregation * 0.2) : flow.width * (0.95 + aggregation * 0.25)}
        strokeDasharray={dashPattern}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
      {signature.family === "wind" ? (
        <path
          d={path}
          fill="none"
          stroke={flow.color}
          strokeOpacity={emphasized ? 0.24 : flow.opacity * 0.14}
          strokeWidth={emphasized ? flow.width * 2.2 : flow.width * 1.4}
          strokeDasharray="3 24"
          strokeDashoffset={dashOffset * 0.62}
          strokeLinecap="round"
        />
      ) : null}
      {Array.from({ length: pulseCount }, (_, index) => {
        const pulsePhase = phase * Math.max(0.2, sceneProfile.flowSpeed) * signature.speed + index / Math.max(pulseCount, 1);
        const pulseCoordinate = interpolatePolyline(corridorPoints, pulsePhase);
        if (!isFrontFacing(pulseCoordinate)) {
          return null;
        }

        const pulse = projection(pulseCoordinate);
        if (!pulse) {
          return null;
        }

        const shimmer =
          0.62 +
          (Math.sin((phase + index / Math.max(1, pulseCount)) * Math.PI * 2) + 1) *
            (signature.family === "wind" ? 0.24 : signature.family === "ocean" ? 0.12 : 0.16);

        const radius = (emphasized ? 3.9 : 2.3) * (signature.family === "ocean" ? 0.86 : 1);
        const auraRadius = (emphasized ? 8.2 : visualRegime === "short" ? 5.2 : 6.2) * (signature.family === "ocean" ? 1.24 : 1);
        const opacity = (emphasized ? 0.88 : 0.48) * shimmer;

        return (
          <g key={`${flow.id}-${index}`} transform={`translate(${pulse[0]}, ${pulse[1]})`}>
            <circle r={auraRadius} fill={flow.color} fillOpacity={opacity * 0.14} />
            <circle r={radius} fill={flow.color} fillOpacity={opacity} />
          </g>
        );
      })}
    </g>
  );
}

function renderTrack(
  track: TrackFeature,
  projection: ReturnType<typeof geoOrthographic>,
  pathBuilder: ReturnType<typeof geoPath>,
  timeIndex: number,
  compareEnabled: boolean,
  emphasized: boolean,
  sceneProfile: SceneProfileLite,
  visualRegime: VisualRegime,
  trackIndex: number,
  phase: number,
  signature: FamilySignature,
  isFrontFacing: (point: LonLat) => boolean
) {
  const aggregation = sceneProfile.aggregationLevel;

  if (visualRegime === "long") {
    const dominant = shouldKeepEntity(track.id, trackIndex, visualRegime, signature, emphasized, phase);
    if (!dominant) {
      return null;
    }

    const baseStride = signature.family === "maritime" ? 5 : signature.family === "aviation" ? 3 : 4;
    const corridorPoints = simplifyPolyline(track.path, aggregation > 0.9 ? baseStride : Math.max(2, baseStride - 1));
    const corridorPath = linePath(pathBuilder, corridorPoints);
    if (!corridorPath) {
      return null;
    }

    const markerPoint = samplePathPoint(track.path, (timeIndex / 12) * track.path.length * signature.speed);
    const marker = emphasized && isFrontFacing(markerPoint) ? projection(markerPoint) : null;

    return (
      <g key={track.id}>
        <path
          d={corridorPath}
          fill="none"
          stroke={track.color}
          strokeWidth={(emphasized ? track.width * 11 : track.width * 7.2) * signature.trailScale * (signature.family === "maritime" ? 1.2 : 1)}
          strokeOpacity={emphasized ? 0.24 : signature.family === "maritime" ? 0.18 : 0.11}
          strokeLinecap="round"
        />
        <path
          d={corridorPath}
          fill="none"
          stroke={track.color}
          strokeWidth={(emphasized ? track.width * 3.2 : track.width * 2) * (signature.family === "maritime" ? 1.16 : 1)}
          strokeOpacity={emphasized ? 0.95 : signature.family === "maritime" ? 0.7 : 0.64}
          strokeLinecap="round"
        />
        {marker ? (
          <g transform={`translate(${marker[0]}, ${marker[1]})`}>
            <circle r={8.4 * signature.markerScale} fill={track.color} fillOpacity={0.18} />
            <circle r={3.4 * signature.markerScale} fill={track.color} fillOpacity={0.96} />
          </g>
        ) : null}
      </g>
    );
  }

  const trailCount = Math.round((2 + sceneProfile.trailPersistence * (visualRegime === "short" ? 8 : 10)) * signature.trailScale);
  const pathCursor =
    (timeIndex / 12) * track.path.length * signature.speed +
    Math.sin((phase + trackIndex * 0.19) * Math.PI * 2) * signature.jitter;

  const rawTrail = trailPoints(track.path, pathCursor, trailCount);
  const simplifyStride = visualRegime === "medium" ? (signature.family === "maritime" ? 3 : 2) : 1;
  const simplifiedTrail = simplifyPolyline(rawTrail, simplifyStride);
  const trailPath = linePath(pathBuilder, simplifiedTrail);
  const markerPoint = samplePathPoint(track.path, pathCursor);
  const marker = isFrontFacing(markerPoint) ? projection(markerPoint) : null;

  const compareTrail =
    compareEnabled && track.comparePath
      ? linePath(pathBuilder, simplifyPolyline(trailPoints(track.comparePath, pathCursor, trailCount), simplifyStride))
      : null;

  const comparePoint = compareEnabled && track.comparePath ? samplePathPoint(track.comparePath, pathCursor) : null;
  const compareMarker = comparePoint && isFrontFacing(comparePoint) ? projection(comparePoint) : null;

  const baseMarkerVisible = visualRegime === "short" || emphasized || trackIndex % 2 === 0;
  const familyMarkerVisible =
    signature.family === "maritime"
      ? emphasized || trackIndex % 3 === 0
      : signature.family === "biosphere"
        ? emphasized || Math.sin((phase + trackIndex * 0.23) * Math.PI * 2) > -0.25
        : true;

  const markerVisible = baseMarkerVisible && familyMarkerVisible;

  const origin =
    signature.family === "aviation" && isFrontFacing(track.path[0]) ? projection(track.path[0]) : null;
  const destination =
    signature.family === "aviation" && isFrontFacing(track.path[track.path.length - 1])
      ? projection(track.path[track.path.length - 1])
      : null;

  return (
    <g key={track.id}>
      {origin && destination ? (
        <>
          <circle cx={origin[0]} cy={origin[1]} r={6} fill={track.color} fillOpacity={0.1} />
          <circle cx={destination[0]} cy={destination[1]} r={6} fill={track.color} fillOpacity={0.1} />
        </>
      ) : null}
      {compareTrail ? (
        <path
          d={compareTrail}
          fill="none"
          stroke={track.color}
          strokeWidth={emphasized ? track.width * 1.1 : track.width}
          strokeOpacity={emphasized ? 0.24 : signature.family === "biosphere" ? 0.06 : 0.1}
          strokeDasharray={signature.dashShort}
          strokeLinecap="round"
        />
      ) : null}
      {trailPath ? (
        <>
          <path
            d={trailPath}
            fill="none"
            stroke={track.color}
            strokeWidth={((emphasized ? track.width * (5.8 + aggregation * 0.8) : track.width * (2.8 + aggregation * 0.7)) * signature.trailScale)}
            strokeOpacity={emphasized ? 0.2 : signature.family === "biosphere" ? 0.06 : 0.08}
            strokeLinecap="round"
          />
          <path
            d={trailPath}
            fill="none"
            stroke={track.color}
            strokeWidth={(emphasized ? track.width * 1.85 : track.width * 1.05) * signature.trailScale}
            strokeOpacity={emphasized ? 0.98 : signature.family === "maritime" ? 0.82 : 0.74}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {marker && markerVisible ? (
        <g transform={`translate(${marker[0]}, ${marker[1]})`}>
          <circle
            r={(emphasized ? 11.5 : visualRegime === "short" ? 7.4 : 5.9) * signature.markerScale}
            fill={track.color}
            fillOpacity={emphasized ? 0.2 : signature.family === "biosphere" ? 0.06 : 0.09}
          />
          <circle r={(emphasized ? 4.7 : 2.7) * signature.markerScale} fill={track.color} fillOpacity={0.96} />
        </g>
      ) : null}
      {compareMarker && markerVisible ? (
        <g transform={`translate(${compareMarker[0]}, ${compareMarker[1]})`}>
          <circle r={(emphasized ? 5.4 : 4) * signature.markerScale} fill={track.color} fillOpacity={0.08} />
          <circle r={(emphasized ? 2.2 : 1.6) * signature.markerScale} fill={track.color} fillOpacity={0.32} />
        </g>
      ) : null}
    </g>
  );
}

function renderHeat(
  heat: HeatFeature,
  projection: ReturnType<typeof geoOrthographic>,
  timeIndex: number,
  sceneProfile: SceneProfileLite,
  visualRegime: VisualRegime,
  emphasized: boolean,
  signature: FamilySignature,
  phase: number,
  isFrontFacing: (point: LonLat) => boolean
) {
  if (!isFrontFacing(heat.center)) {
    return null;
  }

  const center = projection(heat.center);
  if (!center) {
    return null;
  }

  const baseIntensity = sampleSeries(heat.intensity, timeIndex);
  const thermalWave =
    signature.family === "ocean"
      ? 0.92 + Math.sin((phase * 0.72 + (stableHash(heat.id) % 11) / 11) * Math.PI * 2) * 0.08
      : 1;

  const value = clamp(baseIntensity * thermalWave, 0.16, 1.2);
  const diffusionBoost =
    (visualRegime === "long" ? 0.5 : visualRegime === "medium" ? 0.26 : 0.08) +
    sceneProfile.aggregationLevel * 0.08;

  const radius = heat.radius * (0.56 + value * (0.84 + diffusionBoost * (signature.family === "ocean" ? 1.28 : 1)));

  return (
    <g key={heat.id}>
      {signature.family === "ocean" ? (
        <circle
          cx={center[0]}
          cy={center[1]}
          r={radius * (visualRegime === "long" ? 1.42 : 1.26)}
          fill={heat.color}
          fillOpacity={emphasized ? 0.09 + value * 0.08 : 0.03 + value * 0.04}
        />
      ) : null}
      <circle
        cx={center[0]}
        cy={center[1]}
        r={emphasized ? radius * 1.28 : radius * (visualRegime === "short" ? 1.02 : 1.14)}
        fill={heat.color}
        fillOpacity={emphasized ? 0.16 + value * 0.28 : 0.05 + value * 0.13}
      />
      <circle
        cx={center[0]}
        cy={center[1]}
        r={radius * (emphasized ? 0.68 : visualRegime === "short" ? 0.44 : 0.56) * (signature.family === "ocean" ? 0.84 : 1)}
        fill={heat.color}
        fillOpacity={emphasized ? 0.22 + value * 0.3 : 0.09 + value * 0.18}
      />
    </g>
  );
}

function renderPulse(
  pulse: PulseFeature,
  projection: ReturnType<typeof geoOrthographic>,
  timeIndex: number,
  sceneProfile: SceneProfileLite,
  visualRegime: VisualRegime,
  emphasized: boolean,
  pulseIndex: number,
  phase: number,
  signature: FamilySignature,
  isFrontFacing: (point: LonLat) => boolean
) {
  if (!shouldKeepEntity(pulse.id, pulseIndex, visualRegime, signature, emphasized, phase)) {
    return null;
  }

  if (!isFrontFacing(pulse.center)) {
    return null;
  }

  const center = projection(pulse.center);
  if (!center) {
    return null;
  }

  const value = sampleSeries(pulse.values, timeIndex);
  const rhythm =
    sceneProfile.flowSpeed <= 0
      ? 1
      : 0.76 + (Math.sin((phase * signature.speed + pulseIndex * 0.17) * Math.PI * 2) + 1) * 0.18;

  const radius = pulse.radius * (0.46 + value + sceneProfile.trailPersistence * 0.14) * rhythm;
  const spreadBoost = visualRegime === "long" ? 0.24 : visualRegime === "medium" ? 0.1 : 0;

  return (
    <g key={pulse.id}>
      {Array.from({ length: Math.max(1, signature.pulseRings) }, (_, ringIndex) => {
        const ringRatio = 1 + spreadBoost + ringIndex * 0.18;
        const ringOpacity = (emphasized ? 0.42 : 0.16) * (1 - ringIndex * 0.24);

        return (
          <circle
            key={`${pulse.id}-ring-${ringIndex}`}
            cx={center[0]}
            cy={center[1]}
            r={radius * ringRatio * (signature.family === "health" ? 1.24 : 1)}
            fill="none"
            stroke={pulse.color}
            strokeOpacity={clamp(ringOpacity, 0.06, 0.64)}
            strokeWidth={(emphasized ? 3.1 : 1.7) * (1 - ringIndex * 0.1)}
          />
        );
      })}
      <circle
        cx={center[0]}
        cy={center[1]}
        r={radius * (emphasized ? 0.72 : visualRegime === "short" ? 0.5 : 0.56)}
        fill={pulse.color}
        fillOpacity={emphasized ? 0.26 : 0.1}
      />
    </g>
  );
}






























































































































































