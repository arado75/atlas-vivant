import { useMemo } from "react";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import { buildInstrumentInsight } from "../../lib/instrument-insights";
import { formatBrickStatus } from "../../lib/formatters";
import { getDomainAccent, getStatusAccent } from "../../lib/theme";
import { Panel } from "../shared/Panel";

export function InsightPanel() {
  const bricks = useAtlasStore((state) => state.bricks);
  const selectedBrickId = useAtlasStore((state) => state.selectedBrickId);
  const currentStep = useAtlasStore((state) => state.currentStep);
  const timeMode = useAtlasStore((state) => state.timeMode);
  const compareEnabled = useAtlasStore((state) => state.compareEnabled);

  const selectedBrick = bricks.find((brick) => brick.id === selectedBrickId);
  const insight = useMemo(
    () => buildInstrumentInsight(selectedBrick, currentStep, timeMode, compareEnabled),
    [selectedBrick, currentStep, timeMode, compareEnabled]
  );

  const accent = selectedBrick ? getStatusAccent(selectedBrick.status) : "#8dbce8";

  return (
    <Panel
      title="Lecture guidee"
      eyebrow="Utilite immediate"
      actions={<span className="panel-metric">{selectedBrick ? formatBrickStatus(selectedBrick.status) : "Exploration"}</span>}
    >
      <div className="detail-card detail-card-strong" style={{ borderLeft: `4px solid ${accent}` }}>
        <h3>{insight.headline}</h3>
        <p>{insight.summary}</p>
        {selectedBrick ? (
          <div className="detail-grid">
            <span style={{ color: accent }}>{formatBrickStatus(selectedBrick.status)}</span>
            <span style={{ color: getDomainAccent(selectedBrick.domain) }}>{selectedBrick.domain}</span>
            <span>{selectedBrick.sources.length} sources</span>
          </div>
        ) : null}
      </div>

      <div className="insight-section">
        <strong>Pourquoi c'est utile</strong>
        <small>{insight.whyItMatters}</small>
      </div>

      <div className="insight-section insight-warning">
        <strong>Angle mort a garder en tete</strong>
        <small>{insight.blindSpot}</small>
      </div>

      <div className="insight-section">
        <strong>Prochaines inspections recommandees</strong>
        <div className="insight-list">
          {insight.nextChecks.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      <div className="insight-section">
        <strong>Questions utiles</strong>
        <div className="insight-list insight-list-questions">
          {insight.usefulQuestions.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
