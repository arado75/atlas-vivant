import { useMemo } from "react";
import { useAtlasStore } from "../../app/store/useAtlasStore";
import { causalEdges, causalNodes } from "../../data/mockCausalGraph";
import { formatConfidence, formatRelationStatus } from "../../lib/formatters";
import {
  epistemicLayerFilterLabel,
  epistemicLayerFilterOptions,
  relationStatusMatchesEpistemicFilter,
  type EpistemicLayerFilter
} from "../../lib/epistemic-layer";
import { Panel } from "../shared/Panel";
import type { GraphEdge, GraphMode, GraphNode } from "../../types/atlas";

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  depth: number;
}

function buildGraphView(mode: GraphMode, focusNodeId: string, epistemicLayerFilter: EpistemicLayerFilter) {
  const filteredEdges = causalEdges.filter((edge) =>
    relationStatusMatchesEpistemicFilter(edge.status, epistemicLayerFilter)
  );
  const depthMap = new Map<string, number>([[focusNodeId, 0]]);
  const queue = [focusNodeId];
  const maxDepth = 3;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthMap.get(current) ?? 0;
    if (currentDepth >= maxDepth) {
      continue;
    }

    const nextEdges = filteredEdges.filter((edge) =>
      mode === "root" ? edge.target === current : edge.source === current
    );

    nextEdges.forEach((edge) => {
      const nextNodeId = mode === "root" ? edge.source : edge.target;
      if (!depthMap.has(nextNodeId)) {
        depthMap.set(nextNodeId, currentDepth + 1);
        queue.push(nextNodeId);
      }
    });
  }

  const visibleNodes = causalNodes.filter((node) => depthMap.has(node.id));
  const visibleEdges = filteredEdges.filter((edge) => {
    const sourceDepth = depthMap.get(edge.source);
    const targetDepth = depthMap.get(edge.target);
    if (sourceDepth === undefined || targetDepth === undefined) {
      return false;
    }

    return mode === "root"
      ? targetDepth === sourceDepth - 1 || sourceDepth === targetDepth + 1
      : targetDepth === sourceDepth + 1 || sourceDepth === targetDepth - 1;
  });

  const maxVisibleDepth = Math.max(...Array.from(depthMap.values()));
  const layers = Array.from({ length: maxVisibleDepth + 1 }, () => [] as GraphNode[]);

  visibleNodes.forEach((node) => {
    const depth = depthMap.get(node.id) ?? 0;
    layers[depth].push(node);
  });

  const width = 760;
  const height = 320;
  const marginX = 88;
  const marginY = 52;
  const columnWidth = maxVisibleDepth === 0 ? 0 : (width - marginX * 2) / maxVisibleDepth;

  const positionedNodes: PositionedNode[] = layers.flatMap((nodesAtDepth, depth) => {
    const displayDepth = mode === "root" ? maxVisibleDepth - depth : depth;
    return nodesAtDepth.map((node, index) => {
      const stepY = (height - marginY * 2) / (nodesAtDepth.length + 1);
      return {
        ...node,
        depth,
        x: marginX + columnWidth * displayDepth,
        y: marginY + stepY * (index + 1)
      };
    });
  });

  return {
    positionedNodes,
    visibleEdges
  };
}

export function CausalGraphPanel() {
  const graphMode = useAtlasStore((state) => state.graphMode);
  const focusNodeId = useAtlasStore((state) => state.focusNodeId);
  const epistemicLayerFilter = useAtlasStore((state) => state.epistemicLayerFilter);
  const setGraphMode = useAtlasStore((state) => state.setGraphMode);
  const setFocusNodeId = useAtlasStore((state) => state.setFocusNodeId);
  const setEpistemicLayerFilter = useAtlasStore((state) => state.setEpistemicLayerFilter);

  const graph = useMemo(
    () => buildGraphView(graphMode, focusNodeId, epistemicLayerFilter),
    [graphMode, focusNodeId, epistemicLayerFilter]
  );
  const nodeMap = new Map(graph.positionedNodes.map((node) => [node.id, node]));
  const focusNode = causalNodes.find((node) => node.id === focusNodeId) ?? causalNodes[0];
  const spotlightEdges = graph.visibleEdges.filter(
    (edge) => edge.source === focusNodeId || edge.target === focusNodeId
  );

  return (
    <Panel
      title="Graphe causal"
      eyebrow="Mode racine / mode arbre"
      panelId="atlas-causal-panel"
      actions={
        <span className="panel-metric">
          {graphMode === "root" ? "Racine" : "Arbre"} | {epistemicLayerFilterLabel(epistemicLayerFilter)}
        </span>
      }
    >
      <div className="graph-toolbar">
        <div className="segmented-control">
          <button
            type="button"
            className={graphMode === "root" ? "is-active" : ""}
            onClick={() => setGraphMode("root")}
          >
            Racine
          </button>
          <button
            type="button"
            className={graphMode === "tree" ? "is-active" : ""}
            onClick={() => setGraphMode("tree")}
          >
            Arbre
          </button>
        </div>

        <label className="compact-select">
          <span>Noeud</span>
          <select
            value={focusNodeId}
            onChange={(event) => setFocusNodeId(event.target.value)}
          >
            {causalNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
        </label>
        <label className="compact-select">
          <span>Filtre epistemique</span>
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

      <svg className="graph-canvas" viewBox="0 0 760 320">
        {graph.visibleEdges.map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) {
            return null;
          }

          return renderEdge(edge, source, target, edge.source === focusNodeId || edge.target === focusNodeId);
        })}

        {graph.positionedNodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <circle
              r={node.id === focusNodeId ? 27 : 22}
              className={node.id === focusNodeId ? "graph-node graph-node-focus" : "graph-node"}
            />
            <text textAnchor="middle" y={5} className="graph-node-label">
              {node.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="detail-card detail-card-strong">
        <h3>{focusNode.label}</h3>
        <p>{focusNode.description}</p>
        <div className="detail-grid">
          <span>{focusNode.domain}</span>
          <span>{graph.visibleEdges.length} relations visibles</span>
          <span>{graph.positionedNodes.length} noeuds visibles</span>
          <span>{graphMode === "root" ? "Causes amont" : "Consequences aval"}</span>
        </div>
      </div>

      <div className="insight-section">
        <strong>Relation spotlight</strong>
        <div className="insight-list">
          {spotlightEdges.map((edge) => (
            <span key={edge.id}>
              {causalNodes.find((node) => node.id === edge.source)?.label} vers {causalNodes.find((node) => node.id === edge.target)?.label} {formatConfidence(edge.confidence)}
            </span>
          ))}
        </div>
      </div>

      <div className="relation-list">
        {graph.visibleEdges.map((edge) => (
          <div key={edge.id} className="relation-row">
            <strong>
              {causalNodes.find((node) => node.id === edge.source)?.label} vers {" "}
              {causalNodes.find((node) => node.id === edge.target)?.label}
            </strong>
            <small>
              {formatRelationStatus(edge.status)} - {formatConfidence(edge.confidence)} - {" "}
              {edge.delay}
            </small>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function renderEdge(edge: GraphEdge, source: PositionedNode, target: PositionedNode, isPrimary: boolean) {
  const curveX = (source.x + target.x) / 2;
  const path = `M ${source.x} ${source.y} C ${curveX} ${source.y}, ${curveX} ${target.y}, ${target.x} ${target.y}`;
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  return (
    <g key={edge.id} opacity={isPrimary ? 1 : 0.62}>
      <path d={path} className={`graph-edge graph-edge-${edge.status} ${isPrimary ? "graph-edge-primary" : ""}`} />
      <text x={midX} y={midY - 8} textAnchor="middle" className="graph-edge-label">
        {formatConfidence(edge.confidence)}
      </text>
    </g>
  );
}
