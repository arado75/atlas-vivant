import { clamp } from "./formatters";

export type TemperatureViewLevel = "globe" | "regional" | "local";

export interface TemperatureViewBudget {
  maxEventZones: number;
  maxCities: number;
  maxHeatCells: number;
}

const regionalAnchorCityIds = new Set([
  "paris",
  "london",
  "new_york",
  "washington_dc",
  "mexico_city",
  "bogota",
  "sao_paulo",
  "buenos_aires",
  "cairo",
  "lagos",
  "nairobi",
  "johannesburg",
  "moscow",
  "istanbul",
  "riyadh",
  "tehran",
  "mumbai",
  "new_delhi",
  "bangkok",
  "singapore",
  "beijing",
  "tokyo",
  "sydney"
]);

export function isRegionalTemperatureAnchorCity(cityId: string): boolean {
  return regionalAnchorCityIds.has(cityId);
}

export function getTemperatureViewBudget(level: TemperatureViewLevel): TemperatureViewBudget {
  switch (level) {
    case "globe":
      return { maxEventZones: 0, maxCities: 10, maxHeatCells: 180 };
    case "regional":
      return { maxEventZones: 2, maxCities: 14, maxHeatCells: 130 };
    case "local":
      return { maxEventZones: 4, maxCities: 24, maxHeatCells: 88 };
  }
}

export function resolveTemperatureViewLevel(
  zoom: number,
  previousLevel: TemperatureViewLevel
): TemperatureViewLevel {
  const globeToRegionalEnter = 2.35;
  const globeToRegionalExit = 1.95;
  const regionalToLocalEnter = 5.8;
  const regionalToLocalExit = 4.85;

  if (previousLevel === "globe") {
    return zoom >= globeToRegionalEnter ? "regional" : "globe";
  }

  if (previousLevel === "regional") {
    if (zoom < globeToRegionalExit) {
      return "globe";
    }

    if (zoom >= regionalToLocalEnter) {
      return "local";
    }

    return "regional";
  }

  return zoom < regionalToLocalExit ? "regional" : "local";
}

export function localContextOpacityFromZoom(zoom: number): number {
  const localStart = 4.6;
  const localFull = 7.4;
  const normalized = clamp((zoom - localStart) / Math.max(localFull - localStart, 0.0001), 0, 1);
  return normalized;
}








