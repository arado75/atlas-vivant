import type { geoOrthographic } from "d3-geo";
import { clamp } from "../../lib/formatters";
import { isPerfFlagEnabled, perfInc, perfNow, perfObserveDuration } from "../../lib/perf-debug";
import { type TemperatureViewLevel } from "../../lib/temperature-view";
import {
  formatTemperature,
  intensityToTemperatureC,
  temperatureToColor,
  temperatureTrendGlyph,
  temperatureTrendSize
} from "../../lib/temperature-scale";
import type {
  CityTemperatureFeature,
  EventZoneFeature,
  HeatFeature,
  LonLat,
  SceneProfileLite,
  TimeWindowState,
  TemperatureSourceType
} from "../../types/atlas";

type VisualRegime = "short" | "medium" | "long";

type TemperatureSampler = (lat: number, lon: number, timeMs: number) => number;
type TemperatureDisplaySourceType = TemperatureSourceType | "inferred" | "mock";
type TemperatureMeshRefinementMode = "off" | "france_paris";

interface TemperatureMeshBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface TemperatureMeshPass {
  key: string;
  bounds: TemperatureMeshBounds;
  step: number;
  maxCells: number;
  opacityScale: number;
}

export interface TemperatureMeshOptions {
  cameraCenter?: LonLat;
  zoom?: number;
  refinementMode?: TemperatureMeshRefinementMode;
}

export interface HoveredCityTemperature {
  id: string;
  label: string;
  x: number;
  y: number;
  temperatureC: number;
  deltaC: number;
  color: string;
  kind: "city" | "heat" | "zone";
  sourceType?: TemperatureDisplaySourceType;
  eventTimestampMs?: number;
}

function sourceTypeLabel(sourceType: TemperatureDisplaySourceType | undefined): string {
  switch (sourceType) {
    case "real":
      return "Source: reelle";
    case "interpolated":
      return "Source: interpolee";
    case "fallback":
      return "Source: fallback";
    case "inferred":
      return "Source: inferee";
    case "mock":
      return "Source: mock";
    default:
      return "Source: inconnue";
  }
}

function sampleSeries(values: number[], index: number): number {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  const wrapped = ((index % values.length) + values.length) % values.length;
  const left = Math.floor(wrapped);
  const right = (left + 1) % values.length;
  const amount = wrapped - left;
  return values[left] + (values[right] - values[left]) * amount;
}

function cycleIndexFromTimeMs(timeMs: number): number {
  const date = new Date(timeMs);
  const month = date.getUTCMonth();
  const day = date.getUTCDate() - 1;
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return month + day / Math.max(1, daysInMonth);
}

function sampleSeriesAtTime(values: number[], timesMs: number[] | undefined, cursor: number): number {
  if (timesMs && timesMs.length === values.length && values.length > 0) {
    if (cursor <= timesMs[0]) {
      return values[0];
    }

    const lastIndex = timesMs.length - 1;
    if (cursor >= timesMs[lastIndex]) {
      return values[lastIndex];
    }

    for (let index = 0; index < lastIndex; index += 1) {
      const leftTime = timesMs[index];
      const rightTime = timesMs[index + 1];
      if (cursor >= leftTime && cursor <= rightTime) {
        const ratio = clamp((cursor - leftTime) / Math.max(1, rightTime - leftTime), 0, 1);
        return values[index] + (values[index + 1] - values[index]) * ratio;
      }
    }
  }

  const fallbackIndex = Math.abs(cursor) > 5000 ? cycleIndexFromTimeMs(cursor) : cursor;
  return sampleSeries(values, fallbackIndex);
}

function heatIntensityAt(heat: HeatFeature, timeCursor: number): number {
  const baseIntensity = sampleSeriesAtTime(heat.intensity, heat.intensityTimesMs, timeCursor);
  return clamp(baseIntensity, 0.12, 1.2);
}

function heatBaseIntensityAt(heat: HeatFeature, timeCursor: number): number {
  return clamp(sampleSeriesAtTime(heat.intensity, heat.intensityTimesMs, timeCursor), 0.12, 1.2);
}

function fieldTemperatureFromHeat(
  point: LonLat,
  heatFeatures: HeatFeature[],
  timeIndex: number,
  useAnimatedIntensity: boolean,
  sampleTemperature?: TemperatureSampler
): number {
  if (sampleTemperature) {
    return sampleTemperature(point[1], point[0], timeIndex);
  }

  if (heatFeatures.length === 0) {
    return 18;
  }

  let weightedTemp = 0;
  let weightSum = 0;

  for (const heat of heatFeatures) {
    const intensity = useAnimatedIntensity ? heatIntensityAt(heat, timeIndex) : heatBaseIntensityAt(heat, timeIndex);
    const temperature = intensityToTemperatureC(intensity);
    const distance = distanceInDegrees(point[0], point[1], heat.center[0], heat.center[1]);
    const sigma = Math.max(6, heat.radius * 1.35);
    const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));

    weightedTemp += temperature * weight;
    weightSum += weight;
  }

  return weightSum > 0.0001 ? weightedTemp / weightSum : 18;
}

function distanceInDegrees(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const normalizedLonDelta = ((((aLon - bLon) % 360) + 540) % 360) - 180;
  const latRadians = ((aLat + bLat) * 0.5 * Math.PI) / 180;
  const deltaLon = normalizedLonDelta * Math.cos(latRadians);
  const deltaLat = aLat - bLat;
  return Math.hypot(deltaLon, deltaLat);
}

function localTemperatureFromHeat(
  city: CityTemperatureFeature,
  heatFeatures: HeatFeature[],
  timeCursor: number,
  sampleTemperature?: TemperatureSampler
): { temperatureC: number; deltaC: number; color: string } {
  const trendCursorDelta = Math.abs(timeCursor) > 5000 ? 6 * 60 * 60 * 1000 : 1.2;
  const hasCitySeries =
    Array.isArray(city.hourlyTimesMs) &&
    Array.isArray(city.hourlyTempC) &&
    city.hourlyTimesMs.length > 0 &&
    city.hourlyTimesMs.length === city.hourlyTempC.length;

  const current = hasCitySeries
    ? sampleSeriesAtTime(city.hourlyTempC!, city.hourlyTimesMs, timeCursor)
    : fieldTemperatureFromHeat(city.position, heatFeatures, timeCursor, true, sampleTemperature);

  const previous = hasCitySeries
    ? sampleSeriesAtTime(city.hourlyTempC!, city.hourlyTimesMs, timeCursor - trendCursorDelta)
    : fieldTemperatureFromHeat(city.position, heatFeatures, timeCursor - trendCursorDelta, false, sampleTemperature);

  const deltaRaw = current - previous;
  const deltaC = clamp(deltaRaw, -4.5, 4.5);

  return {
    temperatureC: current,
    deltaC,
    color: temperatureToColor(current)
  };
}

function meshStepByView(viewLevel: TemperatureViewLevel): number {
  switch (viewLevel) {
    case "globe":
      return 12;
    case "regional":
      return 8;
    case "local":
      return 6;
  }
}

function meshMaxCellsByView(viewLevel: TemperatureViewLevel): number {
  switch (viewLevel) {
    case "globe":
      return 220;
    case "regional":
      return 420;
    case "local":
      return 620;
  }
}

function meshOpacityByView(viewLevel: TemperatureViewLevel): number {
  switch (viewLevel) {
    case "globe":
      return 0.34;
    case "regional":
      return 0.4;
    case "local":
      return 0.46;
  }
}

function meshFilterByView(viewLevel: TemperatureViewLevel): string {
  switch (viewLevel) {
    case "globe":
      return "none";
    case "regional":
      return "none";
    case "local":
      return "none";
  }
}

export function renderTemperatureFieldMesh(
  projection: ReturnType<typeof geoOrthographic>,
  timeIndex: number,
  viewLevel: TemperatureViewLevel,
  sampleTemperature: TemperatureSampler | undefined,
  heatFeatures: HeatFeature[],
  isFrontFacing: (point: LonLat) => boolean,
  _onHover: (payload: HoveredCityTemperature) => void,
  _onLeave: (hoverId: string) => void,
  isInteractionActive = false,
  meshOptions?: TemperatureMeshOptions
) {
  const perfStartMs = perfNow();
  perfInc("mesh_calls", 1);

  if (isPerfFlagEnabled("disableMesh")) {
    perfObserveDuration("mesh_render_ms", perfNow() - perfStartMs);
    return null;
  }

  if (!sampleTemperature && heatFeatures.length === 0) {
    perfObserveDuration("mesh_render_ms", perfNow() - perfStartMs);
    return null;
  }

  const interactionStepMultiplier = isInteractionActive ? 3.2 : 1;
  const step = meshStepByView(viewLevel) * interactionStepMultiplier;
  const maxCells = meshMaxCellsByView(viewLevel);
  const baseOpacity = meshOpacityByView(viewLevel);
  const filter = isInteractionActive || isPerfFlagEnabled("disableMeshBlur") ? "none" : meshFilterByView(viewLevel);
  const strokeOpacity = 0;
  const cells: JSX.Element[] = [];
  const includePerfAria =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perfDebug");
  let projectionCalls = 0;

  const sampleFieldTemperature = (
    lat: number,
    lon: number,
    cursor: number,
    useAnimatedIntensity: boolean
  ): number =>
    sampleTemperature
      ? sampleTemperature(lat, lon, cursor)
      : fieldTemperatureFromHeat([lon, lat], heatFeatures, cursor, useAnimatedIntensity);

  const blendedCellTemperature = (lat: number, lon: number, cursor: number, useAnimatedIntensity: boolean, sampleStep: number): number => {
    const halfSampleStep = sampleStep / 2;
    const center = sampleFieldTemperature(lat, lon, cursor, useAnimatedIntensity);
    const corners = [
      sampleFieldTemperature(lat + halfSampleStep, lon - halfSampleStep, cursor, useAnimatedIntensity),
      sampleFieldTemperature(lat + halfSampleStep, lon + halfSampleStep, cursor, useAnimatedIntensity),
      sampleFieldTemperature(lat - halfSampleStep, lon + halfSampleStep, cursor, useAnimatedIntensity),
      sampleFieldTemperature(lat - halfSampleStep, lon - halfSampleStep, cursor, useAnimatedIntensity)
    ];

    const cornerAverage = corners.reduce((sum, value) => sum + value, 0) / corners.length;
    const localSpread = Math.max(center, ...corners) - Math.min(center, ...corners);
    // Preserve real fronts: strong local gradients get less blend.
    const blendWeight = localSpread >= 8 ? 0.08 : localSpread >= 5 ? 0.16 : localSpread >= 3 ? 0.24 : 0.34;

    return center * (1 - blendWeight) + cornerAverage * blendWeight;
  };

  const meshPasses: TemperatureMeshPass[] = [
    {
      key: "global",
      bounds: { minLon: -180, maxLon: 180, minLat: -77, maxLat: 77 },
      step,
      maxCells,
      opacityScale: 1
    }
  ];

  const refinementMode = meshOptions?.refinementMode ?? "off";
  const center = meshOptions?.cameraCenter;
  const zoom = meshOptions?.zoom ?? 1;
  const canRefine =
    !isInteractionActive &&
    refinementMode === "france_paris" &&
    Boolean(center) &&
    viewLevel !== "globe" &&
    zoom >= 1.18;

  if (canRefine && center) {
    const distanceToFrance = distanceInDegrees(center[0], center[1], 2.2, 46.2);
    const distanceToParis = distanceInDegrees(center[0], center[1], 2.35, 48.86);

    if (distanceToFrance <= 58 && zoom >= 1.22) {
      meshPasses.push({
        key: "france",
        bounds: { minLon: -6.5, maxLon: 10.5, minLat: 41, maxLat: 51.8 },
        step: Math.max(1.35, step * 0.36),
        maxCells: viewLevel === "local" ? 240 : 170,
        opacityScale: 0.86
      });
    }

    if (viewLevel === "local" && zoom >= 2 && distanceToParis <= 16) {
      meshPasses.push({
        key: "paris",
        bounds: { minLon: 1.85, maxLon: 2.9, minLat: 48.55, maxLat: 49.1 },
        step: Math.max(0.24, step * 0.16),
        maxCells: 210,
        opacityScale: 0.95
      });
    }
  }

  for (const meshPass of meshPasses) {
    let passCells = 0;
    const passStep = meshPass.step;
    const halfStep = passStep / 2;
    const minLat = clamp(meshPass.bounds.minLat, -88, 88);
    const maxLat = clamp(meshPass.bounds.maxLat, -88, 88);
    const minLon = clamp(meshPass.bounds.minLon, -180, 180);
    const maxLon = clamp(meshPass.bounds.maxLon, -180, 180);

    for (let rowIndex = 0, lat = minLat; lat <= maxLat; lat += passStep, rowIndex += 1) {
      if (passCells >= meshPass.maxCells) {
        break;
      }

      const rowShift = rowIndex % 2 === 0 ? 0 : halfStep;

      for (let lon = minLon + halfStep + rowShift; lon < maxLon; lon += passStep) {
        if (passCells >= meshPass.maxCells) {
          break;
        }

        const cellCenter: LonLat = [lon, lat];
        const northWestCoord: LonLat = [lon - halfStep, lat + halfStep];
        const northEastCoord: LonLat = [lon + halfStep, lat + halfStep];
        const southEastCoord: LonLat = [lon + halfStep, lat - halfStep];
        const southWestCoord: LonLat = [lon - halfStep, lat - halfStep];

        if (
          !isFrontFacing(cellCenter) ||
          !isFrontFacing(northWestCoord) ||
          !isFrontFacing(northEastCoord) ||
          !isFrontFacing(southEastCoord) ||
          !isFrontFacing(southWestCoord)
        ) {
          continue;
        }

        const northWest = projection(northWestCoord);
        projectionCalls += 1;
        const northEast = projection(northEastCoord);
        projectionCalls += 1;
        const southEast = projection(southEastCoord);
        projectionCalls += 1;
        const southWest = projection(southWestCoord);
        projectionCalls += 1;

        if (!northWest || !northEast || !southEast || !southWest) {
          continue;
        }

        const temperatureC = isInteractionActive
          ? sampleFieldTemperature(lat, lon, timeIndex, true)
          : blendedCellTemperature(lat, lon, timeIndex, true, passStep);
        const color = temperatureToColor(temperatureC);
        const contrast = clamp(Math.abs(temperatureC - 14) / 20, 0.35, 1);
        const opacity = baseOpacity * (0.62 + contrast * 0.5) * meshPass.opacityScale;
        const hoverId = `heat_mesh_${meshPass.key}_${lat.toFixed(3)}_${lon.toFixed(3)}`;

        cells.push(
          <path
            key={hoverId}
            d={`M ${northWest[0]} ${northWest[1]} L ${northEast[0]} ${northEast[1]} L ${southEast[0]} ${southEast[1]} L ${southWest[0]} ${southWest[1]} Z`}
            fill={color}
            fillOpacity={opacity}
            stroke="none"
            strokeOpacity={strokeOpacity}
            strokeWidth={0}
            aria-label={includePerfAria ? `Nappe thermique ${temperatureC.toFixed(1)} C` : undefined}
          />
        );
        passCells += 1;
      }
    }
  }

  perfInc("mesh_cells", cells.length);
  perfInc("mesh_projection_calls", projectionCalls);
  if (filter !== "none") {
    perfInc("mesh_blur_frames", 1);
  }
  perfObserveDuration("mesh_render_ms", perfNow() - perfStartMs);

  return (
    <g filter={filter} style={{ mixBlendMode: "normal", pointerEvents: "none" }}>
      {cells}
    </g>
  );
}

export function renderTemperatureHeat(
  heat: HeatFeature,
  projection: ReturnType<typeof geoOrthographic>,
  timeIndex: number,
  sceneProfile: SceneProfileLite,
  visualRegime: VisualRegime,
  emphasized: boolean,
  viewLevel: TemperatureViewLevel,
  isFrontFacing: (point: LonLat) => boolean,
  sampleTemperature: TemperatureSampler | undefined,
  onHover: (payload: HoveredCityTemperature) => void,
  onLeave: () => void
) {
  if (!isFrontFacing(heat.center)) {
    return null;
  }

  const center = projection(heat.center);
  if (!center) {
    return null;
  }

  const value = heatIntensityAt(heat, timeIndex);
  const trendCursorDelta = Math.abs(timeIndex) > 5000 ? 60 * 60 * 1000 : 1.2;
  const previousValue = heatBaseIntensityAt(heat, timeIndex - trendCursorDelta);
  const temperatureC = sampleTemperature ? sampleTemperature(heat.center[1], heat.center[0], timeIndex) : intensityToTemperatureC(value);
  const previousTemperatureC = sampleTemperature
    ? sampleTemperature(heat.center[1], heat.center[0], timeIndex - trendCursorDelta)
    : intensityToTemperatureC(previousValue);
  const deltaC = clamp(temperatureC - previousTemperatureC, -4.5, 4.5);
  const heatColor = temperatureToColor(temperatureC);

  if (viewLevel === "globe" && value < 0.2) {
    return null;
  }

  const diffusionBoost =
    (visualRegime === "long" ? 0.54 : visualRegime === "medium" ? 0.3 : 0.12) +
    sceneProfile.aggregationLevel * 0.09;

  const radius = heat.radius * (0.54 + value * (0.82 + diffusionBoost * 1.24));

  const baseOpacity =
    viewLevel === "globe"
      ? emphasized
        ? 0.24
        : 0.17
      : viewLevel === "regional"
        ? emphasized
          ? 0.28
          : 0.19
        : emphasized
          ? 0.12
          : 0.07;

  const showCore = viewLevel !== "globe";

  return (
    <g
      key={heat.id}
      onMouseEnter={() =>
        onHover({
          id: heat.id,
          label: heat.label,
          x: center[0],
          y: center[1],
          temperatureC,
          deltaC,
          color: heatColor,
          kind: "heat",
          sourceType: heat.sourceType ?? "interpolated"
        })
      }
      onMouseLeave={onLeave}
      onFocus={() =>
        onHover({
          id: heat.id,
          label: heat.label,
          x: center[0],
          y: center[1],
          temperatureC,
          deltaC,
          color: heatColor,
          kind: "heat",
          sourceType: heat.sourceType ?? "interpolated"
        })
      }
      onBlur={onLeave}
      tabIndex={0}
      role="button"
      aria-label={`${heat.label} ${formatTemperature(temperatureC)}`}
      style={{ cursor: "pointer", transition: "opacity 180ms ease-out", pointerEvents: "all" }}
    >
      <circle cx={center[0]} cy={center[1]} r={Math.max(8, radius * 0.92)} fill="rgba(0,0,0,0.001)" />
      <circle
        cx={center[0]}
        cy={center[1]}
        r={radius * (viewLevel === "globe" ? 1.56 : visualRegime === "long" ? 1.4 : 1.22)}
        fill={heatColor}
        fillOpacity={baseOpacity * (viewLevel === "globe" ? 0.18 + value * 0.32 : 0.12 + value * 0.24)}
      />
      {showCore ? (
        <circle
          cx={center[0]}
          cy={center[1]}
          r={emphasized ? radius * 1.16 : radius * 1.02}
          fill={heatColor}
          fillOpacity={baseOpacity * (0.2 + value * 0.28)}
        />
      ) : null}
      {showCore && viewLevel === "local" ? (
        <circle
          cx={center[0]}
          cy={center[1]}
          r={radius * 0.46}
          fill={heatColor}
          fillOpacity={baseOpacity * (0.26 + value * 0.34)}
        />
      ) : null}
    </g>
  );
}

export function renderTemperatureCityPoint(
  city: CityTemperatureFeature,
  heatFeatures: HeatFeature[],
  projection: ReturnType<typeof geoOrthographic>,
  timeIndex: number,
  viewLevel: TemperatureViewLevel,
  isAnchor: boolean,
  isFrontFacing: (point: LonLat) => boolean,
  sampleTemperature: TemperatureSampler | undefined,
  onHover: (payload: HoveredCityTemperature) => void,
  onLeave: () => void
) {
  if ((viewLevel === "globe" || viewLevel === "regional") && !isAnchor) {
    return null;
  }

  if (!isFrontFacing(city.position)) {
    return null;
  }

  const point = projection(city.position);
  if (!point) {
    return null;
  }

  const sample = localTemperatureFromHeat(city, heatFeatures, timeIndex, sampleTemperature);
  const citySourceType: TemperatureDisplaySourceType = city.sourceType ?? (sampleTemperature ? "interpolated" : "fallback");
  const trend = temperatureTrendGlyph(sample.deltaC);
  const trendSize = temperatureTrendSize(sample.deltaC);

  const cityRadius = viewLevel === "local" ? 4.6 : viewLevel === "globe" ? 4.2 : 4.4;
  const haloRadius = viewLevel === "local" ? 6.8 : viewLevel === "globe" ? 6.2 : 6.5;
  const pointOpacity = viewLevel === "local" ? 0.96 : viewLevel === "globe" ? 0.86 : 0.9;

  const emitCityHover = () => {
    const hoverStartMs = perfNow();
    perfInc("city_hover_events", 1);

    onHover({
      id: city.id,
      label: city.label,
      x: point[0],
      y: point[1],
      temperatureC: sample.temperatureC,
      deltaC: sample.deltaC,
      color: sample.color,
      kind: "city",
      sourceType: citySourceType,
      eventTimestampMs: perfNow()
    });

    perfObserveDuration("city_hover_handler_ms", perfNow() - hoverStartMs);
  };

  return (
    <g
      key={city.id}
      transform={`translate(${point[0]}, ${point[1]})`}
      onPointerEnter={emitCityHover}
      onPointerMove={emitCityHover}
      onPointerLeave={onLeave}
      onMouseEnter={emitCityHover}
      onMouseMove={emitCityHover}
      onMouseLeave={onLeave}
      onFocus={emitCityHover}
      onBlur={onLeave}
      tabIndex={0}
      role="button"
      aria-label={`${city.label} ${formatTemperature(sample.temperatureC)}`}
      style={{ cursor: "pointer", transition: "opacity 180ms ease-out", pointerEvents: "all" }}
    >
      <circle r={14} fill="rgba(0,0,0,0.001)" />
      <circle r={haloRadius} fill={sample.color} fillOpacity={viewLevel === "local" ? 0.12 : 0.08} />
      <circle r={cityRadius} fill={sample.color} fillOpacity={pointOpacity} stroke="rgba(230,244,255,0.86)" strokeWidth={0.8} />
      {viewLevel === "local" && trend !== "stable" ? (
        <text y={-8} textAnchor="middle" fill={sample.color} fontSize={trendSize} fontWeight={700} opacity={0.88}>
          {trend === "up" ? "\u2191" : "\u2193"}
        </text>
      ) : null}
    </g>
  );
}
export function renderTemperatureStreetLabels(
  hoveredItem: HoveredCityTemperature | null,
  viewLevel: TemperatureViewLevel
) {
  if (!hoveredItem || viewLevel !== "local" || hoveredItem.kind !== "city") {
    return null;
  }

  return null;
}

export function renderTemperatureTooltip(
  item: HoveredCityTemperature,
  viewportWidth: number,
  viewportHeight: number
) {
  const tooltipWidth = 168;
  const tooltipHeight = 60;
  const x = clamp(item.x + 10, 8, viewportWidth - tooltipWidth - 8);
  const y = clamp(item.y - 56, 8, viewportHeight - tooltipHeight - 8);
  const trend = temperatureTrendGlyph(item.deltaC);

  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        width={tooltipWidth}
        height={tooltipHeight}
        rx={10}
        ry={10}
        fill="rgba(8, 14, 25, 0.9)"
        stroke={item.color}
        strokeOpacity={0.72}
        strokeWidth={1}
      />
      <text x={10} y={18} fill="rgba(231,245,255,0.92)" fontSize={11} fontWeight={600}>
        {item.label}
      </text>
      <text x={10} y={34} fill={item.color} fontSize={12} fontWeight={700}>
        {formatTemperature(item.temperatureC)}
      </text>
      <text x={10} y={48} fill="rgba(206,224,238,0.9)" fontSize={9.5} fontWeight={500}>
        {sourceTypeLabel(item.sourceType)}
      </text>
      {trend !== "stable" ? (
        <text x={tooltipWidth - 16} y={42} fill={item.color} fontSize={12} fontWeight={700}>
          {trend === "up" ? "\u2191" : "\u2193"}
        </text>
      ) : null}
    </g>
  );
}

export function renderTemperatureEventZone(
  zone: EventZoneFeature,
  heatFeatures: HeatFeature[],
  projection: ReturnType<typeof geoOrthographic>,
  timeIndex: number,
  phase: number,
  emphasized: boolean,
  zoneIndex: number,
  timeWindow: TimeWindowState,
  viewLevel: TemperatureViewLevel,
  isFrontFacing: (point: LonLat) => boolean,
  sampleTemperature: TemperatureSampler | undefined,
  onHover: (payload: HoveredCityTemperature) => void,
  onLeave: () => void
) {
  if (viewLevel === "globe") {
    return null;
  }

  if (!isFrontFacing(zone.center)) {
    return null;
  }

  const point = projection(zone.center);
  if (!point) {
    return null;
  }

  const overlapMs = Math.max(0, Math.min(zone.endMs, timeWindow.endMs) - Math.max(zone.startMs, timeWindow.startMs));
  if (overlapMs <= 0) {
    return null;
  }

  const zoneDurationMs = Math.max(1, zone.endMs - zone.startMs);
  const windowDurationMs = Math.max(1, timeWindow.endMs - timeWindow.startMs);
  const overlapRatio = clamp(overlapMs / Math.min(zoneDurationMs, windowDurationMs), 0, 1);
  const recencyRatio = clamp((zone.endMs - timeWindow.startMs) / windowDurationMs, 0, 1);
  const activity = overlapRatio * (0.55 + recencyRatio * 0.45);

  const zoneTemperatureC = fieldTemperatureFromHeat(zone.center, heatFeatures, timeIndex, true, sampleTemperature);
  const baseColor = temperatureToColor(zoneTemperatureC);
  const breathing = 1 + Math.sin((phase * 0.12 + zoneIndex * 0.09) * Math.PI * 2) * 0.03;
  const radius = zone.radius * (viewLevel === "local" ? 2.45 : 2.72) * breathing;
  const dashOffset = -phase * (zone.kind === "storm" ? 16 : 9);
  const zoneOpacity = viewLevel === "local" ? 0.42 : 0.34;

  return (
    <g
      key={zone.id}
      onMouseEnter={() =>
        onHover({
          id: zone.id,
          label: zone.label,
          x: point[0],
          y: point[1],
          temperatureC: zoneTemperatureC,
          deltaC: 0,
          color: baseColor,
          kind: "zone",
          sourceType: "inferred"
        })
      }
      onMouseLeave={onLeave}
      onFocus={() =>
        onHover({
          id: zone.id,
          label: zone.label,
          x: point[0],
          y: point[1],
          temperatureC: zoneTemperatureC,
          deltaC: 0,
          color: baseColor,
          kind: "zone",
          sourceType: "inferred"
        })
      }
      onBlur={onLeave}
      tabIndex={0}
      role="button"
      aria-label={`${zone.label} ${formatTemperature(zoneTemperatureC)}`}
      style={{ cursor: "pointer", transition: "opacity 180ms ease-out", pointerEvents: "all" }}
    >
      <circle cx={point[0]} cy={point[1]} r={radius * 1.06} fill="rgba(0,0,0,0.001)" />
      <circle
        cx={point[0]}
        cy={point[1]}
        r={radius}
        fill={baseColor}
        fillOpacity={zoneOpacity * (zone.kind === "heatwave" ? 0.05 + zone.intensity * 0.04 : 0.03 + zone.intensity * 0.025) * activity}
      />
      <circle
        cx={point[0]}
        cy={point[1]}
        r={radius * (emphasized ? 1.03 : 1)}
        fill="none"
        stroke={baseColor}
        strokeOpacity={zoneOpacity * (emphasized ? 0.5 : 0.3) * activity}
        strokeWidth={emphasized ? 1.5 : 1.05}
        strokeDasharray={zone.kind === "storm" ? "8 14" : "12 18"}
        strokeDashoffset={dashOffset}
      />
    </g>
  );
}















































