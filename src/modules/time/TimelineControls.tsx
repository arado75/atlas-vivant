import { useMemo, useState, type FormEvent } from "react";
import { Panel } from "../shared/Panel";
import {
  resolveSnapshotInvestigationState,
  useAtlasStore,
  type AtlasSceneSnapshot,
  type SnapshotHypothesisStatus
} from "../../app/store/useAtlasStore";
import type { MindEpistemicStatus } from "../../atlas-mind/attention-events";
import { buildTimeEngine, formatWindowDate, formatWindowDuration } from "../../lib/time-engine";

const SNAPSHOT_HYPOTHESIS_STATUSES: SnapshotHypothesisStatus[] = [
  "open",
  "under_test",
  "supported",
  "contested",
  "rejected"
];

const SNAPSHOT_EPISTEMIC_STATUSES: MindEpistemicStatus[] = [
  "observation",
  "concomitance",
  "correlation",
  "probable_causality",
  "robust_causality"
];

function sanitizeFilePart(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "-");
  const cleaned = compact.replace(/[^a-z0-9-_]/g, "");
  return cleaned.length > 0 ? cleaned : "snapshot";
}

function toUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function hypothesisStatusLabel(status: SnapshotHypothesisStatus): string {
  switch (status) {
    case "open":
      return "ouverte";
    case "under_test":
      return "en test";
    case "supported":
      return "supportee";
    case "contested":
      return "contestee";
    case "rejected":
      return "rejetee";
  }
}

function epistemicStatusLabel(status: MindEpistemicStatus): string {
  switch (status) {
    case "observation":
      return "observation";
    case "concomitance":
      return "concomitance";
    case "correlation":
      return "correlation";
    case "probable_causality":
      return "causalite probable";
    case "robust_causality":
      return "causalite robuste";
  }
}

function parseHypothesisStatus(raw: FormDataEntryValue | null): SnapshotHypothesisStatus {
  if (typeof raw !== "string") {
    return "open";
  }

  return SNAPSHOT_HYPOTHESIS_STATUSES.includes(raw as SnapshotHypothesisStatus)
    ? (raw as SnapshotHypothesisStatus)
    : "open";
}

function parseEpistemicStatus(raw: FormDataEntryValue | null): MindEpistemicStatus {
  if (typeof raw !== "string") {
    return "observation";
  }

  return SNAPSHOT_EPISTEMIC_STATUSES.includes(raw as MindEpistemicStatus)
    ? (raw as MindEpistemicStatus)
    : "observation";
}

function parseConfidencePercent(raw: FormDataEntryValue | null, fallback: number): number {
  if (typeof raw !== "string") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(Math.max(0, Math.min(100, parsed)));
}

function readFormText(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function buildBriefingPayload(snapshot: AtlasSceneSnapshot) {
  const investigation = resolveSnapshotInvestigationState(snapshot);

  return {
    generatedAtUtc: new Date().toISOString(),
    snapshot: {
      id: snapshot.id,
      label: snapshot.label,
      createdAtUtc: new Date(snapshot.createdAtMs).toISOString(),
      timeMode: snapshot.timeMode,
      compareEnabled: snapshot.compareEnabled,
      timeWindow: {
        startUtc: new Date(snapshot.timeWindow.startMs).toISOString(),
        endUtc: new Date(snapshot.timeWindow.endMs).toISOString(),
        rightEdgeLockedToNow: snapshot.timeWindow.rightEdgeLockedToNow
      },
      activeLayerIds: snapshot.activeLayerIds,
      selectedBrickId: snapshot.selectedBrickId ?? null,
      graphMode: snapshot.graphMode,
      focusNodeId: snapshot.focusNodeId,
      multiScaleViewPreset: snapshot.multiScaleViewPreset,
      epistemicLayerFilter: snapshot.epistemicLayerFilter
    },
    mindPanel: snapshot.mindPanelState
      ? {
          panelView: snapshot.mindPanelState.panelView,
          cityQuery: snapshot.mindPanelState.cityQuery,
          thresholdInput: snapshot.mindPanelState.thresholdInput
        }
      : null,
    investigation: {
      version: investigation.version,
      updatedAtUtc: new Date(investigation.updatedAtMs).toISOString(),
      whatIsKnown: investigation.whatIsKnown,
      fragilePoints: investigation.fragilePoints,
      hypothesis: investigation.hypothesis,
      hypothesisStatus: investigation.hypothesisStatus,
      contestationNotes: investigation.contestationNotes,
      epistemicStatus: investigation.epistemicStatus,
      confidencePercent: investigation.confidencePercent
    }
  };
}

function buildBriefingMarkdown(snapshot: AtlasSceneSnapshot): string {
  const payload = buildBriefingPayload(snapshot);
  const investigation = payload.investigation;

  return [
    "# Atlas Vivant - Briefing Snapshot",
    "",
    `- Snapshot: ${payload.snapshot.label}`,
    `- Snapshot ID: ${payload.snapshot.id}`,
    `- Capture UTC: ${payload.snapshot.createdAtUtc}`,
    `- Generation briefing UTC: ${payload.generatedAtUtc}`,
    `- Version investigation: v${investigation.version} (maj ${investigation.updatedAtUtc})`,
    "",
    "## Cadre scene",
    `- Time mode: ${payload.snapshot.timeMode}`,
    `- Comparaison N/N-1: ${payload.snapshot.compareEnabled ? "active" : "inactive"}`,
    `- Fenetre UTC: ${payload.snapshot.timeWindow.startUtc} -> ${payload.snapshot.timeWindow.endUtc}`,
    `- Verrouille sur now: ${payload.snapshot.timeWindow.rightEdgeLockedToNow ? "oui" : "non"}`,
    `- Couches actives (${payload.snapshot.activeLayerIds.length}): ${payload.snapshot.activeLayerIds.join(", ") || "--"}`,
    `- Brick selectionnee: ${payload.snapshot.selectedBrickId ?? "--"}`,
    `- Graphe: mode ${payload.snapshot.graphMode}, focus ${payload.snapshot.focusNodeId}`,
    `- Multi-echelles: ${payload.snapshot.multiScaleViewPreset}`,
    `- Filtre epistemique: ${payload.snapshot.epistemicLayerFilter}`,
    "",
    "## Contexte Mind",
    payload.mindPanel
      ? `- Vue: ${payload.mindPanel.panelView}, ville: ${payload.mindPanel.cityQuery || "--"}, seuil: ${payload.mindPanel.thresholdInput}`
      : "- Aucun contexte Mind capture dans ce snapshot",
    "",
    "## Ce que l on sait",
    investigation.whatIsKnown.length > 0 ? investigation.whatIsKnown : "-",
    "",
    "## Ce qui reste fragile",
    investigation.fragilePoints.length > 0 ? investigation.fragilePoints : "-",
    "",
    "## Hypothese de travail",
    investigation.hypothesis.length > 0 ? investigation.hypothesis : "-",
    `- Statut hypothese: ${investigation.hypothesisStatus}`,
    `- Statut epistemique: ${investigation.epistemicStatus}`,
    `- Confiance: ${investigation.confidencePercent}%`,
    "",
    "## Contestation / contre lecture",
    investigation.contestationNotes.length > 0 ? investigation.contestationNotes : "-",
    ""
  ].join("\n");
}

function downloadText(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function exportSnapshotBriefing(snapshot: AtlasSceneSnapshot, format: "md" | "json"): string {
  const stamp = new Date(snapshot.createdAtMs).toISOString().replace(/[:.]/g, "-");
  const baseName = `atlas-briefing-${sanitizeFilePart(snapshot.label)}-${stamp}`;

  if (format === "json") {
    const payload = buildBriefingPayload(snapshot);
    downloadText(`${baseName}.json`, JSON.stringify(payload, null, 2), "application/json");
    return `${baseName}.json`;
  }

  const markdown = buildBriefingMarkdown(snapshot);
  downloadText(`${baseName}.md`, markdown, "text/markdown");
  return `${baseName}.md`;
}

export function TimelineControls() {
  const timeMode = useAtlasStore((state) => state.timeMode);
  const compareEnabled = useAtlasStore((state) => state.compareEnabled);
  const timeWindow = useAtlasStore((state) => state.timeWindow);
  const sceneSnapshots = useAtlasStore((state) => state.sceneSnapshots);
  const setTimeMode = useAtlasStore((state) => state.setTimeMode);
  const setCompareEnabled = useAtlasStore((state) => state.setCompareEnabled);
  const createSceneSnapshot = useAtlasStore((state) => state.createSceneSnapshot);
  const restoreSceneSnapshot = useAtlasStore((state) => state.restoreSceneSnapshot);
  const deleteSceneSnapshot = useAtlasStore((state) => state.deleteSceneSnapshot);
  const clearSceneSnapshots = useAtlasStore((state) => state.clearSceneSnapshots);
  const updateSceneSnapshotInvestigation = useAtlasStore((state) => state.updateSceneSnapshotInvestigation);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);

  const engine = useMemo(() => buildTimeEngine(timeWindow, Date.now()), [timeWindow]);
  const recentSnapshots = useMemo(() => sceneSnapshots.slice(-4).reverse(), [sceneSnapshots]);
  const modeLabel =
    timeMode === "paused"
      ? "Stabilise"
      : timeMode === "accelerated"
        ? "Flux dense"
        : "Flux continu";

  return (
    <Panel
      title="Temps"
      eyebrow="Fenetre glissante"
      actions={<span className="panel-metric">{formatWindowDuration(engine.windowDurationMs)}</span>}
    >
      <div className="timeline-stack">
        <div className={`time-status-card time-status-card-${timeMode}`}>
          <strong>
            {formatWindowDate(engine.startMs)} - {formatWindowDate(engine.endMs)}
          </strong>
          <div className="detail-grid">
            <span>{modeLabel}</span>
            <span>{timeWindow.rightEdgeLockedToNow ? "Ancree sur now" : "Exploration historique"}</span>
            <span>{compareEnabled ? "Comparaison active" : "Comparaison coupee"}</span>
          </div>
        </div>

        <div className="segmented-control segmented-control-wide">
          <button
            type="button"
            className={timeMode === "paused" ? "is-active" : ""}
            onClick={() => setTimeMode("paused")}
          >
            Pause
          </button>
          <button
            type="button"
            className={timeMode === "realtime" ? "is-active" : ""}
            onClick={() => setTimeMode("realtime")}
          >
            Temps reel
          </button>
          <button
            type="button"
            className={timeMode === "accelerated" ? "is-active" : ""}
            onClick={() => setTimeMode("accelerated")}
          >
            Accelere
          </button>
        </div>

        <label className="toggle-row">
          <span>Comparer N / N-1</span>
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={(event) => setCompareEnabled(event.target.checked)}
          />
        </label>

        <div className="snapshot-tools">
          <div className="snapshot-create-row">
            <input
              type="text"
              value={snapshotLabel}
              onChange={(event) => setSnapshotLabel(event.target.value)}
              placeholder="Nom du snapshot (optionnel)"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                createSceneSnapshot(snapshotLabel);
                setSnapshotLabel("");
              }}
            >
              Capturer scene
            </button>
          </div>

          {recentSnapshots.length > 0 ? (
            <div className="relation-list">
              {recentSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="relation-row">
                  {(() => {
                    const investigation = resolveSnapshotInvestigationState(snapshot);

                    const handleInvestigationSubmit = (event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      updateSceneSnapshotInvestigation(snapshot.id, {
                        whatIsKnown: readFormText(formData, "whatIsKnown"),
                        fragilePoints: readFormText(formData, "fragilePoints"),
                        hypothesis: readFormText(formData, "hypothesis"),
                        contestationNotes: readFormText(formData, "contestationNotes"),
                        hypothesisStatus: parseHypothesisStatus(formData.get("hypothesisStatus")),
                        epistemicStatus: parseEpistemicStatus(formData.get("epistemicStatus")),
                        confidencePercent: parseConfidencePercent(
                          formData.get("confidencePercent"),
                          investigation.confidencePercent
                        )
                      });
                      setSnapshotNotice(`Annotations enregistrees pour "${snapshot.label}"`);
                    };

                    return (
                      <>
                  <strong>{snapshot.label}</strong>
                  <small>
                    {toUtcStamp(snapshot.createdAtMs)} UTC -{" "}
                    {snapshot.activeLayerIds.length} couches
                  </small>
                  {snapshot.mindPanelState ? (
                    <small>
                      Mind: {snapshot.mindPanelState.panelView} | ville {snapshot.mindPanelState.cityQuery || "--"}
                    </small>
                  ) : null}
                  <small>
                    Hypothese {hypothesisStatusLabel(investigation.hypothesisStatus)} | epistemique{" "}
                    {epistemicStatusLabel(investigation.epistemicStatus)} | confiance {investigation.confidencePercent}% |
                    v{investigation.version}
                  </small>
                  <small>
                    Vue {snapshot.multiScaleViewPreset} | filtre {snapshot.epistemicLayerFilter}
                  </small>
                  <div className="shortcut-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => restoreSceneSnapshot(snapshot.id)}
                    >
                      Restaurer
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => deleteSceneSnapshot(snapshot.id)}
                    >
                      Supprimer
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        const filename = exportSnapshotBriefing(snapshot, "md");
                        setSnapshotNotice(`Briefing Markdown exporte: ${filename}`);
                      }}
                    >
                      Export MD
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        const filename = exportSnapshotBriefing(snapshot, "json");
                        setSnapshotNotice(`Briefing JSON exporte: ${filename}`);
                      }}
                    >
                      Export JSON
                    </button>
                  </div>
                  <details className="snapshot-notes-block">
                    <summary>Annotations / hypotheses liees au snapshot</summary>
                    <form
                      key={`${snapshot.id}:${investigation.version}`}
                      className="form-grid snapshot-notes-form"
                      onSubmit={handleInvestigationSubmit}
                    >
                      <label className="full-width">
                        <span>Ce que l on sait</span>
                        <textarea
                          name="whatIsKnown"
                          rows={3}
                          defaultValue={investigation.whatIsKnown}
                          placeholder="Faits consolides observables sur ce snapshot"
                        />
                      </label>
                      <label className="full-width">
                        <span>Ce qui reste fragile</span>
                        <textarea
                          name="fragilePoints"
                          rows={3}
                          defaultValue={investigation.fragilePoints}
                          placeholder="Angles morts, limites de source, points non verifies"
                        />
                      </label>
                      <label className="full-width">
                        <span>Hypothese de travail</span>
                        <textarea
                          name="hypothesis"
                          rows={3}
                          defaultValue={investigation.hypothesis}
                          placeholder="Hypothese principale reliee a la scene capturee"
                        />
                      </label>
                      <label>
                        <span>Statut hypothese</span>
                        <select name="hypothesisStatus" defaultValue={investigation.hypothesisStatus}>
                          {SNAPSHOT_HYPOTHESIS_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {hypothesisStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Statut epistemique</span>
                        <select name="epistemicStatus" defaultValue={investigation.epistemicStatus}>
                          {SNAPSHOT_EPISTEMIC_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {epistemicStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Confiance (%)</span>
                        <input
                          type="number"
                          name="confidencePercent"
                          min={0}
                          max={100}
                          step={1}
                          defaultValue={investigation.confidencePercent}
                        />
                      </label>
                      <label className="full-width">
                        <span>Contestation / contre lecture</span>
                        <textarea
                          name="contestationNotes"
                          rows={3}
                          defaultValue={investigation.contestationNotes}
                          placeholder="Arguments qui peuvent invalider ou nuancer l hypothese"
                        />
                      </label>
                      <div className="shortcut-row full-width">
                        <button type="submit" className="secondary-button">
                          Enregistrer annotations
                        </button>
                        <small>
                          Derniere mise a jour: {toUtcStamp(investigation.updatedAtMs)} UTC | version{" "}
                          {investigation.version}
                        </small>
                      </div>
                    </form>
                  </details>
                      </>
                    );
                  })()}
                </div>
              ))}
              <button type="button" className="secondary-button" onClick={clearSceneSnapshots}>
                Vider snapshots
              </button>
            </div>
          ) : (
            <div className="timeline-note">Aucun snapshot de scene pour le moment.</div>
          )}
          {snapshotNotice ? <div className="timeline-note">{snapshotNotice}</div> : null}
        </div>
      </div>
    </Panel>
  );
}
