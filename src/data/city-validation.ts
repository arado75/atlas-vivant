import type { CityTemperatureFeature } from "../types/atlas";

export type City = CityTemperatureFeature;

export interface InvalidCoordinateIssue {
  id: string;
  label: string;
  position: [number, number];
}

export interface DuplicatePairIssue {
  keptId: string;
  removedId: string;
  distanceKm: number;
  reason: "id" | "label" | "near";
}

export interface NearDuplicateIssue {
  firstId: string;
  secondId: string;
  distanceKm: number;
}

export interface ValidationReport {
  totalCities: number;
  finalCityCount: number;
  invalidCoordinateCount: number;
  invalidCoordinates: InvalidCoordinateIssue[];
  duplicateCount: number;
  duplicates: DuplicatePairIssue[];
  nearDuplicateCount: number;
  nearDuplicates: NearDuplicateIssue[];
  missingRequiredCount: number;
  missingRequiredCities: string[];
  correctedCoordinatesCount: number;
  removedDuplicatesCount: number;
  addedCitiesCount: number;
  addedCities: string[];
}

export interface NormalizeCitiesResult {
  cities: City[];
  report: ValidationReport;
}

type MutableReport = {
  invalidCoordinates: InvalidCoordinateIssue[];
  duplicates: DuplicatePairIssue[];
  correctedCoordinatesCount: number;
  removedDuplicatesCount: number;
  addedCities: string[];
  missingRequiredCities: string[];
};

const DUPLICATE_DISTANCE_THRESHOLD_KM = 5;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const [lonA, latA] = a;
  const [lonB, latB] = b;

  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const root =
    sinDLat * sinDLat +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * sinDLon * sinDLon;

  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(root)));
}

function isValidCoordinate(position: [number, number]): boolean {
  const [lon, lat] = position;
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function fixCoordinateIfObvious(
  city: City
): { city: City; corrected: boolean; valid: boolean } {
  const [lon, lat] = city.position;

  if (isValidCoordinate(city.position)) {
    return { city, corrected: false, valid: true };
  }

  const canSwap = Math.abs(lat) <= 180 && Math.abs(lon) <= 90;
  if (canSwap) {
    const swapped: [number, number] = [lat, lon];
    if (isValidCoordinate(swapped)) {
      return {
        city: {
          ...city,
          position: swapped
        },
        corrected: true,
        valid: true
      };
    }
  }

  return { city, corrected: false, valid: false };
}

function importanceRank(value: City["importance"]): number {
  if (value === "high") {
    return 3;
  }

  if (value === "medium") {
    return 2;
  }

  if (value === "low") {
    return 1;
  }

  return 0;
}

function pickPreferredCity(left: City, right: City): City {
  const leftRank = importanceRank(left.importance);
  const rightRank = importanceRank(right.importance);

  if (leftRank !== rightRank) {
    return leftRank > rightRank ? left : right;
  }

  const leftHasSeries = Boolean(left.hourlyTempC?.length);
  const rightHasSeries = Boolean(right.hourlyTempC?.length);
  if (leftHasSeries !== rightHasSeries) {
    return leftHasSeries ? left : right;
  }

  return left;
}

function dedupeAndNormalize(
  cities: City[],
  mutableReport: MutableReport
): City[] {
  const byId = new Map<string, City>();
  const byLabel = new Map<string, City>();

  for (const rawCity of cities) {
    const fixed = fixCoordinateIfObvious(rawCity);
    if (fixed.corrected) {
      mutableReport.correctedCoordinatesCount += 1;
    }

    if (!fixed.valid) {
      mutableReport.invalidCoordinates.push({
        id: rawCity.id,
        label: rawCity.label,
        position: rawCity.position
      });
      continue;
    }

    const city = fixed.city;
    const idKey = normalizeText(city.id);
    const labelKey = normalizeText(city.label);

    const byIdCurrent = byId.get(idKey);
    if (byIdCurrent) {
      const kept = pickPreferredCity(byIdCurrent, city);
      const removed = kept === byIdCurrent ? city : byIdCurrent;

      byId.set(idKey, kept);
      if (normalizeText(kept.label) !== labelKey) {
        byLabel.set(normalizeText(kept.label), kept);
      }

      mutableReport.duplicates.push({
        keptId: kept.id,
        removedId: removed.id,
        distanceKm: haversineKm(kept.position, removed.position),
        reason: "id"
      });
      mutableReport.removedDuplicatesCount += 1;
      continue;
    }

    const byLabelCurrent = byLabel.get(labelKey);
    if (byLabelCurrent) {
      const kept = pickPreferredCity(byLabelCurrent, city);
      const removed = kept === byLabelCurrent ? city : byLabelCurrent;

      byId.delete(normalizeText(removed.id));
      byId.set(normalizeText(kept.id), kept);
      byLabel.set(labelKey, kept);

      mutableReport.duplicates.push({
        keptId: kept.id,
        removedId: removed.id,
        distanceKm: haversineKm(kept.position, removed.position),
        reason: "label"
      });
      mutableReport.removedDuplicatesCount += 1;
      continue;
    }

    byId.set(idKey, city);
    byLabel.set(labelKey, city);
  }

  const deduped: City[] = [];

  for (const city of byId.values()) {
    const close = deduped.find(
      (existing) => haversineKm(existing.position, city.position) < DUPLICATE_DISTANCE_THRESHOLD_KM
    );

    if (!close) {
      deduped.push(city);
      continue;
    }

    const kept = pickPreferredCity(close, city);
    const removed = kept === close ? city : close;

    if (kept !== close) {
      const index = deduped.findIndex((existing) => existing.id === close.id);
      if (index >= 0) {
        deduped[index] = kept;
      }
    }

    mutableReport.duplicates.push({
      keptId: kept.id,
      removedId: removed.id,
      distanceKm: haversineKm(kept.position, removed.position),
      reason: "near"
    });
    mutableReport.removedDuplicatesCount += 1;
  }

  return deduped;
}

function detectNearDuplicates(cities: City[]): NearDuplicateIssue[] {
  const nearDuplicates: NearDuplicateIssue[] = [];

  for (let index = 0; index < cities.length; index += 1) {
    const first = cities[index];
    for (let compareIndex = index + 1; compareIndex < cities.length; compareIndex += 1) {
      const second = cities[compareIndex];
      const distanceKm = haversineKm(first.position, second.position);
      if (distanceKm < DUPLICATE_DISTANCE_THRESHOLD_KM) {
        nearDuplicates.push({
          firstId: first.id,
          secondId: second.id,
          distanceKm: Number(distanceKm.toFixed(3))
        });
      }
    }
  }

  return nearDuplicates;
}

function buildReport(
  totalCities: number,
  finalCities: City[],
  mutableReport: MutableReport
): ValidationReport {
  const nearDuplicates = detectNearDuplicates(finalCities);

  return {
    totalCities,
    finalCityCount: finalCities.length,
    invalidCoordinateCount: mutableReport.invalidCoordinates.length,
    invalidCoordinates: mutableReport.invalidCoordinates,
    duplicateCount: mutableReport.duplicates.length,
    duplicates: mutableReport.duplicates,
    nearDuplicateCount: nearDuplicates.length,
    nearDuplicates,
    missingRequiredCount: mutableReport.missingRequiredCities.length,
    missingRequiredCities: mutableReport.missingRequiredCities,
    correctedCoordinatesCount: mutableReport.correctedCoordinatesCount,
    removedDuplicatesCount: mutableReport.removedDuplicatesCount,
    addedCitiesCount: mutableReport.addedCities.length,
    addedCities: mutableReport.addedCities
  };
}

export function validateCities(cities: City[]): ValidationReport {
  const mutableReport: MutableReport = {
    invalidCoordinates: [],
    duplicates: [],
    correctedCoordinatesCount: 0,
    removedDuplicatesCount: 0,
    addedCities: [],
    missingRequiredCities: []
  };

  const normalized = dedupeAndNormalize(cities, mutableReport);
  return buildReport(cities.length, normalized, mutableReport);
}

export function normalizeCities(
  cities: City[],
  requiredCities: City[] = []
): NormalizeCitiesResult {
  const mutableReport: MutableReport = {
    invalidCoordinates: [],
    duplicates: [],
    correctedCoordinatesCount: 0,
    removedDuplicatesCount: 0,
    addedCities: [],
    missingRequiredCities: []
  };

  const normalized = dedupeAndNormalize(cities, mutableReport);
  const ids = new Set(normalized.map((city) => normalizeText(city.id)));
  const next = [...normalized];

  for (const requiredCity of requiredCities) {
    if (ids.has(normalizeText(requiredCity.id))) {
      continue;
    }

    mutableReport.missingRequiredCities.push(requiredCity.id);
    next.push(requiredCity);
    ids.add(normalizeText(requiredCity.id));
    mutableReport.addedCities.push(requiredCity.id);
  }

  const finalDeduped = dedupeAndNormalize(next, mutableReport);
  const report = buildReport(cities.length, finalDeduped, mutableReport);

  return {
    cities: finalDeduped,
    report
  };
}
