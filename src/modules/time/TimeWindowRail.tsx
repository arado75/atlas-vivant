import { useMemo } from "react";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import { MIN_TIME_WINDOW_MS, TIME_RANGE_STEPS } from "../../lib/time-domain";
import {
  buildTimeEngine,
  formatWindowDuration,
  logNormToTime,
  timeToLogNorm
} from "../../lib/time-engine";
import type { MindAttentionEvent } from "../../atlas-mind/attention-events";

function formatFullDate(ms: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ms));
}

function eventDotClass(event: MindAttentionEvent): string {
  if (event.decision === "flag") {
    return "time-window-event-dot is-flag";
  }

  if (event.decision === "watch") {
    return "time-window-event-dot is-watch";
  }

  return "time-window-event-dot is-log";
}

export function TimeWindowRail() {
  const timeWindow = useAtlasStore((state) => state.timeWindow);
  const attentionEvents = useAtlasStore((state) => state.mindAttentionEvents);
  const setTimeWindowStart = useAtlasStore((state) => state.setTimeWindowStart);
  const setTimeWindowEnd = useAtlasStore((state) => state.setTimeWindowEnd);
  const setRightEdgeLockedToNow = useAtlasStore((state) => state.setRightEdgeLockedToNow);

  const engine = useMemo(() => buildTimeEngine(timeWindow, Date.now()), [timeWindow]);

  const startNorm = timeToLogNorm(timeWindow.startMs, engine.domainStartMs, engine.domainEndMs);
  const endNorm = timeToLogNorm(timeWindow.endMs, engine.domainStartMs, engine.domainEndMs);

  const startStep = Math.round(startNorm * TIME_RANGE_STEPS);
  const endStep = Math.round(endNorm * TIME_RANGE_STEPS);

  const maxStartMs = Math.max(engine.domainStartMs, timeWindow.endMs - MIN_TIME_WINDOW_MS);
  const minEndMs = Math.min(engine.domainEndMs, timeWindow.startMs + MIN_TIME_WINDOW_MS);

  const maxStartStep = Math.max(
    0,
    Math.floor(timeToLogNorm(maxStartMs, engine.domainStartMs, engine.domainEndMs) * TIME_RANGE_STEPS)
  );

  const minEndStep = Math.min(
    TIME_RANGE_STEPS,
    Math.ceil(timeToLogNorm(minEndMs, engine.domainStartMs, engine.domainEndMs) * TIME_RANGE_STEPS)
  );

  const windowDurationMs = Math.max(1, timeWindow.endMs - timeWindow.startMs);
  const eventsInWindow = useMemo(
    () =>
      attentionEvents.filter(
        (event) => event.lastSeenAtMs >= timeWindow.startMs && event.lastSeenAtMs <= timeWindow.endMs
      ),
    [attentionEvents, timeWindow.endMs, timeWindow.startMs]
  );
  const eventDots = useMemo(() => eventsInWindow.slice(-24), [eventsInWindow]);
  const eventCounts = useMemo(
    () => ({
      totalBursts: eventsInWindow.length,
      totalOccurrences: eventsInWindow.reduce((sum, event) => sum + event.repeatCount, 0),
      watch: eventsInWindow
        .filter((event) => event.decision === "watch")
        .reduce((sum, event) => sum + event.repeatCount, 0),
      flag: eventsInWindow
        .filter((event) => event.decision === "flag")
        .reduce((sum, event) => sum + event.repeatCount, 0)
    }),
    [eventsInWindow]
  );

  return (
    <section className="time-window-rail" aria-label="Fenetre temporelle glissante">
      <div className="time-window-head">
        <span className="window-pill window-pill-from">From: {formatFullDate(engine.startMs)}</span>
        <span className="window-pill window-pill-to">To: {formatFullDate(engine.endMs)}</span>
        <span className="window-pill window-pill-duration">{formatWindowDuration(engine.windowDurationMs)}</span>
        <button
          type="button"
          className={`lock-toggle ${timeWindow.rightEdgeLockedToNow ? "is-locked" : ""}`}
          onClick={() => setRightEdgeLockedToNow(!timeWindow.rightEdgeLockedToNow)}
        >
          {timeWindow.rightEdgeLockedToNow ? "To verrouille sur now" : "To libre"}
        </button>
      </div>

      <div className="time-window-slider-stack">
        <label className="time-window-slider-row">
          <span className="time-window-slider-label">From</span>
          <input
            className="time-window-slider"
            type="range"
            min={0}
            max={maxStartStep}
            step={1}
            value={Math.min(startStep, maxStartStep)}
            onChange={(event) => {
              const nextNorm = Number(event.target.value) / TIME_RANGE_STEPS;
              const nextStartMs = logNormToTime(nextNorm, engine.domainStartMs, engine.domainEndMs);
              setTimeWindowStart(nextStartMs);
            }}
          />
          <span className="time-window-slider-value">{formatFullDate(engine.startMs)}</span>
        </label>

        <label className="time-window-slider-row">
          <span className="time-window-slider-label">To</span>
          <input
            className={`time-window-slider ${timeWindow.rightEdgeLockedToNow ? "is-disabled" : ""}`}
            type="range"
            min={minEndStep}
            max={TIME_RANGE_STEPS}
            step={1}
            value={Math.max(endStep, minEndStep)}
            disabled={timeWindow.rightEdgeLockedToNow}
            onChange={(event) => {
              const nextNorm = Number(event.target.value) / TIME_RANGE_STEPS;
              const nextEndMs = logNormToTime(nextNorm, engine.domainStartMs, engine.domainEndMs);
              setTimeWindowEnd(nextEndMs);
            }}
          />
          <span className="time-window-slider-value">
            {timeWindow.rightEdgeLockedToNow ? "now" : formatFullDate(engine.endMs)}
          </span>
        </label>
      </div>

      <div className="time-window-events">
        <div className="time-window-events-head">
          <span className="window-pill">Evenements: {eventCounts.totalOccurrences}</span>
          <span className="window-pill">Bursts: {eventCounts.totalBursts}</span>
          <span className="window-pill">Watch: {eventCounts.watch}</span>
          <span className="window-pill">Flag: {eventCounts.flag}</span>
        </div>
        <div className="time-window-events-track" aria-label="Repere d evenements Atlas Mind">
          {eventDots.map((event) => {
            const offset = ((event.lastSeenAtMs - timeWindow.startMs) / windowDurationMs) * 100;
            return (
              <span
                key={event.id}
                className={eventDotClass(event)}
                style={{ left: `${Math.max(0, Math.min(100, offset))}%` }}
                title={`${event.title} - ${event.summary} ${event.repeatCount > 1 ? `(x${event.repeatCount})` : ""}`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
