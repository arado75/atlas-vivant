import type { TemperatureViewLevel } from "../../lib/temperature-view";
import type { HoveredCityTemperature } from "./temperature-overlay";

interface PointerPosition {
  x: number;
  y: number;
}

type HoverSelectionReason = "direct_match" | "nearest_match" | "clear" | "none";

export interface ResolveTemperatureHoverFromPointerInput {
  clientX: number;
  clientY: number;
  svg: SVGSVGElement;
  viewBoxWidth: number;
  viewBoxHeight: number;
  candidates: HoveredCityTemperature[];
  viewLevel: TemperatureViewLevel;
  currentHoveredKind: HoveredCityTemperature["kind"] | null;
}

export interface ResolveTemperatureHoverFromPointerResult {
  reason: HoverSelectionReason;
  payload: HoveredCityTemperature | null;
}

function resolvePointerPosition(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  viewBoxWidth: number,
  viewBoxHeight: number
): PointerPosition | null {
  const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (ctm && typeof svg.createSVGPoint === "function") {
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = clientX;
    svgPoint.y = clientY;
    const localPoint = svgPoint.matrixTransform(ctm.inverse());
    if (Number.isFinite(localPoint.x) && Number.isFinite(localPoint.y)) {
      return { x: localPoint.x, y: localPoint.y };
    }
    return null;
  }

  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const cursorX = ((clientX - rect.left) * viewBoxWidth) / rect.width;
  const cursorY = ((clientY - rect.top) * viewBoxHeight) / rect.height;
  if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY)) {
    return null;
  }

  return {
    x: cursorX,
    y: cursorY
  };
}

function normalizePointedToken(label: string | null): string {
  if (!label) {
    return "";
  }

  return label.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function findDirectMatchFromToken(
  pointedToken: string,
  candidates: HoveredCityTemperature[]
): HoveredCityTemperature | null {
  if (!pointedToken) {
    return null;
  }

  return (
    candidates.find((city) => {
      const cityLabel = city.label.toLowerCase();
      return (
        cityLabel.startsWith(pointedToken) ||
        cityLabel.includes(pointedToken) ||
        pointedToken.startsWith(cityLabel)
      );
    }) ?? null
  );
}

function resolvePointedLabel(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const buttonGroups = Array.from(document.querySelectorAll<SVGGElement>("g[role='button'][aria-label]"));
  let pointedByProximity: SVGGElement | null = null;
  let pointedDistance = Number.POSITIVE_INFINITY;

  for (const group of buttonGroups) {
    const rect = group.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(centerX - clientX, centerY - clientY);
    if (distance < pointedDistance) {
      pointedDistance = distance;
      pointedByProximity = group;
    }
  }

  const pointedElement = document.elementFromPoint(clientX, clientY);
  const pointedGroup =
    (pointedByProximity && pointedDistance <= 44 ? pointedByProximity : null) ??
    pointedElement?.closest?.("g[role='button'][aria-label]") ??
    null;

  const pointedLabel = pointedGroup?.getAttribute?.("aria-label");
  return typeof pointedLabel === "string" ? pointedLabel : null;
}

function findNearestCandidate(
  position: PointerPosition,
  candidates: HoveredCityTemperature[]
): { candidate: HoveredCityTemperature; distance: number } | null {
  let nearest: HoveredCityTemperature | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - position.x, candidate.y - position.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
    }
  }

  if (!nearest) {
    return null;
  }

  return {
    candidate: nearest,
    distance: nearestDistance
  };
}

function hoverRadiusByView(viewLevel: TemperatureViewLevel): number {
  return viewLevel === "local" ? 16 : 13;
}

export function resolveTemperatureHoverFromPointer(
  input: ResolveTemperatureHoverFromPointerInput
): ResolveTemperatureHoverFromPointerResult {
  const { clientX, clientY, svg, viewBoxWidth, viewBoxHeight, candidates, viewLevel, currentHoveredKind } = input;

  if (candidates.length === 0) {
    return { reason: "none", payload: null };
  }

  const position = resolvePointerPosition(clientX, clientY, svg, viewBoxWidth, viewBoxHeight);
  if (!position) {
    return { reason: "none", payload: null };
  }

  const pointedToken = normalizePointedToken(resolvePointedLabel(clientX, clientY));
  const directMatch = findDirectMatchFromToken(pointedToken, candidates);
  if (directMatch) {
    return {
      reason: "direct_match",
      payload: directMatch
    };
  }

  const nearest = findNearestCandidate(position, candidates);
  if (nearest && nearest.distance <= hoverRadiusByView(viewLevel)) {
    return {
      reason: "nearest_match",
      payload: nearest.candidate
    };
  }

  if (currentHoveredKind === "city") {
    return {
      reason: "clear",
      payload: null
    };
  }

  return { reason: "none", payload: null };
}
