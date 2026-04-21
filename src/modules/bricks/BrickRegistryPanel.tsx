import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import { formatBrickStatus } from "../../lib/formatters";
import { getDomainAccent, getStatusAccent } from "../../lib/theme";
import { Panel } from "../shared/Panel";

interface BrickRegistryPanelProps {
  isLoading: boolean;
}

export function BrickRegistryPanel({ isLoading }: BrickRegistryPanelProps) {
  const bricks = useAtlasStore((state) => state.bricks);
  const brickErrors = useAtlasStore((state) => state.brickErrors);
  const selectedBrickId = useAtlasStore((state) => state.selectedBrickId);
  const selectBrick = useAtlasStore((state) => state.selectBrick);

  const selectedBrick = bricks.find((brick) => brick.id === selectedBrickId) ?? bricks[0];

  const registryStats = useMemo(
    () => ({
      registry: bricks.filter((brick) => brick.origin === "registry").length,
      proposals: bricks.filter((brick) => brick.origin === "proposal").length
    }),
    [bricks]
  );

  return (
    <Panel
      title="Registre de briques"
      eyebrow="Chargeur JSON / YAML"
      actions={<span className="panel-metric">{bricks.length} briques</span>}
    >
      <div className="brick-summary">
        <span>{registryStats.registry} chargees</span>
        <span>{registryStats.proposals} proposees par Orion</span>
        <span>{isLoading ? "Chargement..." : "Pret"}</span>
      </div>

      <div className="brick-list">
        {bricks.map((brick) => {
          const accent = getStatusAccent(brick.status);
          const domainAccent = getDomainAccent(brick.domain);

          return (
            <button
              key={brick.id}
              type="button"
              className={`brick-card ${selectedBrick?.id === brick.id ? "is-selected" : ""}`}
              style={{
                "--brick-accent": accent,
                borderLeft: `4px solid ${accent}`
              } as CSSProperties}
              onClick={() => selectBrick(brick.id)}
            >
              <div className="brick-card-head">
                <strong>{brick.name}</strong>
                <span className="status-pill" style={{ backgroundColor: `${accent}22`, color: accent }}>
                  {formatBrickStatus(brick.status)}
                </span>
              </div>
              <small style={{ color: domainAccent }}>{brick.domain}</small>
              <p>{brick.description}</p>
              <div className="brick-badges">
                <span>{brick.maturity.stage}</span>
                <span>{brick.visualization.mode}</span>
                <span>{brick.sources.length} sources</span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedBrick ? (
        <div
          className="detail-card detail-card-strong"
          style={{ borderLeft: `4px solid ${getStatusAccent(selectedBrick.status)}` }}
        >
          <h3>{selectedBrick.name}</h3>
          <p>{selectedBrick.description}</p>
          <div className="detail-grid">
            <span>Version {selectedBrick.version}</span>
            <span>{selectedBrick.sources.length} sources</span>
            <span>{selectedBrick.observables.length} observables</span>
            <span>{selectedBrick.relations.upstream.length + selectedBrick.relations.downstream.length} relations</span>
          </div>
          <small>
            La selection active la couche correspondante et pousse le globe a privilegier
            ses zones, flux et impacts lisibles.
          </small>
        </div>
      ) : null}

      {brickErrors.length > 0 ? (
        <div className="warning-card">
          <strong>Erreurs de chargement</strong>
          {brickErrors.map((error) => (
            <small key={error}>{error}</small>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
