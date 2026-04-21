import { MIN_TIME_WINDOW_MS, TIME_DOMAIN_FUTURE_MS, TIME_DOMAIN_START_MS } from "./time-domain";
import type { TimeWindowState } from "../types/atlas";

const LOG_TIME_CURVE_MS = 7 * 24 * 60 * 60 * 1000;

export interface TimeEngineLite {
  nowMs: number;
  domainStartMs: number;
  domainEndMs: number;
  startMs: number;
  endMs: number;
  windowDurationMs: number;
  startNorm: number;
  endNorm: number;
  centerNorm: number;
  cycleIndex: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function normalizeTime(ms: number, domainStartMs: number, domainEndMs: number): number {
  const span = Math.max(1, domainEndMs - domainStartMs);
  return clampNumber((ms - domainStartMs) / span, 0, 1);
}

export function denormalizeTime(norm: number, domainStartMs: number, domainEndMs: number): number {
  const bounded = clampNumber(norm, 0, 1);
  return Math.round(domainStartMs + (domainEndMs - domainStartMs) * bounded);
}

export function timeToLogNorm(ms: number, domainStartMs: number, domainEndMs: number): number {
  const clampedMs = clampNumber(ms, domainStartMs, domainEndMs);
  const maxAgeMs = Math.max(1, domainEndMs - domainStartMs);
  const ageMs = domainEndMs - clampedMs;
  const normalizedAge = Math.log1p(ageMs / LOG_TIME_CURVE_MS) / Math.log1p(maxAgeMs / LOG_TIME_CURVE_MS);
  return clampNumber(1 - normalizedAge, 0, 1);
}

export function logNormToTime(norm: number, domainStartMs: number, domainEndMs: number): number {
  const bounded = clampNumber(norm, 0, 1);
  const maxAgeMs = Math.max(1, domainEndMs - domainStartMs);
  const ageExponent = (1 - bounded) * Math.log1p(maxAgeMs / LOG_TIME_CURVE_MS);
  const ageMs = LOG_TIME_CURVE_MS * (Math.exp(ageExponent) - 1);
  return Math.round(clampNumber(domainEndMs - ageMs, domainStartMs, domainEndMs));
}

function resolveDomainEndMs(nowMs: number): number {
  return Math.max(nowMs + TIME_DOMAIN_FUTURE_MS, TIME_DOMAIN_START_MS + MIN_TIME_WINDOW_MS);
}

export function sanitizeWindow(window: TimeWindowState, nowMs: number): TimeWindowState {
  const domainEndMs = resolveDomainEndMs(nowMs);
  const maxStartMs = domainEndMs - MIN_TIME_WINDOW_MS;
  const startMs = clampNumber(window.startMs, TIME_DOMAIN_START_MS, maxStartMs);
  const endMs = clampNumber(window.endMs, startMs + MIN_TIME_WINDOW_MS, domainEndMs);

  return {
    ...window,
    startMs,
    endMs
  };
}

export function buildTimeEngine(window: TimeWindowState, nowMs = Date.now()): TimeEngineLite {
  const domainEndMs = resolveDomainEndMs(nowMs);
  const sanitized = sanitizeWindow(window, nowMs);
  const startNorm = normalizeTime(sanitized.startMs, TIME_DOMAIN_START_MS, domainEndMs);
  const endNorm = normalizeTime(sanitized.endMs, TIME_DOMAIN_START_MS, domainEndMs);

  return {
    nowMs,
    domainStartMs: TIME_DOMAIN_START_MS,
    domainEndMs,
    startMs: sanitized.startMs,
    endMs: sanitized.endMs,
    windowDurationMs: sanitized.endMs - sanitized.startMs,
    startNorm,
    endNorm,
    centerNorm: (startNorm + endNorm) / 2,
    cycleIndex: timeToCycleIndex(sanitized.endMs)
  };
}

export function timeToCycleIndex(ms: number): number {
  const date = new Date(ms);
  const month = date.getUTCMonth();
  const day = date.getUTCDate() - 1;
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return month + day / Math.max(1, daysInMonth);
}

export function formatWindowDate(ms: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "short"
  }).format(new Date(ms));
}

export function formatWindowDuration(ms: number): string {
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const days = ms / dayMs;

  if (ms < hourMs) {
    return `${Math.max(1, Math.round(ms / minuteMs))}min`;
  }

  if (ms < dayMs * 2) {
    const hours = ms / hourMs;
    return hours < 10 ? `${hours.toFixed(1).replace(".", ",")}h` : `${Math.round(hours)}h`;
  }

  if (days < 45) {
    return `${Math.round(days)}j`;
  }

  const months = days / 30.4375;
  if (months < 24) {
    return `${Math.round(months)}m`;
  }

  const years = months / 12;
  return `${years.toFixed(1).replace(".", ",")}a`;
}




