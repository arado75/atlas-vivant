import type { SceneProfileLite, TimeMode } from "../types/atlas";

const DAY_MS = 24 * 60 * 60 * 1000;

interface RegimePoint {
  flowDensity: number;
  flowSpeed: number;
  trailPersistence: number;
  aggregationLevel: number;
}

const shortStart: RegimePoint = {
  flowDensity: 0.36,
  flowSpeed: 1.78,
  trailPersistence: 0.18,
  aggregationLevel: 0.04
};

const shortEnd: RegimePoint = {
  flowDensity: 0.6,
  flowSpeed: 1.36,
  trailPersistence: 0.34,
  aggregationLevel: 0.26
};

const mediumEnd: RegimePoint = {
  flowDensity: 1.05,
  flowSpeed: 0.92,
  trailPersistence: 0.66,
  aggregationLevel: 0.64
};

const longEnd: RegimePoint = {
  flowDensity: 0.5,
  flowSpeed: 0.46,
  trailPersistence: 1,
  aggregationLevel: 0.96
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number): number {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
}

function blendPoint(from: RegimePoint, to: RegimePoint, t: number): RegimePoint {
  return {
    flowDensity: mix(from.flowDensity, to.flowDensity, t),
    flowSpeed: mix(from.flowSpeed, to.flowSpeed, t),
    trailPersistence: mix(from.trailPersistence, to.trailPersistence, t),
    aggregationLevel: mix(from.aggregationLevel, to.aggregationLevel, t)
  };
}

function profileFromDuration(durationMs: number): SceneProfileLite {
  const days = clamp(durationMs / DAY_MS, 1, 3650);

  if (days <= 10) {
    const t = smoothstep((days - 1) / 9);
    return blendPoint(shortStart, shortEnd, t);
  }

  if (days <= 180) {
    const t = smoothstep((Math.log10(days) - Math.log10(10)) / (Math.log10(180) - Math.log10(10)));
    return blendPoint(shortEnd, mediumEnd, t);
  }

  const t = smoothstep((Math.log10(days) - Math.log10(180)) / (Math.log10(3650) - Math.log10(180)));
  return blendPoint(mediumEnd, longEnd, t);
}

export function buildSceneProfileLite(durationMs: number, timeMode: TimeMode): SceneProfileLite {
  const base = profileFromDuration(durationMs);

  if (timeMode === "paused") {
    return {
      flowDensity: clamp(base.flowDensity * 0.4, 0.18, 1),
      flowSpeed: 0,
      trailPersistence: clamp(base.trailPersistence * 1.06, 0.16, 1),
      aggregationLevel: base.aggregationLevel
    };
  }

  if (timeMode === "accelerated") {
    return {
      flowDensity: clamp(base.flowDensity * 1.16, 0.24, 1.35),
      flowSpeed: clamp(base.flowSpeed * 1.58, 0.3, 2.6),
      trailPersistence: clamp(base.trailPersistence * 1.04, 0.18, 1),
      aggregationLevel: base.aggregationLevel
    };
  }

  return {
    flowDensity: clamp(base.flowDensity, 0.24, 1.25),
    flowSpeed: clamp(base.flowSpeed, 0.18, 2.2),
    trailPersistence: clamp(base.trailPersistence, 0.18, 1),
    aggregationLevel: clamp(base.aggregationLevel, 0, 1)
  };
}
