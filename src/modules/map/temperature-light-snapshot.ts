import type { LayerDataset, LonLat, TemperatureSourceType } from "../../types/atlas";
import type { TemperatureLayerRuntime } from "../../lib/temperature/temperature-data-source";

export const TEMPERATURE_LIGHT_SNAPSHOT_STORAGE_KEY = "atlas.temperature.lightSnapshot.v1";

export interface TemperatureLightSnapshotCity {
  id: string;
  label: string;
  position: LonLat;
  sourceType: TemperatureSourceType;
  hourlyTimesMs: number[];
  hourlyTempC: number[];
}

export interface TemperatureLightSnapshot {
  version: 1;
  capturedAtMs: number;
  cityTemperatures: TemperatureLightSnapshotCity[];
}

function isSupportedSourceType(value: unknown): value is TemperatureSourceType {
  return value === "real" || value === "interpolated" || value === "fallback";
}

export function buildTemperatureLightSnapshot(runtime: TemperatureLayerRuntime): TemperatureLightSnapshot | null {
  const cityTemperatures = (runtime.dataset.cityTemperatures ?? [])
    .filter((city) => {
      if (!Array.isArray(city.hourlyTimesMs) || !Array.isArray(city.hourlyTempC)) {
        return false;
      }

      return city.hourlyTimesMs.length > 0 && city.hourlyTimesMs.length === city.hourlyTempC.length;
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

export function persistTemperatureLightSnapshot(snapshot: TemperatureLightSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TEMPERATURE_LIGHT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures to keep runtime resilient.
  }
}

export function readTemperatureLightSnapshot(): TemperatureLightSnapshot | null {
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

        return {
          id: value.id,
          label: value.label,
          position: [value.position[0], value.position[1]],
          sourceType: isSupportedSourceType(value.sourceType) ? value.sourceType : "fallback",
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

export function buildTemperatureDatasetFromLightSnapshot(snapshot: TemperatureLightSnapshot): LayerDataset {
  return {
    heat: [],
    eventZones: [],
    cityTemperatures: snapshot.cityTemperatures
  };
}
