import { Suspense, lazy, useEffect, useState } from "react";
import { useAtlasStore } from "./app/store/useAtlasStore";
import { BrickRegistryPanel } from "./modules/bricks/BrickRegistryPanel";
import { QuickActionsPanel } from "./modules/control/QuickActionsPanel";
import { LayerPanel } from "./modules/layers/LayerPanel";
import { InteractiveGlobe } from "./modules/map/InteractiveGlobe";
import { TimelineControls } from "./modules/time/TimelineControls";
import { TimeWindowRail } from "./modules/time/TimeWindowRail";
import { loadBrickRegistry } from "./lib/brick-loader";

const MindPanel = lazy(() =>
  import("./modules/mind/MindPanel").then((module) => ({ default: module.MindPanel }))
);
const CausalGraphPanel = lazy(() =>
  import("./modules/causal/CausalGraphPanel").then((module) => ({ default: module.CausalGraphPanel }))
);
const OrionPanel = lazy(() =>
  import("./modules/orion/OrionPanel").then((module) => ({ default: module.OrionPanel }))
);

export default function App() {
  const loadBricks = useAtlasStore((state) => state.loadBricks);
  const syncTimeWindowToNow = useAtlasStore((state) => state.syncTimeWindowToNow);
  const timeMode = useAtlasStore((state) => state.timeMode);
  const rightEdgeLockedToNow = useAtlasStore((state) => state.timeWindow.rightEdgeLockedToNow);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    loadBrickRegistry()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        loadBricks(result.bricks, result.errors);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        loadBricks([], [error instanceof Error ? error.message : "Unknown registry error"]);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadBricks]);

  useEffect(() => {
    if (!rightEdgeLockedToNow || timeMode === "paused") {
      return undefined;
    }

    syncTimeWindowToNow(Date.now());

    // Keep realtime in sync without triggering frequent full-app updates.
    const timer = window.setInterval(() => {
      syncTimeWindowToNow(Date.now());
    }, timeMode === "accelerated" ? 700 : 2200);

    return () => window.clearInterval(timer);
  }, [rightEdgeLockedToNow, syncTimeWindowToNow, timeMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    if (!query.has("tempDebug") && !query.has("perfDebug") && !query.has("debugStore")) {
      return;
    }

    (window as unknown as { __atlasStoreDebug?: unknown }).__atlasStoreDebug = {
      getState: () => useAtlasStore.getState(),
      updateMindPanelState: (partial: unknown) => {
        useAtlasStore.getState().updateMindPanelState(partial as never);
      },
      setMultiScaleViewPreset: (preset: unknown) => {
        useAtlasStore.getState().setMultiScaleViewPreset(preset as never);
      },
      setEpistemicLayerFilter: (filter: unknown) => {
        useAtlasStore.getState().setEpistemicLayerFilter(filter as never);
      },
      createSceneSnapshot: (label?: string) => {
        useAtlasStore.getState().createSceneSnapshot(label);
      },
      restoreSceneSnapshot: (snapshotId: string) => {
        useAtlasStore.getState().restoreSceneSnapshot(snapshotId);
      }
    };

    return () => {
      delete (window as unknown as { __atlasStoreDebug?: unknown }).__atlasStoreDebug;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header app-header-minimal">
        <div>
          <span className="kicker">Observatoire vivant</span>
          <h1>Atlas Vivant</h1>
        </div>
      </header>

      <div className="app-grid">
        <aside className="sidebar">
          <LayerPanel />
          <QuickActionsPanel />
          <TimelineControls />
          <BrickRegistryPanel isLoading={isLoading} />
        </aside>

        <main className="main-column">
          <TimeWindowRail />
          <InteractiveGlobe />
        </main>

        <aside className="sidebar right-sidebar">
          <Suspense fallback={<div className="panel panel-lite">Chargement Mind...</div>}>
            <MindPanel />
          </Suspense>
          <Suspense fallback={<div className="panel panel-lite">Chargement Causal...</div>}>
            <CausalGraphPanel />
          </Suspense>
          <Suspense fallback={<div className="panel panel-lite">Chargement Orion...</div>}>
            <OrionPanel />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
