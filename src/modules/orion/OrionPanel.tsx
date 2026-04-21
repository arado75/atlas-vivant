import { useMemo, useState } from "react";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import {
  analyzeProposal,
  createProposalBrick,
  proposalToYaml,
  type OrionProposalInput
} from "../../lib/orion-analysis";
import {
  formatBrickStatus,
  formatConfidence,
  formatRelationStatus
} from "../../lib/formatters";
import { Panel } from "../shared/Panel";

const defaultProposal: OrionProposalInput = {
  name: "Krill density signal",
  domain: "biosphere",
  description:
    "Regional estimate of krill density inferred from ocean temperature anomalies, plankton abundance and fishing observations.",
  observables: "density, anomaly, biomass",
  sources: "NOAA marine anomaly feed\nPeer reviewed ecosystem survey"
};

export function OrionPanel() {
  const [form, setForm] = useState<OrionProposalInput>(defaultProposal);
  const bricks = useAtlasStore((state) => state.bricks);
  const selectedBrickId = useAtlasStore((state) => state.selectedBrickId);
  const addProposalBrick = useAtlasStore((state) => state.addProposalBrick);
  const selectedBrick = useMemo(
    () => (selectedBrickId ? bricks.find((brick) => brick.id === selectedBrickId) ?? null : null),
    [bricks, selectedBrickId]
  );
  const analysis = useMemo(() => analyzeProposal(form), [form]);
  const previewBrick = useMemo(() => createProposalBrick(form, analysis), [analysis, form]);
  const yamlPreview = useMemo(() => proposalToYaml(previewBrick), [previewBrick]);

  function updateField<Key extends keyof OrionProposalInput>(
    key: Key,
    value: OrionProposalInput[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <Panel
      title="Orion"
      eyebrow="Proposition de brique"
      panelId="atlas-orion-panel"
      actions={<span className="panel-metric">{formatConfidence(analysis.confidence)}</span>}
    >
      <div className="timeline-note">
        Contexte focus actif: <strong>{selectedBrick?.name ?? "aucun"}</strong>.
      </div>

      <div className="shortcut-row">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            if (!selectedBrick) {
              return;
            }

            const sourceLabels = selectedBrick.sources.map((source) => source.name).join("\n");
            setForm({
              name: `${selectedBrick.name} - hypothese`,
              domain: selectedBrick.domain,
              description: `${selectedBrick.description} Hypothese a tester dans la scene active.`,
              observables: selectedBrick.observables.join(", "),
              sources: sourceLabels || "Source locale Atlas Vivant"
            });
          }}
          disabled={!selectedBrick}
        >
          Importer contexte du focus
        </button>
      </div>

      <div className="form-grid">
        <label>
          <span>Nom</span>
          <input
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </label>

        <label>
          <span>Domaine</span>
          <input
            value={form.domain}
            onChange={(event) => updateField("domain", event.target.value)}
          />
        </label>

        <label className="full-width">
          <span>Description</span>
          <textarea
            rows={4}
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
          />
        </label>

        <label>
          <span>Observables</span>
          <input
            value={form.observables}
            onChange={(event) => updateField("observables", event.target.value)}
          />
        </label>

        <label>
          <span>Sources</span>
          <textarea
            rows={4}
            value={form.sources}
            onChange={(event) => updateField("sources", event.target.value)}
          />
        </label>
      </div>

      <div className="orion-status">
        <div className="detail-card">
          <h3>Lecture Orion</h3>
          <div className="detail-grid">
            <span>{formatBrickStatus(analysis.recommendedStatus)}</span>
            <span>{analysis.maturityStage}</span>
            <span>{analysis.normalizedSources.length} sources</span>
            <span>{analysis.suggestions.length} connexions</span>
          </div>
          {analysis.rationale.map((reason) => (
            <small key={reason}>{reason}</small>
          ))}
        </div>

        <div className="warning-card">
          <strong>Vigilance epistemique</strong>
          {analysis.warnings.length > 0 ? (
            analysis.warnings.map((warning) => <small key={warning}>{warning}</small>)
          ) : (
            <small>Pas d'alerte critique pour cette proposition locale.</small>
          )}
        </div>
      </div>

      <div className="relation-list">
        {analysis.suggestions.map((suggestion) => (
          <div key={`${suggestion.node}-${suggestion.type}`} className="relation-row">
            <strong>{suggestion.label}</strong>
            <small>
              {formatRelationStatus(suggestion.type)} - {formatConfidence(suggestion.confidence)}
            </small>
            <small>{suggestion.reason}</small>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="primary-button"
        onClick={() => addProposalBrick(previewBrick)}
      >
        Ajouter au registre local
      </button>

      <div className="code-preview">
        <div className="panel-eyebrow">Preview YAML</div>
        <pre>{yamlPreview}</pre>
      </div>
    </Panel>
  );
}
