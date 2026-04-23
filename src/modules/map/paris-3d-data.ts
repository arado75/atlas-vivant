interface LonLatPoint {
  lon: number;
  lat: number;
}

export interface ParisCityPoint {
  x: number;
  y: number;
}

export interface ParisRoadFeature {
  id: string;
  highway: string;
  tier: number;
  widthM: number;
  points: ParisCityPoint[];
  bbox: [number, number, number, number];
}

export interface ParisBuildingFeature {
  id: string;
  footprint: ParisCityPoint[];
  heightM: number;
  areaM2: number;
  bbox: [number, number, number, number];
}

export interface ParisCityDataset {
  source: "openstreetmap-overpass" | "synthetic-fallback";
  sourceDetail: string;
  center: LonLatPoint;
  roads: ParisRoadFeature[];
  buildings: ParisBuildingFeature[];
  capturedAtIso: string;
}

const PARIS_BOUNDS = {
  south: 48.8156,
  west: 2.2241,
  north: 48.9022,
  east: 2.4699
} as const;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
] as const;

const centerLon = (PARIS_BOUNDS.west + PARIS_BOUNDS.east) / 2;
const centerLat = (PARIS_BOUNDS.south + PARIS_BOUNDS.north) / 2;
const centerLatRad = (centerLat * Math.PI) / 180;
const metersPerLon = 111320 * Math.cos(centerLatRad);
const metersPerLat = 110540;

const ROAD_STYLE: Record<string, { tier: number; widthM: number; minPointDistanceM: number }> = {
  motorway: { tier: 0, widthM: 20, minPointDistanceM: 6 },
  trunk: { tier: 0, widthM: 18, minPointDistanceM: 5 },
  primary: { tier: 1, widthM: 14, minPointDistanceM: 4.4 },
  secondary: { tier: 1, widthM: 12, minPointDistanceM: 3.8 },
  tertiary: { tier: 2, widthM: 10, minPointDistanceM: 3.2 },
  residential: { tier: 2, widthM: 8, minPointDistanceM: 2.8 },
  unclassified: { tier: 2, widthM: 8, minPointDistanceM: 2.8 },
  living_street: { tier: 3, widthM: 6, minPointDistanceM: 2.5 },
  service: { tier: 3, widthM: 5.2, minPointDistanceM: 2.4 },
  pedestrian: { tier: 3, widthM: 5, minPointDistanceM: 2.4 },
  cycleway: { tier: 4, widthM: 3.2, minPointDistanceM: 2.3 },
  footway: { tier: 4, widthM: 2.8, minPointDistanceM: 2.3 },
  path: { tier: 4, widthM: 2.8, minPointDistanceM: 2.3 },
  steps: { tier: 4, widthM: 2.4, minPointDistanceM: 2.2 }
};

const EXCLUDED_HIGHWAY = new Set(["construction", "proposed", "raceway", "bus_guideway"]);

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements?: OverpassWay[];
}

let cachedDataset: ParisCityDataset | null = null;

function lonLatToLocal(point: LonLatPoint): ParisCityPoint {
  return {
    x: (point.lon - centerLon) * metersPerLon,
    y: (point.lat - centerLat) * metersPerLat
  };
}

function pointsToBbox(points: ParisCityPoint[]): [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return [minX, minY, maxX, maxY];
}

function polygonAreaM2(points: ParisCityPoint[]): number {
  if (points.length < 4) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) * 0.5;
}

function distanceSquared(a: ParisCityPoint, b: ParisCityPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function decimatePolyline(points: ParisCityPoint[], minDistanceM: number): ParisCityPoint[] {
  if (points.length <= 2 || minDistanceM <= 0) {
    return points;
  }

  const minDistanceSquared = minDistanceM * minDistanceM;
  const reduced: ParisCityPoint[] = [points[0]];
  let lastKept = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (distanceSquared(lastKept, point) >= minDistanceSquared) {
      reduced.push(point);
      lastKept = point;
    }
  }

  const lastPoint = points[points.length - 1];
  if (distanceSquared(lastKept, lastPoint) > 0.1) {
    reduced.push(lastPoint);
  }

  return reduced.length >= 2 ? reduced : points;
}

function parseHeightMeters(tags: Record<string, string> | undefined, areaM2: number): number {
  if (tags) {
    const directHeight = extractMeters(tags.height);
    if (Number.isFinite(directHeight)) {
      return clampNumber(directHeight, 3, 240);
    }

    const roofHeight = extractMeters(tags["roof:height"]);
    if (Number.isFinite(roofHeight)) {
      return clampNumber(roofHeight + 9.2, 3, 240);
    }

    const levels = Number.parseFloat(tags["building:levels"] ?? "");
    if (Number.isFinite(levels) && levels > 0) {
      return clampNumber(levels * 3.15, 3, 240);
    }
  }

  const areaSignal = Math.sqrt(Math.max(areaM2, 16));
  return clampNumber(7 + areaSignal * 0.33, 6, 52);
}

function extractMeters(value: string | undefined): number {
  if (!value) {
    return Number.NaN;
  }

  const normalized = value.replace(",", ".").trim().toLowerCase();
  const cleaned = normalized.replace(/[^0-9.+-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureRing(points: ParisCityPoint[]): ParisCityPoint[] {
  if (points.length < 3) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (distanceSquared(first, last) <= 0.25) {
    return points;
  }

  return [...points, first];
}

function parseOverpassRoad(way: OverpassWay): ParisRoadFeature | null {
  const highway = way.tags?.highway;
  if (!highway || EXCLUDED_HIGHWAY.has(highway) || !way.geometry || way.geometry.length < 2) {
    return null;
  }

  const style = ROAD_STYLE[highway] ?? {
    tier: 4,
    widthM: 2.6,
    minPointDistanceM: 2.5
  };

  const points = decimatePolyline(
    way.geometry.map((point) => lonLatToLocal(point)),
    style.minPointDistanceM
  );
  if (points.length < 2) {
    return null;
  }

  return {
    id: `road:${way.id}`,
    highway,
    tier: style.tier,
    widthM: style.widthM,
    points,
    bbox: pointsToBbox(points)
  };
}

function parseOverpassBuilding(way: OverpassWay): ParisBuildingFeature | null {
  if (!way.tags?.building || !way.geometry || way.geometry.length < 3) {
    return null;
  }

  const footprint = ensureRing(way.geometry.map((point) => lonLatToLocal(point)));
  if (footprint.length < 4) {
    return null;
  }

  const areaM2 = polygonAreaM2(footprint);
  if (areaM2 < 20) {
    return null;
  }

  return {
    id: `building:${way.id}`,
    footprint,
    heightM: parseHeightMeters(way.tags, areaM2),
    areaM2,
    bbox: pointsToBbox(footprint)
  };
}

function buildOverpassQuery(): string {
  return `
[out:json][timeout:32];
(
  way["highway"]["area"!="yes"](${PARIS_BOUNDS.south},${PARIS_BOUNDS.west},${PARIS_BOUNDS.north},${PARIS_BOUNDS.east});
  way["building"]["area"!="yes"](${PARIS_BOUNDS.south},${PARIS_BOUNDS.west},${PARIS_BOUNDS.north},${PARIS_BOUNDS.east});
);
out tags geom;
`;
}

async function fetchOverpassDataset(signal?: AbortSignal): Promise<ParisCityDataset> {
  const body = new URLSearchParams({ data: buildOverpassQuery() }).toString();

  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const requestController = new AbortController();
    const timeoutId = setTimeout(() => {
      requestController.abort();
    }, 28000);
    const onAbort = () => requestController.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        body,
        signal: requestController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${endpoint}`);
      }

      const json = (await response.json()) as OverpassResponse;
      const elements = Array.isArray(json.elements) ? json.elements : [];
      const roads: ParisRoadFeature[] = [];
      const buildings: ParisBuildingFeature[] = [];

      for (const rawElement of elements) {
        if (rawElement.type !== "way") {
          continue;
        }

        const road = parseOverpassRoad(rawElement);
        if (road) {
          roads.push(road);
        }

        const building = parseOverpassBuilding(rawElement);
        if (building) {
          buildings.push(building);
        }
      }

      if (roads.length < 1200 || buildings.length < 2500) {
        throw new Error(
          `Dataset too small from ${endpoint} (roads=${roads.length}, buildings=${buildings.length})`
        );
      }

      return {
        source: "openstreetmap-overpass",
        sourceDetail: endpoint,
        center: { lon: centerLon, lat: centerLat },
        roads,
        buildings,
        capturedAtIso: new Date().toISOString()
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

function seededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current ^= current << 13;
    current ^= current >>> 17;
    current ^= current << 5;
    return ((current >>> 0) % 10_000) / 10_000;
  };
}

function buildSyntheticDataset(): ParisCityDataset {
  const random = seededRandom(752491);
  const roads: ParisRoadFeature[] = [];
  const buildings: ParisBuildingFeature[] = [];
  const halfWidth = ((PARIS_BOUNDS.east - PARIS_BOUNDS.west) * metersPerLon) / 2;
  const halfHeight = ((PARIS_BOUNDS.north - PARIS_BOUNDS.south) * metersPerLat) / 2;

  for (let index = -18; index <= 18; index += 1) {
    const x = (index / 18) * halfWidth;
    const y = (index / 18) * halfHeight;
    const horizontalPoints: ParisCityPoint[] = [
      { x: -halfWidth * 1.05, y },
      { x: halfWidth * 1.05, y: y + (random() - 0.5) * 70 }
    ];
    const verticalPoints: ParisCityPoint[] = [
      { x, y: -halfHeight * 1.05 },
      { x: x + (random() - 0.5) * 70, y: halfHeight * 1.05 }
    ];

    roads.push({
      id: `synthetic-h:${index}`,
      highway: "residential",
      tier: 2,
      widthM: 8,
      points: horizontalPoints,
      bbox: pointsToBbox(horizontalPoints)
    });
    roads.push({
      id: `synthetic-v:${index}`,
      highway: "residential",
      tier: 2,
      widthM: 8,
      points: verticalPoints,
      bbox: pointsToBbox(verticalPoints)
    });
  }

  for (let index = 0; index < 3800; index += 1) {
    const cx = (random() * 2 - 1) * halfWidth * 0.96;
    const cy = (random() * 2 - 1) * halfHeight * 0.96;
    const w = 9 + random() * 24;
    const h = 8 + random() * 22;
    const footprint = ensureRing([
      { x: cx - w, y: cy - h },
      { x: cx + w, y: cy - h },
      { x: cx + w, y: cy + h },
      { x: cx - w, y: cy + h }
    ]);

    buildings.push({
      id: `synthetic-building:${index}`,
      footprint,
      heightM: 10 + random() * 38,
      areaM2: polygonAreaM2(footprint),
      bbox: pointsToBbox(footprint)
    });
  }

  return {
    source: "synthetic-fallback",
    sourceDetail: "local synthetic fallback",
    center: { lon: centerLon, lat: centerLat },
    roads,
    buildings,
    capturedAtIso: new Date().toISOString()
  };
}

export function clearParisCityDatasetCache(): void {
  cachedDataset = null;
}

export async function loadParisCityDataset(options?: { signal?: AbortSignal }): Promise<ParisCityDataset> {
  if (cachedDataset) {
    return cachedDataset;
  }

  try {
    const dataset = await fetchOverpassDataset(options?.signal);
    cachedDataset = dataset;
    return dataset;
  } catch {
    const fallback = buildSyntheticDataset();
    cachedDataset = fallback;
    return fallback;
  }
}
