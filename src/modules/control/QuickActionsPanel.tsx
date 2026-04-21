import { useAtlasStore, type MultiScaleViewPreset } from "../../app/store/useAtlasStore";
import {
  epistemicLayerFilterLabel,
  epistemicLayerFilterOptions,
  type EpistemicLayerFilter
} from "../../lib/epistemic-layer";
import { Panel } from "../shared/Panel";

const focusShortcuts = [
  {
    label: "Atmosphere",
    brickId: "wind_patterns",
    hint: "Voir les moteurs rapides du systeme."
  },
  {
    label: "Climat",
    brickId: "surface_temperature",
    hint: "Lire les anomalies thermiques visibles."
  },
  {
    label: "Ocean",
    brickId: "ocean_currents",
    hint: "Suivre les inerties longues et structurantes."
  },
  {
    label: "Biosphere",
    brickId: "biosphere_migrations",
    hint: "Relier flux physiques et vivant."
  },
  {
    label: "Mobilite",
    brickId: "aviation_routes",
    hint: "Explorer les circulations humaines."
  },
  {
    label: "Sante",
    brickId: "healthy_life_expectancy",
    hint: "Basculer vers un effet humain composite."
  }
];

const multiScalePresets: Array<{ preset: MultiScaleViewPreset; label: string; hint: string }> = [
  { preset: "planetary", label: "Planetaire", hint: "Vue large pour contexte global." },
  { preset: "systemic", label: "Systemique", hint: "Vue intermediaire orientee systeme." },
  { preset: "regional", label: "Regionale", hint: "Zoom regional pour contrastes." },
  { preset: "local", label: "Locale", hint: "Zoom local pour detail operationnel." }
];

function scrollToPanel(panelId: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const target = document.getElementById(panelId);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function QuickActionsPanel() {
  const selectedBrickId = useAtlasStore((state) => state.selectedBrickId);
  const compareEnabled = useAtlasStore((state) => state.compareEnabled);
  const timeMode = useAtlasStore((state) => state.timeMode);
  const multiScaleViewPreset = useAtlasStore((state) => state.multiScaleViewPreset);
  const epistemicLayerFilter = useAtlasStore((state) => state.epistemicLayerFilter);
  const selectBrick = useAtlasStore((state) => state.selectBrick);
  const clearSelection = useAtlasStore((state) => state.clearSelection);
  const setCompareEnabled = useAtlasStore((state) => state.setCompareEnabled);
  const setTimeMode = useAtlasStore((state) => state.setTimeMode);
  const setMultiScaleViewPreset = useAtlasStore((state) => state.setMultiScaleViewPreset);
  const setEpistemicLayerFilter = useAtlasStore((state) => state.setEpistemicLayerFilter);

  return (
    <Panel
      title="Actions rapides"
      eyebrow="Pilotage fluide"
      panelId="atlas-quick-actions-panel"
      actions={
        <span className="panel-metric">
          {selectedBrickId ? "Focus actif" : "Vue large"} | {multiScaleViewPreset}
        </span>
      }
    >
      <div className="shortcut-grid">
        {focusShortcuts.map((shortcut) => (
          <button
            key={shortcut.brickId}
            type="button"
            className={`shortcut-button ${selectedBrickId === shortcut.brickId ? "is-active" : ""}`}
            onClick={() => selectBrick(shortcut.brickId)}
          >
            <strong>{shortcut.label}</strong>
            <small>{shortcut.hint}</small>
          </button>
        ))}
      </div>

      <div className="shortcut-row">
        <button type="button" className="secondary-button" onClick={() => clearSelection()}>
          Revenir au contexte global
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setCompareEnabled(!compareEnabled)}
        >
          {compareEnabled ? "Couper la comparaison" : "Activer comparaison"}
        </button>
      </div>

      <div className="shortcut-row">
        <button
          type="button"
          className={`secondary-button ${timeMode === "paused" ? "is-active" : ""}`}
          onClick={() => setTimeMode("paused")}
        >
          Pause analytique
        </button>
        <button
          type="button"
          className={`secondary-button ${timeMode === "accelerated" ? "is-active" : ""}`}
          onClick={() => setTimeMode("accelerated")}
        >
          Lecture rapide
        </button>
      </div>

      <div className="detail-card">
        <h3>Navigation multi-echelles</h3>
        <div className="shortcut-grid">
          {multiScalePresets.map((entry) => (
            <button
              key={entry.preset}
              type="button"
              className={`shortcut-button ${multiScaleViewPreset === entry.preset ? "is-active" : ""}`}
              onClick={() => setMultiScaleViewPreset(entry.preset)}
            >
              <strong>{entry.label}</strong>
              <small>{entry.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="detail-card">
        <h3>Couche epistemique</h3>
        <label className="compact-select">
          <span>Filtre global</span>
          <select
            value={epistemicLayerFilter}
            onChange={(event) => setEpistemicLayerFilter(event.target.value as EpistemicLayerFilter)}
          >
            {epistemicLayerFilterOptions.map((option) => (
              <option key={option} value={option}>
                {epistemicLayerFilterLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="shortcut-row">
        <button type="button" className="secondary-button" onClick={() => scrollToPanel("atlas-globe-panel")}>
          Aller au Globe
        </button>
        <button type="button" className="secondary-button" onClick={() => scrollToPanel("atlas-causal-panel")}>
          Pont vers Graphe
        </button>
        <button type="button" className="secondary-button" onClick={() => scrollToPanel("atlas-orion-panel")}>
          Pont vers Orion
        </button>
      </div>

      <div className="timeline-note">
        Ce panneau retire des frictions: presets multi-echelles, filtre epistemique et ponts directs globe/graphe/Orion.
      </div>
    </Panel>
  );
}
