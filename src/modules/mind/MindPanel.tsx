import { useEffect, useMemo, useState } from "react";
import {
  type MindPanelTristateBoolean,
  useAtlasStore
} from "../../app/store/useAtlasStore";
import {
  buildMindAttentionEvent,
  type MindAttentionEvent,
  type MindEpistemicStatus
} from "../../atlas-mind/attention-events";
import {
  epistemicLayerFilterLabel,
  mindStatusMatchesEpistemicFilter
} from "../../lib/epistemic-layer";
import { clearDecisionLogs, getRecentDecisionLogs } from "../../atlas-mind/decision-log";
import {
  clearMindOrchestrationTrace,
  getRecentMindOrchestrationTrace,
  runMindP202Orchestrator,
  type MindIngressSignal,
  type MindOrchestrationOutput,
  type MindOrchestrationTraceEntry
} from "../../atlas-mind/p2-02-orchestrator";
import type { P201MiniCycleResult } from "../../atlas-mind/p2-01-mini-cycle";
import type { P203RuntimeAvailabilityCycleResult } from "../../atlas-mind/p2-03-runtime-availability-cycle";
import type { P204DataQualityCycleResult } from "../../atlas-mind/p2-04-data-quality-cycle";
import {
  clearCreditSystemState,
  getCreditSystemSnapshot,
  getRecentCreditGateLogs,
  type CreditGateLogEntry
} from "../../atlas-mind/p3-01-credit-system";
import type { TriageDecision } from "../../atlas-mind/types";
import { Panel } from "../shared/Panel";

function decisionLabel(decision: TriageDecision): string {
  switch (decision) {
    case "ignore":
      return "Ignore";
    case "log":
      return "Log";
    case "watch":
      return "Watch";
    case "flag":
      return "Flag";
  }
}

function decisionColor(decision: TriageDecision): string {
  switch (decision) {
    case "ignore":
      return "#8ea8c6";
    case "log":
      return "#8dc6ff";
    case "watch":
      return "#f0cf80";
    case "flag":
      return "#ff8d7a";
  }
}

function routeLabel(route: MindOrchestrationOutput["routedTo"]): string {
  switch (route) {
    case "p2-01.temperature-mini-cycle":
      return "P2-01 temperature";
    case "p2-03.temperature-runtime-availability-cycle":
      return "P2-03 runtime";
    case "p2-04.temperature-data-quality-cycle":
      return "P2-04 data quality";
    case "none":
      return "Aucune route";
  }
}

function formatUtcMinute(timestampMs: number): string {
  return new Date(timestampMs).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function epistemicLabel(status: MindEpistemicStatus): string {
  switch (status) {
    case "observation":
      return "Observation";
    case "concomitance":
      return "Concomitance";
    case "correlation":
      return "Correlation";
    case "probable_causality":
      return "Causalite probable";
    case "robust_causality":
      return "Causalite robuste";
  }
}

function eventMetaLabel(event: MindAttentionEvent): string {
  switch (event.category) {
    case "temperature_anomaly":
      return "Anomalie";
    case "runtime_availability":
      return "Runtime";
    case "data_quality":
      return "Qualite";
    case "generic":
      return "General";
  }
}

function creditGateLabel(gateDecision: MindOrchestrationOutput["credit"]["gateDecision"] | CreditGateLogEntry["gateDecision"]): string {
  switch (gateDecision) {
    case "accepted":
      return "Accepte";
    case "degraded":
      return "Accepte (degrade)";
    case "urgent_bypass":
      return "Accepte (urgent)";
    case "rejected":
      return "Refuse";
    default:
      return gateDecision;
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Erreur inconnue pendant le cycle Atlas Mind.";
}

function asP201CycleResult(cycleResult: MindOrchestrationOutput["cycleResult"]): P201MiniCycleResult | null {
  if (!cycleResult || typeof cycleResult !== "object") {
    return null;
  }

  const maybe = cycleResult as Partial<P201MiniCycleResult>;
  return maybe.source === "city_check" || maybe.source === "manual_signal"
    ? (maybe as P201MiniCycleResult)
    : null;
}

function asP203CycleResult(
  cycleResult: MindOrchestrationOutput["cycleResult"]
): P203RuntimeAvailabilityCycleResult | null {
  if (!cycleResult || typeof cycleResult !== "object") {
    return null;
  }

  const maybe = cycleResult as Partial<P203RuntimeAvailabilityCycleResult>;
  return maybe.source === "runtime_availability_signal" ? (maybe as P203RuntimeAvailabilityCycleResult) : null;
}

function asP204CycleResult(cycleResult: MindOrchestrationOutput["cycleResult"]): P204DataQualityCycleResult | null {
  if (!cycleResult || typeof cycleResult !== "object") {
    return null;
  }

  const maybe = cycleResult as Partial<P204DataQualityCycleResult>;
  return maybe.source === "data_quality_signal" ? (maybe as P204DataQualityCycleResult) : null;
}

function parseTriStateBoolean(input: MindPanelTristateBoolean): boolean | undefined {
  if (input === "yes") {
    return true;
  }
  if (input === "no") {
    return false;
  }
  return undefined;
}

function formatOptionalNumber(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  return `${value.toFixed(1)}${suffix}`;
}

function traceSummary(entry: MindOrchestrationTraceEntry): string {
  return `${routeLabel(entry.routedTo)} | ${decisionLabel(entry.decision)} | ${entry.priority}`;
}

export function MindPanel() {
  const focusedTemperatureCity = useAtlasStore((state) => state.focusedTemperatureCity);
  const attentionEvents = useAtlasStore((state) => state.mindAttentionEvents);
  const epistemicLayerFilter = useAtlasStore((state) => state.epistemicLayerFilter);
  const pushMindAttentionEvent = useAtlasStore((state) => state.pushMindAttentionEvent);
  const clearMindAttentionEvents = useAtlasStore((state) => state.clearMindAttentionEvents);
  const mindPanelState = useAtlasStore((state) => state.mindPanelState);
  const updateMindPanelState = useAtlasStore((state) => state.updateMindPanelState);
  const panelView = mindPanelState.panelView;
  const cityQuery = mindPanelState.cityQuery;
  const thresholdInput = mindPanelState.thresholdInput;
  const runtimeAvailableInput = mindPanelState.runtimeAvailableInput;
  const runtimeFailuresInput = mindPanelState.runtimeFailuresInput;
  const runtimeAgeInput = mindPanelState.runtimeAgeInput;
  const runtimeSourceInput = mindPanelState.runtimeSourceInput;
  const qualityIssueCodeInput = mindPanelState.qualityIssueCodeInput;
  const qualitySourceTypeInput = mindPanelState.qualitySourceTypeInput;
  const qualityDeltaInput = mindPanelState.qualityDeltaInput;
  const qualityRuntimeAvailableInput = mindPanelState.qualityRuntimeAvailableInput;
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orchestration, setOrchestration] = useState<MindOrchestrationOutput | null>(null);
  const [p201Result, setP201Result] = useState<P201MiniCycleResult | null>(null);
  const [p203Result, setP203Result] = useState<P203RuntimeAvailabilityCycleResult | null>(null);
  const [p204Result, setP204Result] = useState<P204DataQualityCycleResult | null>(null);
  const [recentLogs, setRecentLogs] = useState(() => getRecentDecisionLogs(8).slice().reverse());
  const [orchestrationTrace, setOrchestrationTrace] = useState(() =>
    getRecentMindOrchestrationTrace(12).slice().reverse()
  );
  const [creditSnapshot, setCreditSnapshot] = useState(() => getCreditSystemSnapshot());
  const [creditLogs, setCreditLogs] = useState(() => getRecentCreditGateLogs(10).slice().reverse());

  useEffect(() => {
    const focusedLabel = focusedTemperatureCity?.label?.trim();
    if (!focusedLabel) {
      return;
    }

    const normalizedCurrent = cityQuery.trim().toLowerCase();
    const normalizedFocused = focusedLabel.toLowerCase();
    if (normalizedCurrent === normalizedFocused) {
      return;
    }

    updateMindPanelState({ cityQuery: focusedLabel });
  }, [cityQuery, focusedTemperatureCity?.updatedAtMs, focusedTemperatureCity?.label, updateMindPanelState]);

  const thresholdValue = Number(thresholdInput);
  const thresholdC = Number.isFinite(thresholdValue) && thresholdValue > 0 ? thresholdValue : undefined;
  const runtimeFailures = Math.max(0, Math.trunc(Number(runtimeFailuresInput) || 0));
  const runtimeAgeMinCandidate = Number(runtimeAgeInput);
  const runtimeAgeMin = Number.isFinite(runtimeAgeMinCandidate) && runtimeAgeMinCandidate >= 0 ? runtimeAgeMinCandidate : 0;
  const qualityDeltaCandidate = Number(qualityDeltaInput);
  const qualityDeltaC = Number.isFinite(qualityDeltaCandidate) ? qualityDeltaCandidate : undefined;
  const decision = orchestration?.decision;
  const decisionAccent = decision ? decisionColor(decision) : "#8dbce8";

  const creditLoadPercent = useMemo(() => {
    const maxLoad = Math.max(1, creditSnapshot.config.maxLoad);
    return Math.round((creditSnapshot.load / maxLoad) * 100);
  }, [creditSnapshot.config.maxLoad, creditSnapshot.load]);
  const filteredAttentionEvents = useMemo(
    () =>
      attentionEvents.filter((event) =>
        mindStatusMatchesEpistemicFilter(event.epistemicStatus, epistemicLayerFilter)
      ),
    [attentionEvents, epistemicLayerFilter]
  );

  function syncPanelDiagnostics() {
    setRecentLogs(getRecentDecisionLogs(8).slice().reverse());
    setOrchestrationTrace(getRecentMindOrchestrationTrace(12).slice().reverse());
    setCreditSnapshot(getCreditSystemSnapshot());
    setCreditLogs(getRecentCreditGateLogs(10).slice().reverse());
  }

  async function runIngressSignal(signal: MindIngressSignal) {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);

    try {
      const nextOrchestration = await runMindP202Orchestrator(signal);
      setOrchestration(nextOrchestration);
      setP201Result(asP201CycleResult(nextOrchestration.cycleResult));
      setP203Result(asP203CycleResult(nextOrchestration.cycleResult));
      setP204Result(asP204CycleResult(nextOrchestration.cycleResult));
      syncPanelDiagnostics();

      const event = buildMindAttentionEvent(nextOrchestration);
      if (event) {
        pushMindAttentionEvent(event);
      }
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }

  async function runTemperatureAnomalyCycle() {
    const city = cityQuery.trim();
    if (!city) {
      return;
    }

    await runIngressSignal({
      id: `ui-temperature-anomaly-${Date.now()}`,
      type: "temperature.anomaly.simple",
      level: "medium",
      source: "atlas-vivant.ui.mind-panel",
      createdAtMs: Date.now(),
      context: {
        cityQuery: city,
        thresholdC,
        forceRefresh: true
      }
    });
  }

  async function runRuntimeAvailabilityCycle() {
    await runIngressSignal({
      id: `ui-runtime-availability-${Date.now()}`,
      type: "temperature.runtime.availability.simple",
      level: "high",
      source: "atlas-vivant.ui.runtime",
      createdAtMs: Date.now(),
      context: {
        available: parseTriStateBoolean(runtimeAvailableInput),
        consecutiveFailures: runtimeFailures,
        lastSuccessAgeMin: runtimeAgeMin,
        runtimeSource: runtimeSourceInput.trim() || "atlas-vivant.runtime.temperature",
        city: cityQuery.trim() || undefined
      }
    });
  }

  async function runDataQualityCycle() {
    const city = cityQuery.trim();
    const qualitySourceType = qualitySourceTypeInput.trim();

    await runIngressSignal({
      id: `ui-data-quality-${Date.now()}`,
      type: "temperature.data.quality.simple",
      level: "high",
      source: "atlas-vivant.ui.quality",
      createdAtMs: Date.now(),
      context: {
        city: city || undefined,
        cityId: city ? city.toLowerCase().replace(/\s+/g, "_") : undefined,
        sourceType: qualitySourceType || undefined,
        qualityIssueCode: qualityIssueCodeInput,
        fieldCityDeltaC: qualityDeltaC,
        runtimeAvailable: parseTriStateBoolean(qualityRuntimeAvailableInput)
      }
    });
  }

  function clearLogHistory() {
    clearDecisionLogs();
    clearMindAttentionEvents();
    clearMindOrchestrationTrace();
    clearCreditSystemState();
    setRecentLogs([]);
    setOrchestrationTrace([]);
    setCreditSnapshot(getCreditSystemSnapshot());
    setCreditLogs([]);
  }

  return (
    <Panel
      title="Atlas Mind v0"
      eyebrow="P2/P3 pilotage et diagnostics"
      actions={<span className="panel-metric">{decision ? decisionLabel(decision) : "Veille"}</span>}
    >
      <div className="mind-panel-toolbar">
        <div className="segmented-control segmented-control-wide">
          <button
            type="button"
            className={panelView === "pilotage" ? "is-active" : ""}
            onClick={() => updateMindPanelState({ panelView: "pilotage" })}
            aria-pressed={panelView === "pilotage"}
          >
            Pilotage
          </button>
          <button
            type="button"
            className={panelView === "diagnostics" ? "is-active" : ""}
            onClick={() => updateMindPanelState({ panelView: "diagnostics" })}
            aria-pressed={panelView === "diagnostics"}
          >
            Diagnostics
          </button>
        </div>
        <button type="button" className="secondary-button" onClick={clearLogHistory} disabled={isRunning}>
          Vider les traces
        </button>
      </div>

      <div className="mind-kpi-grid">
        <div className="mind-kpi-card">
          <strong>Route active</strong>
          <small>{orchestration ? routeLabel(orchestration.routedTo) : "Aucune"}</small>
        </div>
        <div className="mind-kpi-card">
          <strong>Decision</strong>
          <small>{orchestration ? decisionLabel(orchestration.decision) : "Veille"}</small>
        </div>
        <div className="mind-kpi-card">
          <strong>Charge interne</strong>
          <small>
            {creditSnapshot.load}/{creditSnapshot.config.maxLoad} ({creditLoadPercent}%)
          </small>
        </div>
        <div className="mind-kpi-card">
          <strong>Trace orchestre</strong>
          <small>{orchestrationTrace.length} entree(s)</small>
        </div>
      </div>

      {panelView === "pilotage" ? (
        <>
          <div className="form-grid">
            <label>
              <span>Ville</span>
              <input
                value={cityQuery}
                onChange={(event) => updateMindPanelState({ cityQuery: event.target.value })}
                placeholder="Paris"
              />
            </label>
            <label>
              <span>Seuil anomalie (C)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={thresholdInput}
                onChange={(event) => updateMindPanelState({ thresholdInput: event.target.value })}
              />
            </label>
          </div>

          {focusedTemperatureCity ? (
            <div className="timeline-note">
              Ville active du globe: <strong>{focusedTemperatureCity.label}</strong>. Le champ est mis a jour automatiquement.
            </div>
          ) : null}

          <div className="shortcut-grid">
            <button
              type="button"
              className="shortcut-button"
              onClick={runTemperatureAnomalyCycle}
              disabled={isRunning}
              aria-label="Lancer P2-01 temperature"
            >
              <strong>P2-01 Temperature</strong>
              <small>Cycle anomalie par ville, declenche directement via orchestrateur.</small>
            </button>
            <button
              type="button"
              className="shortcut-button"
              onClick={runRuntimeAvailabilityCycle}
              disabled={isRunning}
              aria-label="Lancer P2-03 runtime"
            >
              <strong>P2-03 Runtime</strong>
              <small>Verifie disponibilite/fraicheur runtime temperature (sans ressaisie globe).</small>
            </button>
            <button
              type="button"
              className="shortcut-button"
              onClick={runDataQualityCycle}
              disabled={isRunning}
              aria-label="Lancer P2-04 quality"
            >
              <strong>P2-04 Data quality</strong>
              <small>Detecte incoherences de source et derive une priorite de traitement.</small>
            </button>
          </div>

          <div className="detail-card">
            <h3>Parametres P2-03 runtime</h3>
            <div className="form-grid">
              <label>
                <span>Disponibilite runtime</span>
                <select
                  value={runtimeAvailableInput}
                  onChange={(event) =>
                    updateMindPanelState({
                      runtimeAvailableInput: event.target.value as MindPanelTristateBoolean
                    })
                  }
                >
                  <option value="unknown">Inconnue</option>
                  <option value="yes">Disponible</option>
                  <option value="no">Indisponible</option>
                </select>
              </label>
              <label>
                <span>Echecs consecutifs</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={runtimeFailuresInput}
                  onChange={(event) => updateMindPanelState({ runtimeFailuresInput: event.target.value })}
                />
              </label>
              <label>
                <span>Age dernier succes (min)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={runtimeAgeInput}
                  onChange={(event) => updateMindPanelState({ runtimeAgeInput: event.target.value })}
                />
              </label>
              <label>
                <span>Source runtime</span>
                <input
                  value={runtimeSourceInput}
                  onChange={(event) => updateMindPanelState({ runtimeSourceInput: event.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="detail-card">
            <h3>Parametres P2-04 data quality</h3>
            <div className="form-grid">
              <label>
                <span>Code issue</span>
                <select
                  value={qualityIssueCodeInput}
                  onChange={(event) => updateMindPanelState({ qualityIssueCodeInput: event.target.value })}
                >
                  <option value="city_missing">city_missing</option>
                  <option value="source_type_incoherent">source_type_incoherent</option>
                  <option value="field_city_divergence_high">field_city_divergence_high</option>
                  <option value="signal_quality_low">signal_quality_low</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>
                <span>Type de source</span>
                <input
                  value={qualitySourceTypeInput}
                  onChange={(event) => updateMindPanelState({ qualitySourceTypeInput: event.target.value })}
                />
              </label>
              <label>
                <span>Delta champ-ville (C)</span>
                <input
                  type="number"
                  step="0.1"
                  value={qualityDeltaInput}
                  onChange={(event) => updateMindPanelState({ qualityDeltaInput: event.target.value })}
                />
              </label>
              <label>
                <span>Runtime dispo (contexte)</span>
                <select
                  value={qualityRuntimeAvailableInput}
                  onChange={(event) =>
                    updateMindPanelState({
                      qualityRuntimeAvailableInput: event.target.value as MindPanelTristateBoolean
                    })
                  }
                >
                  <option value="unknown">Inconnue</option>
                  <option value="yes">Disponible</option>
                  <option value="no">Indisponible</option>
                </select>
              </label>
            </div>
          </div>
        </>
      ) : null}

      {errorMessage ? (
        <div className="warning-card">
          <strong>Echec de cycle</strong>
          <small>{errorMessage}</small>
        </div>
      ) : null}

      {orchestration ? (
        <div className="detail-card detail-card-strong" style={{ borderLeft: `4px solid ${decisionAccent}` }}>
          <h3>Decision: {decisionLabel(orchestration.decision)}</h3>
          <p>{orchestration.reason}</p>
          <div className="detail-grid">
            <span>Route: {routeLabel(orchestration.routedTo)}</span>
            <span>Priorite: {orchestration.priority}</span>
            <span>Filtre anti-bruit: {creditGateLabel(orchestration.credit.gateDecision)}</span>
          </div>
          <div className="detail-grid">
            <span>Priorite demandee: {orchestration.credit.requestedType}</span>
            <span>Priorite appliquee: {orchestration.credit.appliedType}</span>
            <span>Charge interne: {orchestration.credit.cost}</span>
            <span>
              Charge: {orchestration.credit.loadBefore} {"->"} {orchestration.credit.loadAfter}
            </span>
          </div>
          <small>{orchestration.credit.reason} Aucun cout financier utilisateur: traitement local gratuit.</small>
        </div>
      ) : (
        <div className="timeline-note">
          Orchestrateur P2-02 pret. Survole une ville sur le globe puis lance un cycle sans ressaisie.
        </div>
      )}

      {panelView === "diagnostics" ? (
        <div className="mind-diagnostics-stack">
          <div className="timeline-note">
            Filtre epistemique actif: <strong>{epistemicLayerFilterLabel(epistemicLayerFilter)}</strong>
          </div>
          {p201Result?.snapshot ? (
            <div className="detail-card">
              <h3>Snapshot P2-01 temperature</h3>
              <div className="detail-grid">
                <span>{p201Result.snapshot.cityLabel}</span>
                <span>source {p201Result.snapshot.source}</span>
                <span>{formatUtcMinute(p201Result.snapshot.sampledAtMs)}</span>
              </div>
              <div className="detail-grid">
                <span>Ville {p201Result.snapshot.cityTemperatureC.toFixed(2)} C</span>
                <span>Champ {p201Result.snapshot.fieldTemperatureC.toFixed(2)} C</span>
                <span>Delta {p201Result.snapshot.deltaC.toFixed(2)} C</span>
              </div>
            </div>
          ) : null}

          {p203Result?.snapshot ? (
            <div className="detail-card">
              <h3>Snapshot P2-03 runtime</h3>
              <div className="detail-grid">
                <span>
                  Disponibilite:{" "}
                  {p203Result.snapshot.available === null ? "inconnue" : p203Result.snapshot.available ? "oui" : "non"}
                </span>
                <span>Echecs consecutifs: {p203Result.snapshot.consecutiveFailures}</span>
                <span>Age succes: {formatOptionalNumber(p203Result.snapshot.lastSuccessAgeMin, " min")}</span>
                <span>Source: {p203Result.snapshot.source ?? "--"}</span>
              </div>
            </div>
          ) : null}

          {p204Result?.snapshot ? (
            <div className="detail-card">
              <h3>Snapshot P2-04 data quality</h3>
              <div className="detail-grid">
                <span>Ville: {p204Result.snapshot.city ?? "--"}</span>
                <span>VilleId: {p204Result.snapshot.cityId ?? "--"}</span>
                <span>SourceType: {p204Result.snapshot.sourceType ?? "--"}</span>
                <span>Issue: {p204Result.snapshot.issueCode}</span>
              </div>
              <div className="detail-grid">
                <span>Delta champ-ville: {formatOptionalNumber(p204Result.snapshot.fieldCityDeltaC, " C")}</span>
                <span>
                  Runtime disponible:{" "}
                  {p204Result.snapshot.runtimeAvailable === null ? "inconnu" : p204Result.snapshot.runtimeAvailable ? "oui" : "non"}
                </span>
              </div>
            </div>
          ) : null}

          {[...(p201Result?.evaluations ?? []), ...(p203Result?.evaluations ?? []), ...(p204Result?.evaluations ?? [])].length > 0 ? (
            <div className="relation-list">
              {(p201Result?.evaluations ?? []).map((evaluation, index) => (
                <div key={`p201-${evaluation.signalId}-${index}`} className="relation-row">
                  <strong>P2-01 {evaluation.evaluatorRole}</strong>
                  <small>
                    importance {evaluation.importance} - confiance {evaluation.confidence.toFixed(2)} - score{" "}
                    {evaluation.score.toFixed(2)}
                  </small>
                  <small>{evaluation.rationale}</small>
                </div>
              ))}
              {(p203Result?.evaluations ?? []).map((evaluation, index) => (
                <div key={`p203-${evaluation.signalId}-${index}`} className="relation-row">
                  <strong>P2-03 {evaluation.evaluatorRole}</strong>
                  <small>
                    importance {evaluation.importance} - confiance {evaluation.confidence.toFixed(2)} - score{" "}
                    {evaluation.score.toFixed(2)}
                  </small>
                  <small>{evaluation.rationale}</small>
                </div>
              ))}
              {(p204Result?.evaluations ?? []).map((evaluation, index) => (
                <div key={`p204-${evaluation.signalId}-${index}`} className="relation-row">
                  <strong>P2-04 {evaluation.evaluatorRole}</strong>
                  <small>
                    importance {evaluation.importance} - confiance {evaluation.confidence.toFixed(2)} - score{" "}
                    {evaluation.score.toFixed(2)}
                  </small>
                  <small>{evaluation.rationale}</small>
                </div>
              ))}
            </div>
          ) : null}

          {orchestrationTrace.length > 0 ? (
            <div className="relation-list">
              {orchestrationTrace.map((entry) => (
                <div key={`${entry.timestampMs}-${entry.ingressId}`} className="relation-row">
                  <strong>{traceSummary(entry)}</strong>
                  <small>
                    {entry.type} - {formatUtcMinute(entry.timestampMs)} - gate {creditGateLabel(entry.creditGateDecision)}
                  </small>
                  <small>{entry.reason}</small>
                </div>
              ))}
            </div>
          ) : null}

          {creditLogs.length > 0 ? (
            <div className="relation-list">
              {creditLogs.map((entry, index) => (
                <div key={`${entry.timestampMs}-${index}`} className="relation-row">
                  <strong>{creditGateLabel(entry.gateDecision)}</strong>
                  <small>
                    {entry.requestedType} {"->"} {entry.appliedType} | cout interne {entry.cost} | charge{" "}
                    {entry.loadBefore} {"->"} {entry.loadAfter}
                  </small>
                  <small>{entry.reason}</small>
                </div>
              ))}
            </div>
          ) : null}

          {recentLogs.length > 0 ? (
            <div className="relation-list">
              {recentLogs.map((entry, index) => (
                <div key={`${entry.timestampMs}-${entry.city}-${index}`} className="relation-row">
                  <strong>{entry.city}</strong>
                  <small>
                    {decisionLabel(entry.decision)} - {formatUtcMinute(entry.timestampMs)}
                  </small>
                  <small>{entry.reason}</small>
                </div>
              ))}
            </div>
          ) : null}

          {filteredAttentionEvents.length > 0 ? (
            <div className="relation-list">
              {filteredAttentionEvents
                .slice(-8)
                .reverse()
                .map((event) => (
                  <div key={event.id} className="relation-row">
                    <strong>{event.title}</strong>
                    <small>
                      {eventMetaLabel(event)} - {decisionLabel(event.decision)} - {formatUtcMinute(event.lastSeenAtMs)}
                    </small>
                    <small>
                      {epistemicLabel(event.epistemicStatus)} - confiance {event.confidence.toFixed(2)} -{" "}
                      {event.summary} {event.repeatCount > 1 ? `(x${event.repeatCount})` : ""}
                    </small>
                  </div>
                ))}
            </div>
          ) : attentionEvents.length > 0 ? (
            <div className="timeline-note">Aucun evenement ne passe le filtre epistemique courant.</div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
