import type { HoveredCityTemperature } from "./temperature-overlay";

export interface FocusedTemperatureCityUpdate {
  id: string;
  label: string;
  updatedAtMs: number;
}

export function resolveNextHoveredCity(
  current: HoveredCityTemperature | null,
  payload: HoveredCityTemperature | null
): HoveredCityTemperature | null {
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
}

export interface ResolveHoverFocusUpdateResult {
  nextLastHoverCityId: string | null;
  focusedCityUpdate: FocusedTemperatureCityUpdate | null;
}

export function resolveHoverFocusUpdate(
  payload: HoveredCityTemperature | null,
  lastHoverCityId: string | null,
  updatedAtMs: number
): ResolveHoverFocusUpdateResult {
  if (payload?.kind !== "city") {
    return {
      nextLastHoverCityId: null,
      focusedCityUpdate: null
    };
  }

  if (lastHoverCityId === payload.id) {
    return {
      nextLastHoverCityId: lastHoverCityId,
      focusedCityUpdate: null
    };
  }

  return {
    nextLastHoverCityId: payload.id,
    focusedCityUpdate: {
      id: payload.id,
      label: payload.label,
      updatedAtMs
    }
  };
}

export function clearHoveredCityIfExpected(
  current: HoveredCityTemperature | null,
  expectedId: string
): HoveredCityTemperature | null {
  return current?.id === expectedId ? null : current;
}
