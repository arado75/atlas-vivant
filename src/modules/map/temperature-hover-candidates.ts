import { clamp } from "../../lib/formatters";
import { temperatureToColor } from "../../lib/temperature-scale";
import type { CityTemperatureFeature, HeatFeature, LayerDataset, LonLat } from "../../types/atlas";
import type { HoveredCityTemperature } from "./temperature-overlay";

type ProjectionFn = (point: LonLat) => [number, number] | null;
type FrontFacingFn = (point: LonLat) => boolean;
type TemperatureSampler = (lat: number, lon: number, timeMs: number) => number;
type SeriesSampler = (timesMs: number[] | undefined, values: number[] | undefined, cursorMs: number) => number | null;
type HeatInterpolator = (position: LonLat, heatFeatures: HeatFeature[], cursorMs: number) => number | null;

interface BuildTemperatureHoverCandidatesInput {
  temperatureLayerActive: boolean;
  displayedTemperatureDataset: LayerDataset;
  projection: ProjectionFn;
  isFrontFacing: FrontFacingFn;
  temperatureSampler: TemperatureSampler | undefined;
  temperatureSampleCursor: number;
  centerX: number;
  centerY: number;
  sampleTemporalSeriesAtTime: SeriesSampler;
  interpolateTemperatureFromHeatFeatures: HeatInterpolator;
  maxCandidates?: number;
}

interface HoverRankedCandidate {
  score: number;
  payload: HoveredCityTemperature;
}

function hasValidCitySeries(city: CityTemperatureFeature): boolean {
  return (
    Array.isArray(city.hourlyTimesMs) &&
    Array.isArray(city.hourlyTempC) &&
    city.hourlyTimesMs.length > 0 &&
    city.hourlyTimesMs.length === city.hourlyTempC.length
  );
}

function sampleCityTemperature(
  city: CityTemperatureFeature,
  sampleCursorMs: number,
  sampleTemporalSeriesAtTime: SeriesSampler
): number | null {
  if (!hasValidCitySeries(city)) {
    return null;
  }

  return (
    sampleTemporalSeriesAtTime(city.hourlyTimesMs, city.hourlyTempC, sampleCursorMs) ??
    city.hourlyTempC![city.hourlyTempC!.length - 1]
  );
}

export function buildTemperatureHoverCandidates(input: BuildTemperatureHoverCandidatesInput): HoveredCityTemperature[] {
  const {
    temperatureLayerActive,
    displayedTemperatureDataset,
    projection,
    isFrontFacing,
    temperatureSampler,
    temperatureSampleCursor,
    centerX,
    centerY,
    sampleTemporalSeriesAtTime,
    interpolateTemperatureFromHeatFeatures,
    maxCandidates = 180
  } = input;

  if (!temperatureLayerActive) {
    return [];
  }

  const allCities = displayedTemperatureDataset.cityTemperatures ?? [];
  const heatFeatures = displayedTemperatureDataset.heat ?? [];
  const trendCursorDelta = Math.abs(temperatureSampleCursor) > 5000 ? 6 * 60 * 60 * 1000 : 1.2;

  return allCities
    .map((city): HoverRankedCandidate | null => {
      if (!isFrontFacing(city.position)) {
        return null;
      }

      const projected = projection(city.position);
      if (!projected) {
        return null;
      }

      const distance = Math.hypot(projected[0] - centerX, projected[1] - centerY);
      const seriesCurrent = sampleCityTemperature(city, temperatureSampleCursor, sampleTemporalSeriesAtTime);
      const fallbackInterpolated =
        interpolateTemperatureFromHeatFeatures(city.position, heatFeatures, temperatureSampleCursor) ?? 18;

      const sampledTemperatureC =
        seriesCurrent ??
        (temperatureSampler
          ? temperatureSampler(city.position[1], city.position[0], temperatureSampleCursor)
          : fallbackInterpolated);

      const seriesPrevious = sampleCityTemperature(city, temperatureSampleCursor - trendCursorDelta, sampleTemporalSeriesAtTime);
      const previousTemperatureC =
        seriesPrevious ??
        (temperatureSampler
          ? temperatureSampler(city.position[1], city.position[0], temperatureSampleCursor - trendCursorDelta)
          : (interpolateTemperatureFromHeatFeatures(city.position, heatFeatures, temperatureSampleCursor - trendCursorDelta) ??
            sampledTemperatureC));

      const deltaC = clamp(sampledTemperatureC - previousTemperatureC, -4.5, 4.5);
      const sourceType = hasValidCitySeries(city)
        ? city.sourceType ?? (temperatureSampler ? "interpolated" : "fallback")
        : temperatureSampler
          ? "interpolated"
          : "fallback";

      return {
        score: distance,
        payload: {
          id: city.id,
          label: city.label,
          x: projected[0],
          y: projected[1],
          temperatureC: sampledTemperatureC,
          deltaC,
          color: temperatureToColor(sampledTemperatureC),
          kind: "city" as const,
          sourceType
        }
      };
    })
    .filter((entry): entry is HoverRankedCandidate => Boolean(entry))
    .sort((left, right) => left.score - right.score)
    .slice(0, maxCandidates)
    .map((entry) => entry.payload);
}
