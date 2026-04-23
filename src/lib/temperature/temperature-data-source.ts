import type {
  CityTemperatureFeature,
  EventZoneFeature,
  HeatFeature,
  LayerDataset,
  LonLat,
  TemperatureSourceType
} from "../../types/atlas";
import { clamp } from "../formatters";
import { temperatureToColor } from "../temperature-scale";

const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const MET_NORWAY_ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const REQUEST_BATCH_SIZE = 96;
const CACHE_TTL_MS = 25 * 60 * 1000;
const PAST_DAYS = 2;
const FORECAST_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FETCH_TIMEOUT_MS = 12000;
const MAX_FETCH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1500;
const BATCH_THROTTLE_MS = 800;
const MET_NORWAY_BATCH_CONCURRENCY = 10;
const MET_NORWAY_BATCH_THROTTLE_MS = 250;
const MAX_FIELD_REQUEST_POINTS = 120;
const FIELD_LAT_BANDS = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75] as const;
const PRIORITY_FIELD_CITY_IDS = new Set(["mumbai"]);
const CITY_ANCHOR_RADIUS_KM = 90;
const CITY_ANCHOR_SIGMA_KM = 42;
const KM_PER_DEGREE = 111.32;

export const OPEN_METEO_FUTURE_HORIZON_MS = FORECAST_DAYS * DAY_MS;
export const OPEN_METEO_PAST_HORIZON_MS = PAST_DAYS * DAY_MS;

export type TemperatureRuntimeRefreshPhase = "download" | "processing" | "ready" | "error";

export interface TemperatureRuntimeRefreshEvent {
  phase: TemperatureRuntimeRefreshPhase;
  progress: number;
  detail: string;
  timestampMs: number;
}

interface GridPointRequest {
  id: string;
  lat: number;
  lon: number;
}

interface TemperaturePointSeries {
  id: string;
  lat: number;
  lon: number;
  sourceType: TemperatureSourceType;
  hourlyTimesMs: number[];
  hourlyTempC: number[];
}

interface TemperatureSample {
  temperatureC: number;
  sourceType: TemperatureSourceType;
}

export interface TemperatureAnchoringDebugSample {
  temperatureBeforeAnchoringC: number;
  temperatureAfterAnchoringC: number;
  correctionC: number;
  nearbyRealCities: number;
  nearestRealCityDistanceKm: number | null;
  localGradientSpanC: number;
}
export interface TemperatureInterpolationDebugSample {
  rawInterpolatedTempC: number;
  stabilizedTempC: number;
  anchoredTempC: number;
  neighborCount: number;
  localVariationC: number;
  nearestRealAnchorKm: number | null;
  usedWideFallback: boolean;
}

interface TemperatureField {
  minTimeMs: number;
  maxTimeMs: number;
  points: TemperaturePointSeries[];
  getTemperature: (lat: number, lon: number, timeMs: number) => number;
  getTemperatureSample: (lat: number, lon: number, timeMs: number) => TemperatureSample;
  getTemperatureBeforeAnchoring: (lat: number, lon: number, timeMs: number) => number;
  getTemperatureBeforeAnchoringSample: (lat: number, lon: number, timeMs: number) => TemperatureSample;
  getTemperatureAnchoringDebug: (lat: number, lon: number, timeMs: number) => TemperatureAnchoringDebugSample;
  getInterpolationDebug: (lat: number, lon: number, timeMs: number) => TemperatureInterpolationDebugSample;
}

interface WeightedEstimate {
  temperature: number;
  nearestDistance: number;
  coverage: number;
  primarySourceType: TemperatureSourceType;
}

export type TemperatureLiveProvider = "open-meteo" | "met-norway";

export interface TemperatureRuntimeSourceStatus {
  primaryProvider: TemperatureLiveProvider;
  activeProvider: TemperatureLiveProvider;
  fallbackLiveActive: boolean;
  attemptedProviders: TemperatureLiveProvider[];
}

export interface TemperatureLayerRuntime {
  source: TemperatureLiveProvider;
  sourceStatus: TemperatureRuntimeSourceStatus;
  fetchedAtMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  dataset: LayerDataset;
  getTemperature: (lat: number, lon: number, timeMs: number) => number;
  getTemperatureSample: (lat: number, lon: number, timeMs: number) => TemperatureSample;
  getTemperatureBeforeAnchoring: (lat: number, lon: number, timeMs: number) => number;
  getTemperatureBeforeAnchoringSample: (lat: number, lon: number, timeMs: number) => TemperatureSample;
  getTemperatureAnchoringDebug: (lat: number, lon: number, timeMs: number) => TemperatureAnchoringDebugSample;
  getInterpolationDebug: (lat: number, lon: number, timeMs: number) => TemperatureInterpolationDebugSample;
}
function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function parseIsoMs(value: string): number {
  const hasTimeZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(value);
  const parsed = Date.parse(hasTimeZone ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function nowHourFallbackSeries(point: GridPointRequest, temperatureC = 15): TemperaturePointSeries {
  const nowHourMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return {
    id: point.id,
    lat: point.lat,
    lon: point.lon,
    sourceType: "fallback",
    hourlyTimesMs: [nowHourMs],
    hourlyTempC: [temperatureC]
  };
}

function splitInBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.max(RETRY_BASE_DELAY_MS, Math.floor(retryAfterSeconds * 1000));
  }

  return RETRY_BASE_DELAY_MS * (attempt + 1);
}

// Keep network pressure low: sequential batches with an explicit delay reduce quota spikes and 429 risk.
async function runBatchesWithThrottle<T, U>(
  batches: T[][],
  worker: (batch: T[]) => Promise<U>,
  throttleMs = BATCH_THROTTLE_MS,
  onBatchComplete?: (completed: number, total: number) => void
): Promise<U[]> {
  const results: U[] = [];

  for (let index = 0; index < batches.length; index += 1) {
    results.push(await worker(batches[index]));
    onBatchComplete?.(index + 1, batches.length);

    if (index < batches.length - 1 && throttleMs > 0) {
      await delay(throttleMs);
    }
  }

  return results;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function fieldLonStepForLat(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat >= 70) {
    return 45;
  }

  if (absLat >= 55) {
    return 30;
  }

  if (absLat >= 35) {
    return 24;
  }

  if (absLat >= 15) {
    return 18;
  }

  return 15;
}

// Field anchors are intentionally sparse and adaptive (bands + land hints), not a brute global grid.
function buildFieldRequests(cityTemplates: CityTemperatureFeature[]): GridPointRequest[] {
  const requestsByKey = new Map<string, GridPointRequest>();

  const addRequest = (lat: number, lon: number, label: string) => {
    const clampedLat = clamp(roundToStep(lat, 1), -80, 80);
    const normalizedLon = normalizeLon(roundToStep(lon, 1));
    const key = `${clampedLat.toFixed(1)}_${normalizedLon.toFixed(1)}`;

    if (!requestsByKey.has(key)) {
      requestsByKey.set(key, {
        id: `${label}_${key}`,
        lat: clampedLat,
        lon: normalizedLon
      });
    }
  };

  for (const lat of FIELD_LAT_BANDS) {
    const step = fieldLonStepForLat(lat);
    const phase = Math.abs(Math.round(lat / 15)) % 2 === 0 ? 0 : step / 2;
    for (let lon = -180 + phase; lon < 180; lon += step) {
      addRequest(lat, lon, "field_band");
      if (requestsByKey.size >= MAX_FIELD_REQUEST_POINTS) {
        break;
      }
    }

    if (requestsByKey.size >= MAX_FIELD_REQUEST_POINTS) {
      break;
    }
  }

  const cityOffsets: ReadonlyArray<[number, number]> = [
    [0, 0],
    [5, 0],
    [-5, 0],
    [0, 5],
    [0, -5]
  ];

  for (const city of cityTemplates) {
    if (!PRIORITY_FIELD_CITY_IDS.has(city.id)) {
      continue;
    }

    const baseLat = roundToStep(city.position[1], 1);
    const baseLon = roundToStep(city.position[0], 1);

    for (const [latOffset, lonOffset] of cityOffsets) {
      addRequest(baseLat + latOffset, baseLon + lonOffset, "field_priority");
      if (requestsByKey.size >= MAX_FIELD_REQUEST_POINTS) {
        break;
      }
    }

    if (requestsByKey.size >= MAX_FIELD_REQUEST_POINTS) {
      break;
    }
  }

  for (const city of cityTemplates) {
    if (requestsByKey.size >= MAX_FIELD_REQUEST_POINTS) {
      break;
    }

    const baseLat = roundToStep(city.position[1], 5);
    const baseLon = roundToStep(city.position[0], 5);

    for (const [latOffset, lonOffset] of cityOffsets) {
      addRequest(baseLat + latOffset, baseLon + lonOffset, "field_land");
      if (requestsByKey.size >= MAX_FIELD_REQUEST_POINTS) {
        break;
      }
    }
  }

  return [...requestsByKey.values()];
}

function buildCityRequests(cityTemplates: CityTemperatureFeature[]): GridPointRequest[] {
  return cityTemplates.map((city) => ({
    id: `city_${city.id}`,
    lat: city.position[1],
    lon: city.position[0]
  }));
}

function asEntryArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { responses?: unknown[] }).responses)) {
    return (payload as { responses: unknown[] }).responses;
  }

  return payload ? [payload] : [];
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function toTimeMsArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        return entry > 1_000_000_000_000 ? entry : entry * 1000;
      }

      if (typeof entry === "string") {
        return parseIsoMs(entry);
      }

      return Number.NaN;
    })
    .filter((entry) => Number.isFinite(entry));
}

function expandPackedPayload(payload: unknown, expectedCount: number): unknown[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as {
    latitude?: unknown;
    longitude?: unknown;
    hourly?: { time?: unknown; temperature_2m?: unknown };
    current?: { temperature_2m?: unknown };
  };

  const latitudes = asNumberArray(source.latitude);
  const longitudes = asNumberArray(source.longitude);

  if (latitudes.length === 0 || latitudes.length !== longitudes.length) {
    return null;
  }

  if (expectedCount > 0 && latitudes.length !== expectedCount) {
    return null;
  }

  const rawTimes = source.hourly?.time;
  const rawTemps = source.hourly?.temperature_2m;

  const currentSource = source.current?.temperature_2m;
  const currentByIndex = Array.isArray(currentSource)
    ? currentSource.map((entry) => Number(entry))
    : [];

  const sharedTimes = toTimeMsArray(rawTimes);
  const sharedTemps = asNumberArray(rawTemps);
  const timesByIndex =
    Array.isArray(rawTimes) && rawTimes.length > 0 && Array.isArray(rawTimes[0])
      ? (rawTimes as unknown[]).map((entry) => toTimeMsArray(entry))
      : null;
  const tempsByIndex =
    Array.isArray(rawTemps) && rawTemps.length > 0 && Array.isArray(rawTemps[0])
      ? (rawTemps as unknown[]).map((entry) => asNumberArray(entry))
      : null;

  return latitudes.map((lat, index) => ({
    latitude: lat,
    longitude: longitudes[index],
    hourly: {
      time: timesByIndex?.[index] ?? sharedTimes,
      temperature_2m: tempsByIndex?.[index] ?? sharedTemps
    },
    current: {
      temperature_2m: Number.isFinite(currentByIndex[index]) ? currentByIndex[index] : undefined
    }
  }));
}

function normalizeEntry(entry: unknown, fallback: GridPointRequest): TemperaturePointSeries | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const source = entry as {
    hourly?: { time?: unknown; temperature_2m?: unknown };
    current?: { temperature_2m?: unknown };
  };

  const hourlyTimesMs = toTimeMsArray(source.hourly?.time);
  const hourlyTempC = asNumberArray(source.hourly?.temperature_2m);

  if (hourlyTimesMs.length > 0 && hourlyTimesMs.length === hourlyTempC.length) {
    return {
      id: fallback.id,
      lat: fallback.lat,
      lon: fallback.lon,
      sourceType: "real",
      hourlyTimesMs,
      hourlyTempC
    };
  }

  const currentRaw = source.current?.temperature_2m;
  const currentValue = Array.isArray(currentRaw) ? Number(currentRaw[0]) : Number(currentRaw);
  const hasCurrentValue = Number.isFinite(currentValue);
  const currentTemp = hasCurrentValue ? currentValue : 15;
  const nowHourMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const sourceType: TemperatureSourceType = hasCurrentValue ? "real" : "fallback";

  return {
    id: fallback.id,
    lat: fallback.lat,
    lon: fallback.lon,
    sourceType,
    hourlyTimesMs: [nowHourMs],
    hourlyTempC: [currentTemp]
  };
}

async function fetchBatchFromOpenMeteo(points: GridPointRequest[]): Promise<TemperaturePointSeries[]> {
  const url = new URL(OPEN_METEO_ENDPOINT);
  url.searchParams.set("latitude", points.map((point) => point.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", points.map((point) => point.lon.toFixed(4)).join(","));
  url.searchParams.set("hourly", "temperature_2m");
  url.searchParams.set("current", "temperature_2m");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("past_days", String(PAST_DAYS));
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("timezone", "UTC");

  let payload: unknown = null;

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        if (response.status === 429 && attempt < MAX_FETCH_RETRIES) {
          const waitMs = retryDelayMs(attempt, response.headers.get("retry-after"));
          await delay(waitMs);
          continue;
        }

        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }

      payload = (await response.json()) as unknown;
      break;
    } catch (error) {
      if (attempt >= MAX_FETCH_RETRIES) {
        throw error;
      }

      await delay(retryDelayMs(attempt, null));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let entries = asEntryArray(payload);

  if (entries.length !== points.length) {
    const expanded = expandPackedPayload(payload, points.length);
    if (expanded && expanded.length === points.length) {
      entries = expanded;
    }
  }

  const normalized = points
    .map((point, index) => normalizeEntry(entries[index], point))
    .filter((entry): entry is TemperaturePointSeries => Boolean(entry));

  if (normalized.length === points.length) {
    return normalized;
  }

  if (points.length === 1) {
    return [nowHourFallbackSeries(points[0])];
  }

  const fallbackSingles: TemperaturePointSeries[] = [];
  for (const point of points) {
    const singleResult = await fetchBatchFromOpenMeteo([point]);
    fallbackSingles.push(...singleResult);
  }

  return fallbackSingles;
}

function normalizeMetNorwayEntry(payload: unknown, fallback: GridPointRequest): TemperaturePointSeries {
  if (!payload || typeof payload !== "object") {
    return nowHourFallbackSeries(fallback);
  }

  const timeseries = (payload as { properties?: { timeseries?: unknown } }).properties?.timeseries;
  if (!Array.isArray(timeseries)) {
    return nowHourFallbackSeries(fallback);
  }

  const hourlyTimesMs: number[] = [];
  const hourlyTempC: number[] = [];

  for (const rawEntry of timeseries) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    const timeValue = (rawEntry as { time?: unknown }).time;
    const temperatureValue = Number(
      (rawEntry as { data?: { instant?: { details?: { air_temperature?: unknown } } } }).data?.instant?.details
        ?.air_temperature
    );

    if (typeof timeValue !== "string" || !Number.isFinite(temperatureValue)) {
      continue;
    }

    hourlyTimesMs.push(parseIsoMs(timeValue));
    hourlyTempC.push(temperatureValue);
  }

  if (hourlyTimesMs.length === 0 || hourlyTimesMs.length !== hourlyTempC.length) {
    return nowHourFallbackSeries(fallback);
  }

  return {
    id: fallback.id,
    lat: fallback.lat,
    lon: fallback.lon,
    sourceType: "real",
    hourlyTimesMs,
    hourlyTempC
  };
}

async function fetchMetNorwayPoint(point: GridPointRequest): Promise<TemperaturePointSeries> {
  const url = new URL(MET_NORWAY_ENDPOINT);
  url.searchParams.set("lat", point.lat.toFixed(4));
  url.searchParams.set("lon", point.lon.toFixed(4));

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const headers: HeadersInit = {
        Accept: "application/json"
      };

      if (typeof window === "undefined") {
        headers["User-Agent"] = "atlas-vivant/1.0";
      }

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers
      });

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_FETCH_RETRIES) {
          const waitMs = retryDelayMs(attempt, response.headers.get("retry-after"));
          await delay(waitMs);
          continue;
        }

        throw new Error(`MET Norway HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      return normalizeMetNorwayEntry(payload, point);
    } catch (error) {
      if (attempt >= MAX_FETCH_RETRIES) {
        throw error;
      }

      await delay(retryDelayMs(attempt, null));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return nowHourFallbackSeries(point);
}

async function fetchBatchFromMetNorway(points: GridPointRequest[]): Promise<TemperaturePointSeries[]> {
  const chunks = splitInBatches(points, MET_NORWAY_BATCH_CONCURRENCY);
  const results: TemperaturePointSeries[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkResults = await Promise.all(
      chunk.map(async (point) => {
        try {
          return await fetchMetNorwayPoint(point);
        } catch {
          return nowHourFallbackSeries(point);
        }
      })
    );

    results.push(...chunkResults);

    if (index < chunks.length - 1) {
      await delay(MET_NORWAY_BATCH_THROTTLE_MS);
    }
  }

  return results;
}

async function fetchBatchFromProvider(
  provider: TemperatureLiveProvider,
  points: GridPointRequest[]
): Promise<TemperaturePointSeries[]> {
  if (provider === "met-norway") {
    return fetchBatchFromMetNorway(points);
  }

  return fetchBatchFromOpenMeteo(points);
}

function countRealSeries(points: TemperaturePointSeries[]): number {
  return points.reduce((count, point) => count + (point.sourceType === "real" ? 1 : 0), 0);
}

function samplePointAtTime(point: TemperaturePointSeries, timeMs: number): number {
  const times = point.hourlyTimesMs;
  const values = point.hourlyTempC;

  if (times.length === 0 || values.length === 0) {
    return 15;
  }

  if (times.length === 1 || values.length === 1) {
    return values[0];
  }

  if (timeMs <= times[0]) {
    return values[0];
  }

  const lastIndex = times.length - 1;
  if (timeMs >= times[lastIndex]) {
    return values[lastIndex];
  }

  let left = 0;
  let right = lastIndex;

  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2);
    if (times[middle] <= timeMs) {
      left = middle;
    } else {
      right = middle;
    }
  }

  const spanMs = Math.max(1, times[right] - times[left]);
  const ratio = clamp((timeMs - times[left]) / spanMs, 0, 1);
  return values[left] + (values[right] - values[left]) * ratio;
}

function temperatureToIntensity(tempC: number): number {
  return clamp((tempC + 20) / 64, 0, 1);
}

function angularDistanceDegrees(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const meanLatRad = ((aLat + bLat) * 0.5 * Math.PI) / 180;
  const normalizedDeltaLon = ((((aLon - bLon) % 360) + 540) % 360) - 180;
  const deltaLon = normalizedDeltaLon * Math.cos(meanLatRad);
  const deltaLat = aLat - bLat;
  return Math.hypot(deltaLon, deltaLat);
}

function weightedEstimate(
  samples: TemperaturePointSeries[],
  lat: number,
  lon: number,
  timeMs: number,
  maxDistance: number,
  limit: number,
  epsilon: number
): WeightedEstimate | null {
  const candidates = samples
    .map((point) => {
      const distance = Math.max(0.01, angularDistanceDegrees(lat, lon, point.lat, point.lon));
      return {
        distance,
        sourceType: point.sourceType,
        temperature: samplePointAtTime(point, timeMs)
      };
    })
    .filter((entry) => entry.distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);

  if (candidates.length === 0) {
    return null;
  }

  const aggregate = candidates.reduce(
    (accumulator, entry) => {
      const weight = 1 / (entry.distance * entry.distance + epsilon);
      accumulator.weightedTemp += entry.temperature * weight;
      accumulator.weightSum += weight;
      return accumulator;
    },
    { weightedTemp: 0, weightSum: 0 }
  );

  if (aggregate.weightSum <= 0) {
    return null;
  }

  return {
    temperature: aggregate.weightedTemp / aggregate.weightSum,
    nearestDistance: candidates[0].distance,
    coverage: candidates.length,
    primarySourceType: candidates[0].sourceType
  };
}

function estimateLocalGradientSpanC(
  samples: TemperaturePointSeries[],
  lat: number,
  lon: number,
  timeMs: number
): number {
  const nearby = samples
    .map((point) => ({
      point,
      distance: angularDistanceDegrees(lat, lon, point.lat, point.lon)
    }))
    .filter((entry) => entry.distance <= 6)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 8);
  if (nearby.length < 2) {
    return 0;
  }
  const temperatures = nearby.map((entry) => samplePointAtTime(entry.point, timeMs));
  return Math.max(...temperatures) - Math.min(...temperatures);
}
function gradientDampingFactor(gradientSpanC: number): number {
  if (gradientSpanC >= 8) {
    return 0.35;
  }
  if (gradientSpanC >= 5) {
    return 0.55;
  }
  if (gradientSpanC >= 3) {
    return 0.75;
  }
  return 1;
}
function maxAnchoringCorrectionC(gradientSpanC: number): number {
  if (gradientSpanC >= 8) {
    return 1.1;
  }
  if (gradientSpanC >= 5) {
    return 1.6;
  }
  return 2.3;
}
function getAnchoringAttenuation(distanceKm: number): number {
  if (distanceKm <= 10) {
    return 0.9;
  }
  if (distanceKm <= 30) {
    return 0.75;
  }
  if (distanceKm <= 60) {
    return 0.6;
  }
  return 0.4;
}
function applyCityAnchoring(
  fieldTempC: number,
  lat: number,
  lon: number,
  timeMs: number,
  fieldAnchors: TemperaturePointSeries[],
  realCityAnchors: TemperaturePointSeries[]
): TemperatureAnchoringDebugSample {
  if (realCityAnchors.length === 0) {
    return {
      temperatureBeforeAnchoringC: fieldTempC,
      temperatureAfterAnchoringC: fieldTempC,
      correctionC: 0,
      nearbyRealCities: 0,
      nearestRealCityDistanceKm: null,
      localGradientSpanC: 0
    };
  }
  let weightedCorrection = 0;
  let weightSum = 0;
  let nearbyRealCities = 0;
  let nearestRealCityDistanceKm = Number.POSITIVE_INFINITY;
  for (const city of realCityAnchors) {
    const distanceDeg = angularDistanceDegrees(lat, lon, city.lat, city.lon);
    const distanceKm = distanceDeg * KM_PER_DEGREE;
    if (distanceKm > CITY_ANCHOR_RADIUS_KM) {
      continue;
    }
    nearbyRealCities += 1;
    nearestRealCityDistanceKm = Math.min(nearestRealCityDistanceKm, distanceKm);
    const cityTemp = samplePointAtTime(city, timeMs);
    const influence = Math.exp(-(distanceKm * distanceKm) / (2 * CITY_ANCHOR_SIGMA_KM * CITY_ANCHOR_SIGMA_KM));
    weightedCorrection += (cityTemp - fieldTempC) * influence;
    weightSum += influence;
  }
  if (weightSum <= 0) {
    return {
      temperatureBeforeAnchoringC: fieldTempC,
      temperatureAfterAnchoringC: fieldTempC,
      correctionC: 0,
      nearbyRealCities: 0,
      nearestRealCityDistanceKm: null,
      localGradientSpanC: 0
    };
  }
  const gradientSpanC = estimateLocalGradientSpanC(fieldAnchors, lat, lon, timeMs);
  const damping = gradientDampingFactor(gradientSpanC);
  const densityFactor = clamp(weightSum / 0.95, 0.15, 1);
  const rawCorrectionC = (weightedCorrection / weightSum) * damping * densityFactor;
  const boundedCorrectionC = clamp(rawCorrectionC, -maxAnchoringCorrectionC(gradientSpanC), maxAnchoringCorrectionC(gradientSpanC));
  const attenuation = getAnchoringAttenuation(nearestRealCityDistanceKm);
  const anchoredCorrectionC = boundedCorrectionC * attenuation;
  const anchoredTempC = clamp(fieldTempC + anchoredCorrectionC, -55, 55);
  return {
    temperatureBeforeAnchoringC: fieldTempC,
    temperatureAfterAnchoringC: anchoredTempC,
    correctionC: anchoredCorrectionC,
    nearbyRealCities,
    nearestRealCityDistanceKm: Number.isFinite(nearestRealCityDistanceKm) ? nearestRealCityDistanceKm : null,
    localGradientSpanC: gradientSpanC
  };
}
function buildField(points: TemperaturePointSeries[], citySeriesById: Map<string, TemperaturePointSeries>): TemperatureField {
  const fieldAnchors = points.length > 0 ? points : [...citySeriesById.values()];
  const allTimes = fieldAnchors.flatMap((point) => point.hourlyTimesMs);
  const minTimeMs = allTimes.length > 0 ? Math.min(...allTimes) : Date.now() - HOUR_MS;
  const maxTimeMs = allTimes.length > 0 ? Math.max(...allTimes) : Date.now() + HOUR_MS;
  const realCityAnchors = [...citySeriesById.values()].filter((city) => city.sourceType === "real");
  const nearestRealAnchorDistanceKm = (lat: number, lon: number): number | null => {
    if (realCityAnchors.length === 0) {
      return null;
    }
    let nearest = Number.POSITIVE_INFINITY;
    for (const city of realCityAnchors) {
      const distanceKm = angularDistanceDegrees(lat, lon, city.lat, city.lon) * KM_PER_DEGREE;
      nearest = Math.min(nearest, distanceKm);
    }
    return Number.isFinite(nearest) ? nearest : null;
  };
  const getRawInterpolatedSample = (
    lat: number,
    lon: number,
    timeMs: number
  ): TemperatureSample & { usedWideFallback: boolean } => {
    const normalizedLon = normalizeLon(lon);
    const broad = weightedEstimate(fieldAnchors, lat, normalizedLon, timeMs, 62, 14, 1.4);
    const local = weightedEstimate(fieldAnchors, lat, normalizedLon, timeMs, 24, 24, 0.14);
    const wide = !local && !broad ? weightedEstimate(fieldAnchors, lat, normalizedLon, timeMs, 92, 28, 2.4) : null;
    let fieldTemp = local?.temperature ?? broad?.temperature ?? wide?.temperature ?? 15;
    const sourceType: TemperatureSourceType = local || broad || wide ? "interpolated" : "fallback";
    if (broad && local) {
      const contrast = Math.abs(local.temperature - broad.temperature);
      const localPriority = clamp(
        (1 - local.nearestDistance / 24) * (contrast > 6 ? 0.3 : contrast > 3 ? 0.45 : 0.58),
        0.2,
        0.8
      );
      fieldTemp = broad.temperature + (local.temperature - broad.temperature) * localPriority;
    }
    return {
      temperatureC: clamp(fieldTemp, -55, 55),
      sourceType,
      usedWideFallback: Boolean(wide)
    };
  };
  const getStabilizedInterpolation = (
    lat: number,
    lon: number,
    timeMs: number
  ): {
    rawTempC: number;
    stabilizedTempC: number;
    sourceType: TemperatureSourceType;
    neighborCount: number;
    localVariationC: number;
    nearestRealAnchorKm: number | null;
    usedWideFallback: boolean;
  } => {
    const normalizedLon = normalizeLon(lon);
    const raw = getRawInterpolatedSample(lat, normalizedLon, timeMs);
    if (raw.sourceType === "fallback") {
      return {
        rawTempC: raw.temperatureC,
        stabilizedTempC: raw.temperatureC,
        sourceType: raw.sourceType,
        neighborCount: 0,
        localVariationC: 0,
        nearestRealAnchorKm: nearestRealAnchorDistanceKm(lat, normalizedLon),
        usedWideFallback: raw.usedWideFallback
      };
    }
    const neighborOffsets: ReadonlyArray<[number, number]> = [
      [0.25, 0],
      [-0.25, 0],
      [0, 0.25],
      [0, -0.25],
      [0.18, 0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [-0.18, -0.18]
    ];
    const neighborTemps = neighborOffsets.map(([latOffset, lonOffset]) =>
      getRawInterpolatedSample(lat + latOffset, normalizedLon + lonOffset, timeMs).temperatureC
    );
    const neighborCount = neighborTemps.length;
    const neighborAverage =
      neighborCount > 0 ? neighborTemps.reduce((sum, value) => sum + value, 0) / neighborCount : raw.temperatureC;
    const localVariationC =
      neighborCount > 0
        ? Math.max(raw.temperatureC, ...neighborTemps) - Math.min(raw.temperatureC, ...neighborTemps)
        : 0;
    let stabilizationWeight = 0.3;
    if (localVariationC >= 7) {
      stabilizationWeight = 0.12;
    } else if (localVariationC >= 4.5) {
      stabilizationWeight = 0.2;
    }
    let stabilizedTempC = raw.temperatureC * (1 - stabilizationWeight) + neighborAverage * stabilizationWeight;
    const nearestAnchorKm = nearestRealAnchorDistanceKm(lat, normalizedLon);
    const noRealAnchorNearby = nearestAnchorKm === null || nearestAnchorKm > 120;
    const discontinuityC = Math.abs(stabilizedTempC - neighborAverage);
    if (noRealAnchorNearby && discontinuityC > 5 && localVariationC < 7.5) {
      const continuityBlend = clamp((discontinuityC - 5) / 6, 0, 0.18);
      stabilizedTempC = stabilizedTempC + (neighborAverage - stabilizedTempC) * continuityBlend;
    }
    return {
      rawTempC: raw.temperatureC,
      stabilizedTempC: clamp(stabilizedTempC, -55, 55),
      sourceType: raw.sourceType,
      neighborCount,
      localVariationC,
      nearestRealAnchorKm: nearestAnchorKm,
      usedWideFallback: raw.usedWideFallback
    };
  };
  const getTemperatureBeforeAnchoringSample = (lat: number, lon: number, timeMs: number): TemperatureSample => {
    const stabilized = getStabilizedInterpolation(lat, lon, timeMs);
    return {
      temperatureC: stabilized.stabilizedTempC,
      sourceType: stabilized.sourceType
    };
  };
  const getTemperatureAnchoringDebug = (lat: number, lon: number, timeMs: number): TemperatureAnchoringDebugSample => {
    const normalizedLon = normalizeLon(lon);
    const baseline = getTemperatureBeforeAnchoringSample(lat, normalizedLon, timeMs);
    return applyCityAnchoring(baseline.temperatureC, lat, normalizedLon, timeMs, fieldAnchors, realCityAnchors);
  };
  const getInterpolationDebug = (lat: number, lon: number, timeMs: number): TemperatureInterpolationDebugSample => {
    const normalizedLon = normalizeLon(lon);
    const stabilized = getStabilizedInterpolation(lat, normalizedLon, timeMs);
    const anchored = applyCityAnchoring(
      stabilized.stabilizedTempC,
      lat,
      normalizedLon,
      timeMs,
      fieldAnchors,
      realCityAnchors
    );
    return {
      rawInterpolatedTempC: stabilized.rawTempC,
      stabilizedTempC: stabilized.stabilizedTempC,
      anchoredTempC: anchored.temperatureAfterAnchoringC,
      neighborCount: stabilized.neighborCount,
      localVariationC: stabilized.localVariationC,
      nearestRealAnchorKm: stabilized.nearestRealAnchorKm,
      usedWideFallback: stabilized.usedWideFallback
    };
  };
  const getTemperatureSample = (lat: number, lon: number, timeMs: number): TemperatureSample => {
    const normalizedLon = normalizeLon(lon);
    const baseline = getTemperatureBeforeAnchoringSample(lat, normalizedLon, timeMs);
    if (baseline.sourceType === "fallback") {
      return baseline;
    }
    const anchored = applyCityAnchoring(
      baseline.temperatureC,
      lat,
      normalizedLon,
      timeMs,
      fieldAnchors,
      realCityAnchors
    );
    return {
      temperatureC: anchored.temperatureAfterAnchoringC,
      sourceType: "interpolated"
    };
  };
  const getTemperature = (lat: number, lon: number, timeMs: number) =>
    getTemperatureSample(lat, lon, timeMs).temperatureC;
  const getTemperatureBeforeAnchoring = (lat: number, lon: number, timeMs: number) =>
    getTemperatureBeforeAnchoringSample(lat, lon, timeMs).temperatureC;
  return {
    minTimeMs,
    maxTimeMs,
    points: fieldAnchors,
    getTemperature,
    getTemperatureSample,
    getTemperatureBeforeAnchoring,
    getTemperatureBeforeAnchoringSample,
    getTemperatureAnchoringDebug,
    getInterpolationDebug
  };
}
function buildHeatFeatures(field: TemperatureField, referenceMs: number): HeatFeature[] {
  return field.points.map((point) => {
    const sampledTimesMs: number[] = [];
    const sampledIntensity: number[] = [];

    for (let index = 0; index < point.hourlyTimesMs.length; index += 3) {
      sampledTimesMs.push(point.hourlyTimesMs[index]);
      sampledIntensity.push(temperatureToIntensity(point.hourlyTempC[index]));
    }

    if (sampledTimesMs.length === 0) {
      sampledTimesMs.push(referenceMs);
      sampledIntensity.push(temperatureToIntensity(field.getTemperature(point.lat, point.lon, referenceMs)));
    }

    const currentTemp = field.getTemperature(point.lat, point.lon, referenceMs);

    return {
      id: point.id,
      label: `Cellule ${point.lat.toFixed(1)}, ${point.lon.toFixed(1)}`,
      center: [point.lon, point.lat] as LonLat,
      radius: 7 + Math.abs(point.lat) * 0.035,
      color: temperatureToColor(currentTemp),
      intensity: sampledIntensity,
      intensityTimesMs: sampledTimesMs,
      sourceType: point.sourceType,
      confidence: 0.84
    };
  });
}

function buildEventZones(field: TemperatureField, referenceMs: number): EventZoneFeature[] {
  const candidates = field.points.map((point) => {
    const current = field.getTemperature(point.lat, point.lon, referenceMs);
    const previous = field.getTemperature(point.lat, point.lon, referenceMs - 6 * HOUR_MS);
    const delta = current - previous;

    return {
      point,
      current,
      delta
    };
  });

  const hottest = [...candidates].sort((left, right) => right.current - left.current)[0];
  const strongestRise = [...candidates].sort((left, right) => right.delta - left.delta)[0];
  const coldest = [...candidates].sort((left, right) => left.current - right.current)[0];

  const zones: EventZoneFeature[] = [];

  if (hottest && hottest.current >= 28) {
    zones.push({
      id: "om_hotspot_heatwave",
      label: "Canicule detectee",
      kind: "heatwave",
      center: [hottest.point.lon, hottest.point.lat],
      radius: clamp(14 + (hottest.current - 28) * 0.8, 14, 26),
      intensity: clamp((hottest.current - 28) / 14, 0.25, 0.95),
      startMs: referenceMs - 6 * HOUR_MS,
      endMs: referenceMs + 36 * HOUR_MS
    });
  }

  if (strongestRise && strongestRise.delta >= 1.1) {
    zones.push({
      id: "om_rising_heatwave",
      label: "Montee thermique rapide",
      kind: "heatwave",
      center: [strongestRise.point.lon, strongestRise.point.lat],
      radius: clamp(13 + strongestRise.delta * 2.2, 13, 24),
      intensity: clamp(strongestRise.delta / 6, 0.22, 0.88),
      startMs: referenceMs - 3 * HOUR_MS,
      endMs: referenceMs + 24 * HOUR_MS
    });
  }

  if (coldest && coldest.current <= 8) {
    zones.push({
      id: "om_cold_storm",
      label: "Zone froide active",
      kind: "storm",
      center: [coldest.point.lon, coldest.point.lat],
      radius: clamp(12 + (8 - coldest.current) * 0.7, 12, 22),
      intensity: clamp((8 - coldest.current) / 16, 0.18, 0.82),
      startMs: referenceMs - 3 * HOUR_MS,
      endMs: referenceMs + 24 * HOUR_MS
    });
  }

  return zones;
}

function buildLayerDataset(
  field: TemperatureField,
  referenceMs: number,
  cityTemplates: CityTemperatureFeature[],
  citySeriesById: Map<string, TemperaturePointSeries>
): LayerDataset {
  return {
    heat: buildHeatFeatures(field, referenceMs),
    cityTemperatures: cityTemplates.map((city) => {
      const series = citySeriesById.get(city.id);
      return {
        id: city.id,
        label: city.label,
        position: city.position,
        sourceType: series?.sourceType ?? "fallback",
        hourlyTimesMs: series?.hourlyTimesMs,
        hourlyTempC: series?.hourlyTempC
      };
    }),
    eventZones: buildEventZones(field, referenceMs)
  };
}

interface TemperatureFieldCache {
  provider: TemperatureLiveProvider;
  sourceStatus: TemperatureRuntimeSourceStatus;
  fetchedAtMs: number;
  field: TemperatureField;
  citySeriesById: Map<string, TemperaturePointSeries>;
}

let cache: TemperatureFieldCache | null = null;
let inFlight: Promise<TemperatureFieldCache | null> | null = null;

interface LoadTemperatureRuntimeOptions {
  forceRefresh?: boolean;
  onRefreshEvent?: (event: TemperatureRuntimeRefreshEvent) => void;
  providerSimulation?: {
    failOpenMeteo?: boolean;
    failMetNorway?: boolean;
  };
}

function isProviderForcedToFail(
  provider: TemperatureLiveProvider,
  simulation: LoadTemperatureRuntimeOptions["providerSimulation"]
): boolean {
  if (!simulation) {
    return false;
  }

  if (provider === "open-meteo") {
    return Boolean(simulation.failOpenMeteo);
  }

  return Boolean(simulation.failMetNorway);
}

export function isOpenMeteoTimeSupported(referenceMs: number, nowMs = Date.now()): boolean {
  return referenceMs >= nowMs - OPEN_METEO_PAST_HORIZON_MS && referenceMs <= nowMs + OPEN_METEO_FUTURE_HORIZON_MS;
}

export async function loadTemperatureLayerRuntime(
  referenceMs: number,
  cityTemplates: CityTemperatureFeature[],
  nowMs = Date.now(),
  options: LoadTemperatureRuntimeOptions = {}
): Promise<TemperatureLayerRuntime | null> {
  const emitRefreshEvent = (phase: TemperatureRuntimeRefreshPhase, progress: number, detail: string) => {
    options.onRefreshEvent?.({
      phase,
      progress: clamp(progress, 0, 1),
      detail,
      timestampMs: Date.now()
    });
  };

  if (!isOpenMeteoTimeSupported(referenceMs, nowMs)) {
    emitRefreshEvent("error", 1, "reference_out_of_supported_horizon");
    return null;
  }

  if (options.forceRefresh || !cache || nowMs - cache.fetchedAtMs >= CACHE_TTL_MS) {
    emitRefreshEvent("download", 0, "starting_download");

    if (!inFlight) {
      inFlight = (async () => {
        const providers: TemperatureLiveProvider[] = ["open-meteo", "met-norway"];
        let selectedProvider: TemperatureLiveProvider | null = null;
        let selectedField: TemperatureField | null = null;
        let selectedCitySeriesById = new Map<string, TemperaturePointSeries>();
        const attemptedProviders: TemperatureLiveProvider[] = [];

        for (const provider of providers) {
          attemptedProviders.push(provider);
          if (isProviderForcedToFail(provider, options.providerSimulation)) {
            emitRefreshEvent("download", 0, `provider_forced_failure_${provider}`);
            continue;
          }

          const isMetNorway = provider === "met-norway";
          const providerDetail = isMetNorway ? "met_norway" : "open_meteo";
          const fieldRequests = isMetNorway ? [] : buildFieldRequests(cityTemplates);
          const fieldBatches = splitInBatches(fieldRequests, REQUEST_BATCH_SIZE);
          const cityRequests = buildCityRequests(cityTemplates);
          const cityBatches = splitInBatches(cityRequests, REQUEST_BATCH_SIZE);
          const totalDownloadBatches = Math.max(1, fieldBatches.length + cityBatches.length);
          let completedDownloadBatches = 0;

          emitRefreshEvent("download", 0, `starting_download_${providerDetail}`);

          const markDownloadProgress = () => {
            completedDownloadBatches += 1;
            emitRefreshEvent(
              "download",
              completedDownloadBatches / totalDownloadBatches,
              `downloading_batches_${providerDetail}`
            );
          };

          const fieldParts =
            fieldBatches.length === 0
              ? []
              : await runBatchesWithThrottle(
                  fieldBatches,
                  async (batch) => {
                    try {
                      return await fetchBatchFromProvider(provider, batch);
                    } catch {
                      return [] as TemperaturePointSeries[];
                    }
                  },
                  isMetNorway ? 0 : BATCH_THROTTLE_MS,
                  () => markDownloadProgress()
                );

          const cityParts = await runBatchesWithThrottle(
            cityBatches,
            async (batch) => {
              try {
                return await fetchBatchFromProvider(provider, batch);
              } catch {
                return [] as TemperaturePointSeries[];
              }
            },
            isMetNorway ? 0 : BATCH_THROTTLE_MS,
            () => markDownloadProgress()
          );

          emitRefreshEvent("processing", 0.2, `download_complete_processing_started_${providerDetail}`);

          const points = fieldParts.flat();
          const citySeries = cityParts.flat();
          const citySeriesById = new Map<string, TemperaturePointSeries>();

          for (const series of citySeries) {
            const cityId = series.id.startsWith("city_") ? series.id.slice(5) : series.id;
            citySeriesById.set(cityId, series);
          }

          const realFieldCount = countRealSeries(points);
          const realCityCount = countRealSeries(citySeries);
          const minimumRealCityCount = Math.max(12, Math.floor(cityRequests.length * 0.2));

          if (!isMetNorway) {
            const minimumFieldCount = Math.max(28, Math.floor(fieldRequests.length * 0.55));
            const minimumRealFieldCount = Math.max(16, Math.floor(fieldRequests.length * 0.2));

            if (
              points.length < minimumFieldCount ||
              realFieldCount < minimumRealFieldCount ||
              realCityCount < minimumRealCityCount
            ) {
              continue;
            }
          } else if (realCityCount < minimumRealCityCount) {
            continue;
          }

          emitRefreshEvent("processing", 0.55, `building_field_${providerDetail}`);
          const field = buildField(points, citySeriesById);
          emitRefreshEvent("processing", 0.85, `runtime_prepared_${providerDetail}`);

          selectedProvider = provider;
          selectedField = field;
          selectedCitySeriesById = citySeriesById;
          break;
        }

        if (!selectedProvider || !selectedField) {
          throw new Error("all_live_providers_unavailable");
        }

        const sourceStatus: TemperatureRuntimeSourceStatus = {
          primaryProvider: "open-meteo",
          activeProvider: selectedProvider,
          fallbackLiveActive: selectedProvider !== "open-meteo",
          attemptedProviders
        };

        const entry: TemperatureFieldCache = {
          provider: selectedProvider,
          sourceStatus,
          fetchedAtMs: nowMs,
          field: selectedField,
          citySeriesById: selectedCitySeriesById
        };

        cache = entry;
        return entry;
      })()
        .catch(() => null)
        .finally(() => {
          inFlight = null;
        });
    }

    const fetched = await inFlight;
    if (!fetched) {
      cache = null;
    }

    if (!fetched && !cache) {
      emitRefreshEvent("error", 1, "runtime_unavailable");
      return null;
    }
  }

  if (!cache) {
    emitRefreshEvent("error", 1, "runtime_unavailable");
    return null;
  }

  emitRefreshEvent("processing", 1, "building_dataset_snapshot");
  const clampedReferenceMs = clamp(referenceMs, cache.field.minTimeMs, cache.field.maxTimeMs);
  const dataset = buildLayerDataset(cache.field, clampedReferenceMs, cityTemplates, cache.citySeriesById);

  emitRefreshEvent("ready", 1, "published_snapshot");
  return {
    source: cache.provider,
    sourceStatus: cache.sourceStatus,
    fetchedAtMs: cache.fetchedAtMs,
    minTimeMs: cache.field.minTimeMs,
    maxTimeMs: cache.field.maxTimeMs,
    dataset,
    getTemperature: cache.field.getTemperature,
    getTemperatureSample: cache.field.getTemperatureSample,
    getTemperatureBeforeAnchoring: cache.field.getTemperatureBeforeAnchoring,
    getTemperatureBeforeAnchoringSample: cache.field.getTemperatureBeforeAnchoringSample,
    getTemperatureAnchoringDebug: cache.field.getTemperatureAnchoringDebug,
    getInterpolationDebug: cache.field.getInterpolationDebug
  };
}

export function resetTemperatureLayerRuntimeCache(): void {
  cache = null;
  inFlight = null;
}




































