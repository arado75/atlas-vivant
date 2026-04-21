import { clamp } from "./formatters";

type PerfCounters = Record<string, number>;
type PerfDurations = Record<string, { totalMs: number; count: number; maxMs: number }>;

type PerfRegistry = {
  enabled: boolean;
  counters: PerfCounters;
  durations: PerfDurations;
  lastResetMs: number;
  reset: () => void;
  snapshot: () => {
    enabled: boolean;
    counters: PerfCounters;
    durations: Record<string, { avgMs: number; totalMs: number; count: number; maxMs: number }>;
    lastResetMs: number;
    elapsedMs: number;
  };
  snapshotAndReset: () => {
    enabled: boolean;
    counters: PerfCounters;
    durations: Record<string, { avgMs: number; totalMs: number; count: number; maxMs: number }>;
    lastResetMs: number;
    elapsedMs: number;
  };
};

declare global {
  interface Window {
    __ATLAS_PERF__?: PerfRegistry;
    __ATLAS_PERF_DEBUG__?: boolean;
    __ATLAS_PERF_FLAGS__?: {
      disableMesh?: boolean;
      disableMeshBlur?: boolean;
      forceInteractionActive?: boolean;
    };
  }
}

let cachedEnabled: boolean | null = null;

function buildSnapshot(registry: PerfRegistry) {
  const durations = Object.fromEntries(
    Object.entries(registry.durations).map(([name, value]) => [
      name,
      {
        avgMs: value.count > 0 ? Number((value.totalMs / value.count).toFixed(3)) : 0,
        totalMs: Number(value.totalMs.toFixed(3)),
        count: value.count,
        maxMs: Number(value.maxMs.toFixed(3))
      }
    ])
  );

  return {
    enabled: registry.enabled,
    counters: { ...registry.counters },
    durations,
    lastResetMs: registry.lastResetMs,
    elapsedMs: Date.now() - registry.lastResetMs
  };
}

export function isPerfDebugEnabled(): boolean {
  if (cachedEnabled !== null) {
    return cachedEnabled;
  }

  if (typeof window === "undefined") {
    cachedEnabled = false;
    return cachedEnabled;
  }

  const search = new URLSearchParams(window.location.search);
  const fromQuery = search.get("perfDebug") === "1";
  const fromWindow = Boolean(window.__ATLAS_PERF_DEBUG__);
  cachedEnabled = fromQuery || fromWindow;
  return cachedEnabled;
}

export function getPerfRegistry(): PerfRegistry | null {
  if (!isPerfDebugEnabled() || typeof window === "undefined") {
    return null;
  }

  if (!window.__ATLAS_PERF__) {
    const registry: PerfRegistry = {
      enabled: true,
      counters: {},
      durations: {},
      lastResetMs: Date.now(),
      reset: () => {
        registry.counters = {};
        registry.durations = {};
        registry.lastResetMs = Date.now();
      },
      snapshot: () => buildSnapshot(registry),
      snapshotAndReset: () => {
        const snapshot = buildSnapshot(registry);
        registry.reset();
        return snapshot;
      }
    };

    window.__ATLAS_PERF__ = registry;
  }

  return window.__ATLAS_PERF__;
}

export function perfInc(name: string, delta = 1): void {
  const registry = getPerfRegistry();
  if (!registry) {
    return;
  }

  registry.counters[name] = (registry.counters[name] ?? 0) + delta;
}

export function perfObserveDuration(name: string, durationMs: number): void {
  const registry = getPerfRegistry();
  if (!registry) {
    return;
  }

  const safeDuration = clamp(Number.isFinite(durationMs) ? durationMs : 0, 0, 120000);
  const current = registry.durations[name] ?? { totalMs: 0, count: 0, maxMs: 0 };
  current.totalMs += safeDuration;
  current.count += 1;
  current.maxMs = Math.max(current.maxMs, safeDuration);
  registry.durations[name] = current;
}

export function perfNow(): number {
  if (!isPerfDebugEnabled() || typeof performance === "undefined") {
    return 0;
  }

  return performance.now();
}

export function isPerfFlagEnabled(flag: "disableMesh" | "disableMeshBlur" | "forceInteractionActive"): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__ATLAS_PERF_FLAGS__?.[flag]);
}