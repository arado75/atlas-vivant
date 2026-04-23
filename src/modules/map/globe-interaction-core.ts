import { clamp } from "../../lib/formatters";

export interface GlobeViewState {
  rotation: [number, number];
  zoom: number;
}

export interface DragOrigin {
  x: number;
  y: number;
  rotation: [number, number];
}

interface ComputePointerDragRotationInput {
  dragOrigin: DragOrigin;
  clientX: number;
  clientY: number;
  zoom: number;
  invertY: boolean;
  maxRotationLat: number;
}

export function createDragOrigin(clientX: number, clientY: number, rotation: [number, number]): DragOrigin {
  return {
    x: clientX,
    y: clientY,
    rotation: [rotation[0], rotation[1]]
  };
}

export function computePointerDragRotation(input: ComputePointerDragRotationInput): [number, number] {
  const { dragOrigin, clientX, clientY, zoom, invertY, maxRotationLat } = input;
  const dragScale = 0.18 / Math.max(0.9, zoom * 0.75);
  const deltaX = clientX - dragOrigin.x;
  const deltaY = clientY - dragOrigin.y;
  const verticalDelta = invertY ? -deltaY : deltaY;

  return [
    dragOrigin.rotation[0] + deltaX * dragScale,
    clamp(dragOrigin.rotation[1] + verticalDelta * dragScale, -maxRotationLat, maxRotationLat)
  ];
}

export function applyPendingDragRotation(
  current: GlobeViewState,
  pendingRotation: [number, number] | null,
  minRotationDelta: number
): GlobeViewState {
  if (!pendingRotation) {
    return current;
  }

  const delta = Math.abs(current.rotation[0] - pendingRotation[0]) + Math.abs(current.rotation[1] - pendingRotation[1]);
  if (delta < minRotationDelta) {
    return current;
  }

  return {
    ...current,
    rotation: pendingRotation
  };
}

export function accumulateWheelFactor(currentFactor: number, deltaY: number, minFactor: number, maxFactor: number): number {
  const zoomFactor = Math.exp(-deltaY * 0.0014);
  return clamp(currentFactor * zoomFactor, minFactor, maxFactor);
}

export function applyWheelZoom(current: GlobeViewState, factor: number, minZoom: number, maxZoom: number): GlobeViewState {
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.001) {
    return current;
  }

  return {
    ...current,
    zoom: clamp(current.zoom * factor, minZoom, maxZoom)
  };
}
