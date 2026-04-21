import { temperatureReferenceCities } from "../../data/temperatureReferenceCities";
import { loadTemperatureLayerRuntime } from "../../lib/temperature/temperature-data-source";
import type { CityTemperatureFeature } from "../../types/atlas";

type RingDistanceKm = 0 | 20 | 50 | 80;

type AnchoringRingRow = {
  city: string;
  distanceKm: RingDistanceKm;
  cityTempRealC: number | null;
  fieldBeforeC: number | null;
  fieldAfterC: number | null;
  deltaBeforeC: number | null;
  deltaAfterC: number | null;
  improvementC: number | null;
  nearbyRealCities: number;
  gradientSpanC: number;
  anchoredSourceType: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const KM_PER_DEGREE = 111.32;
const RING_DISTANCES: RingDistanceKm[] = [0, 20, 50, 80];

const TARGET_CITIES = [
  { id: "paris", label: "Paris" },
  { id: "london", label: "Londres" },
  { id: "new_york", label: "New York" },
  { id: "mexico_city", label: "Mexico" },
  { id: "sao_paulo", label: "Sao Paulo" },
  { id: "cairo", label: "Le Caire" },
  { id: "tokyo", label: "Tokyo" }
] as const;

function sampleSeriesAtTime(
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
      const ratio = Math.max(0, Math.min(1, (cursorMs - leftTime) / Math.max(1, rightTime - leftTime)));
      return values[index] + (values[index + 1] - values[index]) * ratio;
    }
  }

  return values[lastIndex];
}

function toRingPoint(city: CityTemperatureFeature, distanceKm: RingDistanceKm): { lat: number; lon: number } {
  const lat = city.position[1];
  const lon = city.position[0];

  if (distanceKm === 0) {
    return { lat, lon };
  }

  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lonOffset = distanceKm / (KM_PER_DEGREE * cosLat);

  return {
    lat,
    lon: lon + lonOffset
  };
}

function buildRow(
  city: CityTemperatureFeature,
  cityLabel: string,
  distanceKm: RingDistanceKm,
  cityTempRealC: number | null,
  referenceMs: number,
  getBefore: (lat: number, lon: number, timeMs: number) => number,
  getAfter: (lat: number, lon: number, timeMs: number) => number,
  getAfterSample: (lat: number, lon: number, timeMs: number) => { temperatureC: number; sourceType: string },
  getDebug: (lat: number, lon: number, timeMs: number) => {
    localGradientSpanC: number;
    nearbyRealCities: number;
  }
): AnchoringRingRow {
  const ringPoint = toRingPoint(city, distanceKm);
  const fieldBeforeC = getBefore(ringPoint.lat, ringPoint.lon, referenceMs);
  const afterSample = getAfterSample(ringPoint.lat, ringPoint.lon, referenceMs);
  const fieldAfterC = getAfter(ringPoint.lat, ringPoint.lon, referenceMs);
  const debug = getDebug(ringPoint.lat, ringPoint.lon, referenceMs);

  const deltaBeforeC = cityTempRealC === null ? null : Math.abs(fieldBeforeC - cityTempRealC);
  const deltaAfterC = cityTempRealC === null ? null : Math.abs(fieldAfterC - cityTempRealC);
  const improvementC =
    deltaBeforeC === null || deltaAfterC === null ? null : Number((deltaBeforeC - deltaAfterC).toFixed(3));

  return {
    city: cityLabel,
    distanceKm,
    cityTempRealC: cityTempRealC === null ? null : Number(cityTempRealC.toFixed(3)),
    fieldBeforeC: Number(fieldBeforeC.toFixed(3)),
    fieldAfterC: Number(fieldAfterC.toFixed(3)),
    deltaBeforeC: deltaBeforeC === null ? null : Number(deltaBeforeC.toFixed(3)),
    deltaAfterC: deltaAfterC === null ? null : Number(deltaAfterC.toFixed(3)),
    improvementC,
    nearbyRealCities: debug.nearbyRealCities,
    gradientSpanC: Number(debug.localGradientSpanC.toFixed(3)),
    anchoredSourceType: afterSample.sourceType
  };
}

export async function runCityAnchoringCheck() {
  const referenceMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const cityTemplates = temperatureReferenceCities.map((city) => ({
    id: city.id,
    label: city.label,
    position: city.position,
    importance: city.importance
  }));

  const runtime = await loadTemperatureLayerRuntime(referenceMs, cityTemplates, Date.now(), {
    forceRefresh: true
  });

  if (!runtime) {
    console.log("[CityAnchoringCheck] Runtime Open-Meteo indisponible.");
    return {
      ok: false,
      reason: "runtime_unavailable",
      rows: [] as AnchoringRingRow[]
    };
  }

  const cityById = new Map((runtime.dataset.cityTemperatures ?? []).map((city) => [city.id, city]));
  const rows: AnchoringRingRow[] = [];

  for (const { id, label } of TARGET_CITIES) {
    const city = cityById.get(id);
    if (!city) {
      for (const distanceKm of RING_DISTANCES) {
        rows.push({
          city: label,
          distanceKm,
          cityTempRealC: null,
          fieldBeforeC: null,
          fieldAfterC: null,
          deltaBeforeC: null,
          deltaAfterC: null,
          improvementC: null,
          nearbyRealCities: 0,
          gradientSpanC: 0,
          anchoredSourceType: null
        });
      }
      continue;
    }

    const cityTempRealC = sampleSeriesAtTime(city.hourlyTimesMs, city.hourlyTempC, referenceMs);

    for (const distanceKm of RING_DISTANCES) {
      rows.push(
        buildRow(
          city,
          label,
          distanceKm,
          cityTempRealC,
          referenceMs,
          runtime.getTemperatureBeforeAnchoring,
          runtime.getTemperature,
          runtime.getTemperatureSample,
          runtime.getTemperatureAnchoringDebug
        )
      );
    }
  }

  const validRows = rows.filter((row) => row.improvementC !== null) as Array<AnchoringRingRow & { improvementC: number }>;
  const averageImprovementC =
    validRows.length > 0
      ? Number((validRows.reduce((sum, row) => sum + row.improvementC, 0) / validRows.length).toFixed(3))
      : 0;

  const centerRows = rows.filter((row) => row.distanceKm === 0 && row.deltaAfterC !== null) as Array<AnchoringRingRow & { deltaAfterC: number }>;
  const centerZeroCount = centerRows.filter((row) => row.deltaAfterC === 0).length;

  console.log("\n[CityAnchoringCheck][Rings]");
  console.table(rows);
  console.log("Amelioration moyenne |delta| (C):", averageImprovementC);
  console.log("Centres avec deltaAfter = 0:", centerZeroCount, "/", centerRows.length);

  return {
    ok: true,
    referenceIso: new Date(referenceMs).toISOString(),
    averageImprovementC,
    centerZeroCount,
    centerCount: centerRows.length,
    rows
  };
}
