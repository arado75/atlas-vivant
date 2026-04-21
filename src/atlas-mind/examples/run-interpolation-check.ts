import { temperatureReferenceCities } from "../../data/temperatureReferenceCities";
import { loadTemperatureLayerRuntime } from "../../lib/temperature/temperature-data-source";

type ZoneCategory = "ocean" | "continental" | "mountain" | "between_cities";

type ZoneDefinition = {
  label: string;
  category: ZoneCategory;
  lat: number;
  lon: number;
};

type AdjacencyStats = {
  avgDeltaC: number;
  maxDeltaC: number;
};

type ZoneInterpolationRow = {
  zone: string;
  category: ZoneCategory;
  points: number;
  fallbackPoints: number;
  wideFallbackPoints: number;
  rawCenterC: number;
  stabilizedCenterC: number;
  anchoredCenterC: number;
  rawAvgAdjDeltaC: number;
  stabilizedAvgAdjDeltaC: number;
  anchoredAvgAdjDeltaC: number;
  rawMaxAdjDeltaC: number;
  stabilizedMaxAdjDeltaC: number;
  anchoredMaxAdjDeltaC: number;
  noiseReductionC: number;
};

const HOUR_MS = 60 * 60 * 1000;
const GRID_OFFSETS = [-0.8, -0.4, 0, 0.4, 0.8] as const;

const TARGET_ZONES: ZoneDefinition[] = [
  { label: "Atlantique Nord", category: "ocean", lat: 38.0, lon: -38.0 },
  { label: "Pacifique Sud", category: "ocean", lat: -24.0, lon: -132.0 },
  { label: "Europe Centrale", category: "continental", lat: 48.0, lon: 10.0 },
  { label: "Afrique du Nord", category: "continental", lat: 31.0, lon: 9.0 },
  { label: "Andes", category: "mountain", lat: -16.0, lon: -69.0 },
  { label: "Himalaya", category: "mountain", lat: 28.0, lon: 86.0 },
  { label: "Manche (Paris-Londres)", category: "between_cities", lat: 50.0, lon: 1.0 },
  { label: "Golfe de Guinee (Lagos-Accra)", category: "between_cities", lat: 4.8, lon: 1.8 }
];

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function computeAdjacencyStats(grid: number[][]): AdjacencyStats {
  const deltas: number[] = [];

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (col + 1 < grid[row].length) {
        deltas.push(Math.abs(grid[row][col] - grid[row][col + 1]));
      }
      if (row + 1 < grid.length) {
        deltas.push(Math.abs(grid[row][col] - grid[row + 1][col]));
      }
    }
  }

  if (deltas.length === 0) {
    return { avgDeltaC: 0, maxDeltaC: 0 };
  }

  const avgDeltaC = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
  const maxDeltaC = Math.max(...deltas);

  return {
    avgDeltaC,
    maxDeltaC
  };
}

function evaluateZone(
  runtime: Awaited<ReturnType<typeof loadTemperatureLayerRuntime>>,
  zone: ZoneDefinition,
  referenceMs: number
): ZoneInterpolationRow {
  if (!runtime) {
    throw new Error("Runtime indisponible");
  }

  const rawGrid: number[][] = [];
  const stabilizedGrid: number[][] = [];
  const anchoredGrid: number[][] = [];

  let fallbackPoints = 0;
  let wideFallbackPoints = 0;

  for (const latOffset of GRID_OFFSETS) {
    const rawRow: number[] = [];
    const stabilizedRow: number[] = [];
    const anchoredRow: number[] = [];

    for (const lonOffset of GRID_OFFSETS) {
      const lat = zone.lat + latOffset;
      const lon = zone.lon + lonOffset;

      const beforeSample = runtime.getTemperatureBeforeAnchoringSample(lat, lon, referenceMs);
      if (beforeSample.sourceType === "fallback") {
        fallbackPoints += 1;
      }

      const interpolationDebug = runtime.getInterpolationDebug(lat, lon, referenceMs);
      if (interpolationDebug.usedWideFallback) {
        wideFallbackPoints += 1;
      }

      rawRow.push(interpolationDebug.rawInterpolatedTempC);
      stabilizedRow.push(interpolationDebug.stabilizedTempC);
      anchoredRow.push(interpolationDebug.anchoredTempC);
    }

    rawGrid.push(rawRow);
    stabilizedGrid.push(stabilizedRow);
    anchoredGrid.push(anchoredRow);
  }

  const centerIndex = Math.floor(GRID_OFFSETS.length / 2);
  const rawCenterC = rawGrid[centerIndex][centerIndex];
  const stabilizedCenterC = stabilizedGrid[centerIndex][centerIndex];
  const anchoredCenterC = anchoredGrid[centerIndex][centerIndex];

  const rawStats = computeAdjacencyStats(rawGrid);
  const stabilizedStats = computeAdjacencyStats(stabilizedGrid);
  const anchoredStats = computeAdjacencyStats(anchoredGrid);

  return {
    zone: zone.label,
    category: zone.category,
    points: GRID_OFFSETS.length * GRID_OFFSETS.length,
    fallbackPoints,
    wideFallbackPoints,
    rawCenterC: round3(rawCenterC),
    stabilizedCenterC: round3(stabilizedCenterC),
    anchoredCenterC: round3(anchoredCenterC),
    rawAvgAdjDeltaC: round3(rawStats.avgDeltaC),
    stabilizedAvgAdjDeltaC: round3(stabilizedStats.avgDeltaC),
    anchoredAvgAdjDeltaC: round3(anchoredStats.avgDeltaC),
    rawMaxAdjDeltaC: round3(rawStats.maxDeltaC),
    stabilizedMaxAdjDeltaC: round3(stabilizedStats.maxDeltaC),
    anchoredMaxAdjDeltaC: round3(anchoredStats.maxDeltaC),
    noiseReductionC: round3(rawStats.avgDeltaC - stabilizedStats.avgDeltaC)
  };
}

export async function runInterpolationCheck() {
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
    console.log("[InterpolationCheck] Runtime Open-Meteo indisponible.");
    return {
      ok: false,
      reason: "runtime_unavailable" as const,
      rows: [] as ZoneInterpolationRow[]
    };
  }

  const rows = TARGET_ZONES.map((zone) => evaluateZone(runtime, zone, referenceMs));

  const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
  const totalFallbackPoints = rows.reduce((sum, row) => sum + row.fallbackPoints, 0);
  const totalWideFallbackPoints = rows.reduce((sum, row) => sum + row.wideFallbackPoints, 0);
  const avgNoiseReductionC =
    rows.length > 0 ? round3(rows.reduce((sum, row) => sum + row.noiseReductionC, 0) / rows.length) : 0;

  const continuityBeforeC =
    rows.length > 0 ? round3(rows.reduce((sum, row) => sum + row.rawAvgAdjDeltaC, 0) / rows.length) : 0;
  const continuityAfterC =
    rows.length > 0 ? round3(rows.reduce((sum, row) => sum + row.stabilizedAvgAdjDeltaC, 0) / rows.length) : 0;

  console.log("\n[InterpolationCheck] Continuite locale par zone (raw -> stabilized -> anchored)");
  console.table(rows);
  console.log("Points fallback detectes:", totalFallbackPoints, "/", totalPoints);
  console.log("Points avec fallback large detectes:", totalWideFallbackPoints, "/", totalPoints);
  console.log("Continuite moyenne brute (C):", continuityBeforeC);
  console.log("Continuite moyenne stabilisee (C):", continuityAfterC);
  console.log("Reduction moyenne du bruit local (C):", avgNoiseReductionC);

  return {
    ok: true,
    referenceIso: new Date(referenceMs).toISOString(),
    rows,
    totalPoints,
    totalFallbackPoints,
    totalWideFallbackPoints,
    continuityBeforeC,
    continuityAfterC,
    avgNoiseReductionC
  };
}
