import { mockLayerData } from "../../data/mockAtlasData";
import { temperatureReferenceCities } from "../../data/temperatureReferenceCities";
import { loadTemperatureLayerRuntime } from "../../lib/temperature/temperature-data-source";
import type {
  CityTemperatureFeature,
  HeatFeature,
  TemperatureSourceType
} from "../../types/atlas";

type SourceCounts = Record<TemperatureSourceType, number>;

type SourceExample = {
  label: string;
  temperatureC: number | null;
  sourceType: TemperatureSourceType;
};

const HOUR_MS = 60 * 60 * 1000;

function createSourceCounts(): SourceCounts {
  return {
    real: 0,
    interpolated: 0,
    fallback: 0
  };
}

function incrementSource(counts: SourceCounts, sourceType: TemperatureSourceType) {
  counts[sourceType] += 1;
}

function resolveSourceType(value: TemperatureSourceType | undefined): TemperatureSourceType | null {
  return value === "real" || value === "interpolated" || value === "fallback" ? value : null;
}

function collectDatasetSourceCounts(cities: CityTemperatureFeature[], heat: HeatFeature[]) {
  const counts = createSourceCounts();
  let missing = 0;

  for (const city of cities) {
    const sourceType = resolveSourceType(city.sourceType);
    if (!sourceType) {
      missing += 1;
      continue;
    }

    incrementSource(counts, sourceType);
  }

  for (const cell of heat) {
    const sourceType = resolveSourceType(cell.sourceType);
    if (!sourceType) {
      missing += 1;
      continue;
    }

    incrementSource(counts, sourceType);
  }

  return { counts, missing };
}

export async function runSourceTypeCheck() {
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
    const fallbackCities = mockLayerData.surface_temperature.cityTemperatures ?? [];
    const fallbackHeat = mockLayerData.surface_temperature.heat ?? [];
    const fallbackDataset = collectDatasetSourceCounts(fallbackCities, fallbackHeat);

    console.log("\n[SourceTypeCheck] Runtime live indisponible (Open-Meteo + MET Norway), controle sur fallback mock.");
    console.log("Repartition sourceType (fallback dataset):", fallbackDataset.counts);
    console.log("Points sans sourceType:", fallbackDataset.missing);

    return {
      mode: "mock-fallback" as const,
      buildReady: fallbackDataset.missing === 0,
      datasetCounts: fallbackDataset.counts,
      sampledCounts: createSourceCounts(),
      missingSourceTypeCount: fallbackDataset.missing,
      examples: [] as SourceExample[]
    };
  }

  const cities = runtime.dataset.cityTemperatures ?? [];
  const heat = runtime.dataset.heat ?? [];
  const dataset = collectDatasetSourceCounts(cities, heat);

  const sampledCounts = createSourceCounts();
  const sampleTargets = [
    { label: "Paris", lat: 48.8566, lon: 2.3522 },
    { label: "Londres", lat: 51.5072, lon: -0.1276 },
    { label: "New York", lat: 40.7128, lon: -74.006 },
    { label: "Tokyo", lat: 35.6895, lon: 139.6917 },
    { label: "Atlantique Nord", lat: 42.0, lon: -30.0 },
    { label: "Pacifique Central", lat: 5.0, lon: -150.0 },
    { label: "Hemisud Ocean", lat: -34.0, lon: 35.0 }
  ];

  const examples: SourceExample[] = sampleTargets.map((target) => {
    const sample = runtime.getTemperatureSample(target.lat, target.lon, referenceMs);
    incrementSource(sampledCounts, sample.sourceType);

    return {
      label: target.label,
      temperatureC: sample.temperatureC,
      sourceType: sample.sourceType
    };
  });

  console.log(`\n[SourceTypeCheck] Runtime live actif (${runtime.source}).`);
  console.log("Repartition sourceType (dataset ville + cellules):", dataset.counts);
  console.log("Repartition sourceType (echantillons getTemperatureSample):", sampledCounts);
  console.log("Points sans sourceType:", dataset.missing);
  console.table(examples);

  return {
    mode: runtime.source,
    buildReady: dataset.missing === 0,
    datasetCounts: dataset.counts,
    sampledCounts,
    missingSourceTypeCount: dataset.missing,
    examples
  };
}


