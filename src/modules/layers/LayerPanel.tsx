import { layerCatalog } from "../../data/mockCatalog";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import { formatBrickStatus, formatConfidence } from "../../lib/formatters";
import { getDomainAccent, getStatusAccent } from "../../lib/theme";
import { Panel } from "../shared/Panel";

export function LayerPanel() {
  const activeLayers = useAtlasStore((state) => state.activeLayers);
  const toggleLayer = useAtlasStore((state) => state.toggleLayer);
  const bricks = useAtlasStore((state) => state.bricks);
  const selectedBrickId = useAtlasStore((state) => state.selectedBrickId);
  const selectBrick = useAtlasStore((state) => state.selectBrick);

  const brickMap = new Map(bricks.map((brick) => [brick.id, brick]));

  return (
    <Panel
      title="Couches"
      eyebrow="Vue principale"
      actions={<span className="panel-metric">{Object.values(activeLayers).filter(Boolean).length} actives</span>}
    >
      <div className="layer-list">
        {layerCatalog.map((layer) => {
          const brick = brickMap.get(layer.brickId);
          const isActive = Boolean(activeLayers[layer.id]);
          const isSelected = selectedBrickId === layer.brickId;
          const accent = brick ? getStatusAccent(brick.status) : getDomainAccent(layer.family);

          return (
            <button
              key={layer.id}
              type="button"
              className={`layer-item ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""}`}
              style={{ borderLeft: `3px solid ${accent}` }}
              onClick={() => {
                selectBrick(layer.brickId);
                if (!isActive) {
                  toggleLayer(layer.id);
                }
              }}
            >
              <span
                className="layer-chip"
                style={{ backgroundColor: layer.color }}
              />
              <span className="layer-copy">
                <strong>{layer.label}</strong>
                <small>{layer.description}</small>
                <span className="layer-meta">
                  <span>{layer.family}</span>
                  <span>{brick ? formatBrickStatus(brick.status) : "En attente"}</span>
                  <span>{isActive ? "Visible" : "Masquee"}</span>
                  <span>
                    {brick
                      ? formatConfidence(
                          Math.max(
                            ...brick.relations.upstream.map((relation) => relation.confidence),
                            ...brick.relations.downstream.map((relation) => relation.confidence),
                            brick.sources.length > 0 ? 0.58 : 0.34
                          )
                        )
                      : "--"}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
