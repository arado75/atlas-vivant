import { intensityToTemperatureC } from "../../lib/temperature-scale";
import { temperatureReferenceCities } from "../../data/temperatureReferenceCities";
import { mockLayerData } from "../../data/mockAtlasData";
import { loadTemperatureLayerRuntime } from "../../lib/temperature/temperature-data-source";
import type { HeatFeature } from "../../types/atlas";
import type { EventTrigger, Signal } from "../types";

interface WeatherAgentOptions {
  agentId?: string;
  anomalyThresholdC?: number;
}

export const DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C = 2;

interface DetectTemperatureAnomalyOptions {
  referenceMs?: number;
  nowMs?: number;
  forceRefresh?: boolean;
  thresholdC?: number;
}

export interface TemperatureCheckSnapshot {
  cityId: string;
  cityLabel: string;
  sampledAtMs: number;
  fetchedAtMs: number;
  cityTemperatureC: number;
  fieldTemperatureC: number;
  deltaC: number;
  thresholdC: number;
  source: "open-meteo" | "met-norway" | "fallback";
}

export interface WeatherAnomalyDetectionResult {
  signal: Signal | null;
  snapshot: TemperatureCheckSnapshot | null;
}

export interface WeatherAgent {
  id: string;
  role: "weather";
  emitSignal: (trigger: EventTrigger) => Signal | null;
  detectTemperatureAnomaly: (
    cityQuery: string,
    options?: DetectTemperatureAnomalyOptions
  ) => Promise<WeatherAnomalyDetectionResult>;
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveCity(query: string) {
  const normalized = normalizeText(query);

  return (
    temperatureReferenceCities.find((city) => city.id === query) ??
    temperatureReferenceCities.find((city) => normalizeText(city.id) === normalized) ??
    temperatureReferenceCities.find((city) => normalizeText(city.label) === normalized)
  );
}

function sampleSeriesAtTime(values: number[] | undefined, timesMs: number[] | undefined, cursorMs: number): number | null {
  if (!values || !timesMs || values.length === 0 || values.length !== timesMs.length) {
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

function sampleSeries(values: number[] | undefined, index: number): number | null {
  if (!values || values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return values[0];
  }

  const wrapped = ((index % values.length) + values.length) % values.length;
  const left = Math.floor(wrapped);
  const right = (left + 1) % values.length;
  const ratio = wrapped - left;
  return values[left] + (values[right] - values[left]) * ratio;
}

function distanceDegrees(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const meanLatRad = ((aLat + bLat) * 0.5 * Math.PI) / 180;
  const deltaLon = (aLon - bLon) * Math.cos(meanLatRad);
  const deltaLat = aLat - bLat;
  return Math.hypot(deltaLon, deltaLat);
}

function sampleHeatTemperature(heat: HeatFeature, sampledAtMs: number): number | null {
  const intensityFromTimeline = sampleSeriesAtTime(heat.intensity, heat.intensityTimesMs, sampledAtMs);
  if (intensityFromTimeline !== null) {
    return intensityToTemperatureC(intensityFromTimeline);
  }

  const date = new Date(sampledAtMs);
  const seasonalIndex =
    date.getUTCMonth() +
    (date.getUTCDate() - 1) /
      Math.max(1, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate());
  const fallbackIntensity = sampleSeries(heat.intensity, seasonalIndex);
  return fallbackIntensity === null ? null : intensityToTemperatureC(fallbackIntensity);
}

function interpolateFieldFromHeat(lat: number, lon: number, sampledAtMs: number, heat: HeatFeature[]): number | null {
  if (heat.length === 0) {
    return null;
  }

  const ranked = heat
    .map((cell) => {
      const temperatureC = sampleHeatTemperature(cell, sampledAtMs);
      if (temperatureC === null) {
        return null;
      }

      const distance = Math.max(0.01, distanceDegrees(lat, lon, cell.center[1], cell.center[0]));
      const weight = 1 / (distance * distance + 0.18);

      return {
        temperatureC,
        weight,
        distance
      };
    })
    .filter((entry): entry is { temperatureC: number; weight: number; distance: number } => Boolean(entry))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 16);

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

  if (aggregate.sum <= 0) {
    return null;
  }

  return aggregate.weighted / aggregate.sum;
}

function buildFallbackCityTemperature(
  cityId: string,
  sampledAtMs: number,
  fieldTemperatureC: number
): number {
  const fallbackCity = mockLayerData.surface_temperature.cityTemperatures?.find((entry) => entry.id === cityId);
  const baselineOffsetC = fallbackCity?.baselineOffsetC ?? 0;
  const trendFactor = fallbackCity?.trendFactor ?? 1;
  const dailyPhase = (new Date(sampledAtMs).getUTCHours() / 24) * Math.PI * 2;
  const seasonalWaveC = Math.sin(dailyPhase) * 0.7 * trendFactor;
  return fieldTemperatureC + baselineOffsetC + seasonalWaveC;
}

export function createWeatherAgent(options: WeatherAgentOptions = {}): WeatherAgent {
  const id = options.agentId ?? "weather-agent-v1";
  const defaultThresholdC = options.anomalyThresholdC ?? DEFAULT_TEMPERATURE_ANOMALY_THRESHOLD_C;

  return {
    id,
    role: "weather",
    emitSignal(trigger) {
      if (trigger.kind !== "temperature.anomaly") {
        return null;
      }

      const payload = trigger.payload ?? {};
      const deviationC = asNumber(payload.deviationC) ?? 0;
      const city = typeof payload.city === "string" ? payload.city : "zone inconnue";
      const severity = clamp(Math.abs(deviationC) / 8, 0, 1);

      return {
        id: `${id}:${trigger.id}`,
        kind: "temperature.anomaly.detected",
        domain: "temperature",
        sourceRole: "weather",
        createdAtMs: Date.now(),
        summary: `Anomalie temperature detectee sur ${city}`,
        severity,
        confidence: 0.65,
        context: {
          city,
          deviationC
        }
      };
    },
    async detectTemperatureAnomaly(cityQuery, detectOptions = {}) {
      const city = resolveCity(cityQuery);
      if (!city) {
        return {
          signal: null,
          snapshot: null
        };
      }

      const nowMs = detectOptions.nowMs ?? Date.now();
      const sampledAtMs =
        detectOptions.referenceMs ?? Math.floor(nowMs / (60 * 60 * 1000)) * (60 * 60 * 1000);
      const thresholdC = detectOptions.thresholdC ?? defaultThresholdC;

      const runtime = await loadTemperatureLayerRuntime(sampledAtMs, temperatureReferenceCities, nowMs, {
        forceRefresh: detectOptions.forceRefresh
      });

      const runtimeDataset = runtime?.dataset ?? mockLayerData.surface_temperature;
      const citySeries = runtimeDataset.cityTemperatures?.find((entry) => entry.id === city.id);
      const citySeriesTemperatureC = sampleSeriesAtTime(citySeries?.hourlyTempC, citySeries?.hourlyTimesMs, sampledAtMs);
      const fieldTemperatureC = interpolateFieldFromHeat(
        city.position[1],
        city.position[0],
        sampledAtMs,
        runtimeDataset.heat ?? []
      );
      const cityTemperatureC =
        citySeriesTemperatureC ??
        (fieldTemperatureC === null ? null : buildFallbackCityTemperature(city.id, sampledAtMs, fieldTemperatureC));

      if (cityTemperatureC === null || fieldTemperatureC === null) {
        return {
          signal: null,
          snapshot: null
        };
      }

      const deltaC = cityTemperatureC - fieldTemperatureC;

      const snapshot: TemperatureCheckSnapshot = {
        cityId: city.id,
        cityLabel: city.label,
        sampledAtMs,
        fetchedAtMs: runtime?.fetchedAtMs ?? sampledAtMs,
        cityTemperatureC,
        fieldTemperatureC,
        deltaC,
        thresholdC,
        source: runtime?.source ?? "fallback"
      };

      if (Math.abs(deltaC) <= thresholdC) {
        return {
          signal: null,
          snapshot
        };
      }

      const severity = clamp(Math.abs(deltaC) / 8, 0, 1);

      return {
        signal: {
          id: `${id}:temperature_anomaly:${city.id}:${sampledAtMs}`,
          kind: "temperature_anomaly",
          domain: "temperature",
          sourceRole: "weather",
          createdAtMs: Date.now(),
          summary: `Ecart temperature detecte sur ${city.label}: ${deltaC.toFixed(2)}°C`,
          severity,
          confidence: 0.72,
          context: {
            cityId: city.id,
            city: city.label,
            timestampMs: sampledAtMs,
            cityTemperatureC,
            fieldTemperatureC,
            deltaC,
            thresholdC,
            source: runtime?.source ?? "fallback"
          }
        },
        snapshot
      };
    }
  };
}

