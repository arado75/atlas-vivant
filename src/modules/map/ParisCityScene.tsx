import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type WheelEventHandler
} from "react";
import { loadParisCityDataset, type ParisCityDataset, type ParisRoadFeature } from "./paris-3d-data";

interface CameraState {
  centerX: number;
  centerY: number;
  zoom: number;
  yawRad: number;
  pitchRad: number;
}

interface ProjectionPoint {
  x: number;
  y: number;
  depth: number;
}

interface RenderStats {
  roads: number;
  buildings: number;
  frameMs: number;
  fps: number;
}

type RenderQualityMode = "auto" | "quality" | "eco";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 1.85;
const MIN_PITCH = 0.45;
const MAX_PITCH = 1.24;
const MIN_YAW = -Math.PI;
const MAX_YAW = Math.PI;
const INITIAL_CAMERA: CameraState = {
  centerX: 0,
  centerY: 0,
  zoom: 0.096,
  yawRad: -0.56,
  pitchRad: 0.93
};

const TIER_COLOR: Record<number, string> = {
  0: "rgba(255, 230, 171, 0.84)",
  1: "rgba(245, 211, 150, 0.8)",
  2: "rgba(176, 205, 233, 0.68)",
  3: "rgba(129, 168, 206, 0.56)",
  4: "rgba(86, 132, 178, 0.5)"
};

const TIER_HALO: Record<number, string> = {
  0: "rgba(28, 39, 56, 0.92)",
  1: "rgba(25, 37, 54, 0.88)",
  2: "rgba(19, 32, 48, 0.82)",
  3: "rgba(16, 27, 42, 0.76)",
  4: "rgba(11, 21, 34, 0.72)"
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  if (angle < MIN_YAW) {
    return angle + Math.PI * 2;
  }
  if (angle > MAX_YAW) {
    return angle - Math.PI * 2;
  }
  return angle;
}

function intersectsBbox(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function projectPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  camera: CameraState,
  width: number,
  height: number
): ProjectionPoint {
  const dx = worldX - camera.centerX;
  const dy = worldY - camera.centerY;
  const cosYaw = Math.cos(camera.yawRad);
  const sinYaw = Math.sin(camera.yawRad);
  const cosPitch = Math.cos(camera.pitchRad);
  const sinPitch = Math.sin(camera.pitchRad);

  const rotatedX = dx * cosYaw - dy * sinYaw;
  const rotatedY = dx * sinYaw + dy * cosYaw;
  const pitchedY = rotatedY * cosPitch - worldZ * sinPitch;
  const depth = rotatedY * sinPitch + worldZ * cosPitch;

  const perspective = 1 / (1 + depth * 0.0008);
  const scale = camera.zoom * perspective;
  return {
    x: width / 2 + rotatedX * scale,
    y: height * 0.62 - pitchedY * scale,
    depth
  };
}

function shouldRenderRoad(road: ParisRoadFeature, zoom: number, quality: RenderQualityMode): boolean {
  if (quality === "quality") {
    return true;
  }
  if (quality === "eco") {
    return road.tier <= (zoom < 0.1 ? 1 : zoom < 0.18 ? 2 : 3);
  }
  return road.tier <= (zoom < 0.08 ? 1 : zoom < 0.15 ? 2 : 4);
}

function minBuildingArea(zoom: number, quality: RenderQualityMode): number {
  if (quality === "quality") {
    return zoom < 0.09 ? 360 : zoom < 0.14 ? 160 : 70;
  }
  if (quality === "eco") {
    return zoom < 0.1 ? 1000 : zoom < 0.16 ? 420 : 180;
  }
  return zoom < 0.09 ? 600 : zoom < 0.15 ? 250 : 110;
}

function resolveAutoQuality(zoom: number, isDragging: boolean): RenderQualityMode {
  if (isDragging || zoom < 0.082) {
    return "eco";
  }
  return "quality";
}

export function ParisCityScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dataset, setDataset] = useState<ParisCityDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qualityMode, setQualityMode] = useState<RenderQualityMode>("auto");
  const [isDragging, setIsDragging] = useState(false);
  const [camera, setCamera] = useState<CameraState>(INITIAL_CAMERA);
  const [viewport, setViewport] = useState({ width: 1024, height: 820 });
  const [stats, setStats] = useState<RenderStats>({
    roads: 0,
    buildings: 0,
    frameMs: 0,
    fps: 0
  });
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const statsTickRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    loadParisCityDataset({ signal: controller.signal })
      .then((nextDataset) => {
        setDataset(nextDataset);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Chargement Paris 3D indisponible");
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const width = Math.max(420, Math.floor(entry.contentRect.width));
      const height = Math.max(560, Math.floor(entry.contentRect.height));
      setViewport((current) => (current.width === width && current.height === height ? current : { width, height }));
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const activeQuality = useMemo(
    () => (qualityMode === "auto" ? resolveAutoQuality(camera.zoom, isDragging) : qualityMode),
    [camera.zoom, isDragging, qualityMode]
  );

  const renderFrame = useCallback(() => {
    if (!dataset || !canvasRef.current) {
      return;
    }

    const frameStart = performance.now();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bufferWidth = Math.max(2, Math.floor(viewport.width * dpr));
    const bufferHeight = Math.max(2, Math.floor(viewport.height * dpr));
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { width, height } = viewport;
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "rgba(8, 22, 38, 0.95)");
    bg.addColorStop(1, "rgba(4, 12, 24, 0.98)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const viewHalfWidthMeters = width / (camera.zoom * 2.2);
    const viewHalfHeightMeters = height / (camera.zoom * 2.1);
    const visibleBbox: [number, number, number, number] = [
      camera.centerX - viewHalfWidthMeters,
      camera.centerY - viewHalfHeightMeters,
      camera.centerX + viewHalfWidthMeters,
      camera.centerY + viewHalfHeightMeters
    ];

    let roadsRendered = 0;
    let buildingsRendered = 0;

    for (const road of dataset.roads) {
      if (!shouldRenderRoad(road, camera.zoom, activeQuality) || !intersectsBbox(road.bbox, visibleBbox)) {
        continue;
      }

      const first = projectPoint(road.points[0].x, road.points[0].y, 0, camera, width, height);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let index = 1; index < road.points.length; index += 1) {
        const point = road.points[index];
        const projected = projectPoint(point.x, point.y, 0, camera, width, height);
        ctx.lineTo(projected.x, projected.y);
      }

      const lineWidth = clamp(road.widthM * camera.zoom * 0.32, 0.3, 5.4);
      ctx.strokeStyle = TIER_HALO[road.tier] ?? TIER_HALO[4];
      ctx.lineWidth = lineWidth + 1;
      ctx.stroke();
      ctx.strokeStyle = TIER_COLOR[road.tier] ?? TIER_COLOR[4];
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      roadsRendered += 1;
    }

    const minimumArea = minBuildingArea(camera.zoom, activeQuality);
    const visibleBuildings = dataset.buildings
      .filter((building) => building.areaM2 >= minimumArea && intersectsBbox(building.bbox, visibleBbox))
      .map((building) => {
        const baseProbe = projectPoint(
          building.footprint[0].x,
          building.footprint[0].y,
          0,
          camera,
          width,
          height
        );
        return { building, depth: baseProbe.depth };
      })
      .sort((left, right) => left.depth - right.depth);

    for (const entry of visibleBuildings) {
      const building = entry.building;
      const footprint = building.footprint;
      const base: ProjectionPoint[] = [];
      const roof: ProjectionPoint[] = [];
      for (const point of footprint) {
        base.push(projectPoint(point.x, point.y, 0, camera, width, height));
        roof.push(projectPoint(point.x, point.y, building.heightM, camera, width, height));
      }

      for (let index = 0; index < footprint.length - 1; index += 1) {
        const b0 = base[index];
        const b1 = base[index + 1];
        const r0 = roof[index];
        const r1 = roof[index + 1];
        const edgeShade = clamp(0.24 + (r0.depth - r1.depth) * 0.0005, 0.14, 0.48);

        ctx.beginPath();
        ctx.moveTo(b0.x, b0.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.lineTo(r0.x, r0.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(65, 106, 152, ${edgeShade})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(roof[0].x, roof[0].y);
      for (let index = 1; index < roof.length; index += 1) {
        ctx.lineTo(roof[index].x, roof[index].y);
      }
      ctx.closePath();
      const roofAlpha = clamp(0.46 + building.heightM * 0.004, 0.34, 0.76);
      ctx.fillStyle = `rgba(121, 173, 228, ${roofAlpha})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(214, 235, 255, 0.18)";
      ctx.lineWidth = 0.7;
      ctx.stroke();

      buildingsRendered += 1;
    }

    const frameMs = performance.now() - frameStart;
    statsTickRef.current += 1;
    if (statsTickRef.current % 5 === 0) {
      setStats({
        roads: roadsRendered,
        buildings: buildingsRendered,
        frameMs,
        fps: frameMs > 0.1 ? 1000 / frameMs : 0
      });
    }
  }, [activeQuality, camera, dataset, viewport]);

  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  const onPointerDown: PointerEventHandler<HTMLCanvasElement> = useCallback((event) => {
    if (!event.isPrimary) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    setIsDragging(true);
  }, []);

  const onPointerMove: PointerEventHandler<HTMLCanvasElement> = useCallback((event) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;
    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };

    setCamera((current) => {
      const worldPerPx = 1 / current.zoom;
      const cosYaw = Math.cos(current.yawRad);
      const sinYaw = Math.sin(current.yawRad);

      const moveX = -(deltaX * cosYaw + deltaY * sinYaw) * worldPerPx;
      const moveY = -(-deltaX * sinYaw + deltaY * cosYaw) * worldPerPx;
      return {
        ...current,
        centerX: current.centerX + moveX,
        centerY: current.centerY + moveY
      };
    });
  }, []);

  const clearDragging = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && dragStateRef.current?.pointerId !== pointerId) {
      return;
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const onPointerUp: PointerEventHandler<HTMLCanvasElement> = useCallback((event) => {
    clearDragging(event.pointerId);
  }, [clearDragging]);

  const onPointerCancel: PointerEventHandler<HTMLCanvasElement> = useCallback((event) => {
    clearDragging(event.pointerId);
  }, [clearDragging]);

  const onWheel: WheelEventHandler<HTMLCanvasElement> = useCallback((event) => {
    event.preventDefault();
    const wheel = event.deltaY;

    setCamera((current) => {
      if (event.shiftKey) {
        return {
          ...current,
          pitchRad: clamp(current.pitchRad - wheel * 0.0011, MIN_PITCH, MAX_PITCH)
        };
      }

      if (event.altKey) {
        return {
          ...current,
          yawRad: normalizeAngle(current.yawRad - wheel * 0.0016)
        };
      }

      const zoomFactor = Math.exp(-wheel * 0.00125);
      return {
        ...current,
        zoom: clamp(current.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM)
      };
    });
  }, []);

  const onKeyDown: KeyboardEventHandler<HTMLCanvasElement> = useCallback((event) => {
    const panStep = 170 / camera.zoom;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCamera((current) => ({ ...current, centerY: current.centerY + panStep }));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCamera((current) => ({ ...current, centerY: current.centerY - panStep }));
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCamera((current) => ({ ...current, centerX: current.centerX - panStep }));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCamera((current) => ({ ...current, centerX: current.centerX + panStep }));
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCamera((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, MIN_ZOOM, MAX_ZOOM) }));
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setCamera((current) => ({ ...current, zoom: clamp(current.zoom / 1.12, MIN_ZOOM, MAX_ZOOM) }));
      return;
    }
    if (event.key.toLowerCase() === "q") {
      event.preventDefault();
      setCamera((current) => ({ ...current, yawRad: normalizeAngle(current.yawRad - 0.08) }));
      return;
    }
    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      setCamera((current) => ({ ...current, yawRad: normalizeAngle(current.yawRad + 0.08) }));
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      setCamera(INITIAL_CAMERA);
    }
  }, [camera.zoom]);

  return (
    <section id="atlas-paris-3d-panel" className="globe-panel city3d-panel">
      <div className="city3d-header">
        <div>
          <span className="kicker">Vue locale immersive</span>
          <h2>Paris 3D</h2>
          <p>Rues et batiments depuis OpenStreetMap, rendus en 2.5D temps reel.</p>
        </div>
        <div className="city3d-metrics">
          <span>{dataset?.source === "openstreetmap-overpass" ? "Source live OSM" : "Fallback local"}</span>
          <span>{dataset ? `${dataset.roads.length.toLocaleString("fr-FR")} rues` : "-- rues"}</span>
          <span>{dataset ? `${dataset.buildings.length.toLocaleString("fr-FR")} batiments` : "-- batiments"}</span>
        </div>
      </div>

      <div className="city3d-toolbar">
        <div className="segmented-control">
          <button
            type="button"
            className={qualityMode === "auto" ? "is-active" : ""}
            onClick={() => setQualityMode("auto")}
          >
            Auto
          </button>
          <button
            type="button"
            className={qualityMode === "quality" ? "is-active" : ""}
            onClick={() => setQualityMode("quality")}
          >
            Qualite
          </button>
          <button
            type="button"
            className={qualityMode === "eco" ? "is-active" : ""}
            onClick={() => setQualityMode("eco")}
          >
            Eco
          </button>
        </div>

        <button type="button" className="secondary-button" onClick={() => setCamera(INITIAL_CAMERA)}>
          Recentrer Paris
        </button>
      </div>

      <div ref={containerRef} className="city3d-canvas-shell">
        <canvas
          ref={canvasRef}
          className="city3d-canvas"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        />

        <div className="city3d-overlay city3d-overlay-left">
          <strong>Commandes</strong>
          <small>Drag: deplacer | Molette: zoom | Shift+Molette: inclinaison | Alt+Molette: rotation</small>
          <small>Clavier: fleches, +/-, Q/E, R</small>
        </div>

        <div className="city3d-overlay city3d-overlay-right">
          <small>Qualite active: {activeQuality}</small>
          <small>Frames: {stats.frameMs.toFixed(1)} ms (~{stats.fps.toFixed(0)} fps)</small>
          <small>Affiche: {stats.roads.toLocaleString("fr-FR")} rues / {stats.buildings.toLocaleString("fr-FR")} batiments</small>
          <small>Zoom: {camera.zoom.toFixed(3)} | Pitch: {(camera.pitchRad * (180 / Math.PI)).toFixed(0)}°</small>
        </div>
      </div>

      {isLoading ? (
        <div className="city3d-footnote">Chargement des donnees OSM Paris...</div>
      ) : null}
      {loadError ? (
        <div className="city3d-footnote city3d-footnote-warning">{loadError}</div>
      ) : null}
      {dataset?.source === "synthetic-fallback" ? (
        <div className="city3d-footnote city3d-footnote-warning">
          Source OSM live indisponible. Un fallback local est affiche pour garder une vue fluide.
        </div>
      ) : null}
      {dataset?.source === "openstreetmap-overpass" ? (
        <div className="city3d-footnote">
          Endpoint: {dataset.sourceDetail} | Capture: {new Date(dataset.capturedAtIso).toLocaleString("fr-FR")}
        </div>
      ) : null}
    </section>
  );
}
