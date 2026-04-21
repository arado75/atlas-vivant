import { create } from "zustand";
import { layerCatalog } from "../../data/mockCatalog";
import type { GraphMode, TimeMode, TimeWindowState } from "../../types/atlas";
import type { BrickDefinition } from "../../types/brick";
import {
  MIN_TIME_WINDOW_MS,
  TIME_DOMAIN_FUTURE_MS,
  TIME_DOMAIN_START_MS
} from "../../lib/time-domain";
import { clampNumber, sanitizeWindow } from "../../lib/time-engine";
import type { EpistemicLayerFilter } from "../../lib/epistemic-layer";
import {
  priorityRank,
  type MindAttentionEvent,
  type MindEpistemicStatus
} from "../../atlas-mind/attention-events";

export interface FocusedTemperatureCity {
  id: string;
  label: string;
  updatedAtMs: number;
}

export type MindPanelTristateBoolean = "unknown" | "yes" | "no";
export type MindPanelView = "pilotage" | "diagnostics";

export interface MindPanelState {
  panelView: MindPanelView;
  cityQuery: string;
  thresholdInput: string;
  runtimeAvailableInput: MindPanelTristateBoolean;
  runtimeFailuresInput: string;
  runtimeAgeInput: string;
  runtimeSourceInput: string;
  qualityIssueCodeInput: string;
  qualitySourceTypeInput: string;
  qualityDeltaInput: string;
  qualityRuntimeAvailableInput: MindPanelTristateBoolean;
}

export type SnapshotHypothesisStatus = "open" | "under_test" | "supported" | "contested" | "rejected";

export interface SnapshotInvestigationState {
  whatIsKnown: string;
  fragilePoints: string;
  hypothesis: string;
  hypothesisStatus: SnapshotHypothesisStatus;
  contestationNotes: string;
  epistemicStatus: MindEpistemicStatus;
  confidencePercent: number;
  version: number;
  updatedAtMs: number;
}

export type MultiScaleViewPreset = "planetary" | "systemic" | "regional" | "local";

const MAX_MIND_ATTENTION_EVENTS = 240;
const MIND_EVENT_DEDUP_WINDOW_MS = 4 * 60 * 1000;
const MAX_SCENE_SNAPSHOTS = 40;

export interface AtlasSceneSnapshot {
  id: string;
  label: string;
  createdAtMs: number;
  timeMode: TimeMode;
  compareEnabled: boolean;
  timeWindow: TimeWindowState;
  activeLayerIds: string[];
  selectedBrickId?: string;
  graphMode: GraphMode;
  focusNodeId: string;
  multiScaleViewPreset: MultiScaleViewPreset;
  epistemicLayerFilter: EpistemicLayerFilter;
  mindPanelState?: MindPanelState;
  investigation?: SnapshotInvestigationState;
}

const defaultMindPanelState: MindPanelState = {
  panelView: "pilotage",
  cityQuery: "Paris",
  thresholdInput: "2",
  runtimeAvailableInput: "unknown",
  runtimeFailuresInput: "0",
  runtimeAgeInput: "0",
  runtimeSourceInput: "atlas-vivant.runtime.temperature",
  qualityIssueCodeInput: "source_type_incoherent",
  qualitySourceTypeInput: "open-meteo",
  qualityDeltaInput: "0",
  qualityRuntimeAvailableInput: "unknown"
};

export function buildDefaultSnapshotInvestigationState(createdAtMs: number): SnapshotInvestigationState {
  return {
    whatIsKnown: "",
    fragilePoints: "",
    hypothesis: "",
    hypothesisStatus: "open",
    contestationNotes: "",
    epistemicStatus: "observation",
    confidencePercent: 50,
    version: 1,
    updatedAtMs: createdAtMs
  };
}

export function resolveSnapshotInvestigationState(snapshot: AtlasSceneSnapshot): SnapshotInvestigationState {
  const defaults = buildDefaultSnapshotInvestigationState(snapshot.createdAtMs);
  if (!snapshot.investigation) {
    return defaults;
  }

  const boundedConfidence = clampNumber(snapshot.investigation.confidencePercent, 0, 100);
  return {
    ...defaults,
    ...snapshot.investigation,
    confidencePercent: boundedConfidence
  };
}

interface AtlasState {
  currentStep: number;
  isPlaying: boolean;
  trailLength: number;
  playbackDelay: number;
  timeMode: TimeMode;
  compareEnabled: boolean;
  timeWindow: TimeWindowState;
  activeLayers: Record<string, boolean>;
  bricks: BrickDefinition[];
  brickErrors: string[];
  selectedBrickId?: string;
  focusedTemperatureCity: FocusedTemperatureCity | null;
  mindAttentionEvents: MindAttentionEvent[];
  multiScaleViewPreset: MultiScaleViewPreset;
  epistemicLayerFilter: EpistemicLayerFilter;
  mindPanelState: MindPanelState;
  sceneSnapshots: AtlasSceneSnapshot[];
  graphMode: GraphMode;
  focusNodeId: string;
  setCurrentStep: (step: number) => void;
  tick: () => void;
  setPlaying: (playing: boolean) => void;
  setTrailLength: (trailLength: number) => void;
  setPlaybackDelay: (playbackDelay: number) => void;
  setTimeMode: (mode: TimeMode) => void;
  setCompareEnabled: (enabled: boolean) => void;
  setTimeWindowStart: (startMs: number) => void;
  setTimeWindowEnd: (endMs: number) => void;
  setTimeWindowRange: (startMs: number, endMs: number) => void;
  setRightEdgeLockedToNow: (locked: boolean) => void;
  syncTimeWindowToNow: (nowMs?: number) => void;
  toggleLayer: (layerId: string) => void;
  loadBricks: (bricks: BrickDefinition[], errors: string[]) => void;
  selectBrick: (brickId?: string) => void;
  clearSelection: () => void;
  addProposalBrick: (brick: BrickDefinition) => void;
  setGraphMode: (mode: GraphMode) => void;
  setFocusNodeId: (nodeId: string) => void;
  setFocusedTemperatureCity: (city: FocusedTemperatureCity | null) => void;
  pushMindAttentionEvent: (event: MindAttentionEvent) => void;
  clearMindAttentionEvents: () => void;
  setMultiScaleViewPreset: (preset: MultiScaleViewPreset) => void;
  setEpistemicLayerFilter: (filter: EpistemicLayerFilter) => void;
  updateMindPanelState: (partial: Partial<MindPanelState>) => void;
  updateSceneSnapshotInvestigation: (
    snapshotId: string,
    partial: Partial<Omit<SnapshotInvestigationState, "version" | "updatedAtMs">>
  ) => void;
  createSceneSnapshot: (label?: string) => void;
  restoreSceneSnapshot: (snapshotId: string) => void;
  deleteSceneSnapshot: (snapshotId: string) => void;
  clearSceneSnapshots: () => void;
}

const initialActiveLayers = Object.fromEntries(
  layerCatalog.map((layer) => [layer.id, layer.visibleByDefault])
);

const layerByBrickId = Object.fromEntries(layerCatalog.map((layer) => [layer.brickId, layer.id]));

const graphNodeByBrickId: Record<string, string> = {
  wind_patterns: "wind_patterns",
  ocean_currents: "ocean_temperature",
  biosphere_migrations: "krill_density",
  healthy_life_expectancy: "fish_price",
  surface_temperature: "ocean_temperature",
  aviation_routes: "fishing_pressure",
  maritime_routes: "fish_abundance"
};

function modeToDelay(mode: TimeMode): number {
  switch (mode) {
    case "paused":
      return 1200;
    case "realtime":
      return 1350;
    case "accelerated":
      return 440;
  }
}

function defaultSnapshotLabel(createdAtMs: number): string {
  const stamp = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(createdAtMs));
  return `Snapshot ${stamp}`;
}

const initialNowMs = Date.now();
const initialTimeWindow: TimeWindowState = {
  startMs: Math.max(TIME_DOMAIN_START_MS, initialNowMs - MIN_TIME_WINDOW_MS),
  endMs: initialNowMs,
  rightEdgeLockedToNow: true
};

export const useAtlasStore = create<AtlasState>((set) => ({
  currentStep: 0,
  isPlaying: true,
  trailLength: 4,
  playbackDelay: modeToDelay("realtime"),
  timeMode: "realtime",
  compareEnabled: false,
  timeWindow: initialTimeWindow,
  activeLayers: initialActiveLayers,
  bricks: [],
  brickErrors: [],
  selectedBrickId: undefined,
  focusedTemperatureCity: null,
  mindAttentionEvents: [],
  multiScaleViewPreset: "planetary",
  epistemicLayerFilter: "all",
  mindPanelState: defaultMindPanelState,
  sceneSnapshots: [],
  graphMode: "root",
  focusNodeId: "fish_price",
  setCurrentStep: (step) =>
    set({
      currentStep: Math.max(0, Math.min(step, 11)),
      timeMode: "paused",
      isPlaying: false
    }),
  tick: () =>
    set((state) => ({
      currentStep: (state.currentStep + 1) % 12
    })),
  setPlaying: (playing) =>
    set((state) => ({
      isPlaying: playing,
      timeMode: playing ? (state.timeMode === "paused" ? "realtime" : state.timeMode) : "paused",
      playbackDelay: modeToDelay(playing ? (state.timeMode === "paused" ? "realtime" : state.timeMode) : "paused")
    })),
  setTrailLength: (trailLength) => set({ trailLength }),
  setPlaybackDelay: (playbackDelay) => set({ playbackDelay }),
  setTimeMode: (mode) =>
    set({
      timeMode: mode,
      isPlaying: mode !== "paused",
      playbackDelay: modeToDelay(mode)
    }),
  setCompareEnabled: (enabled) => set({ compareEnabled: enabled }),
  setTimeWindowStart: (startMs) =>
    set((state) => {
      const nowMs = Date.now();
      const forcedEndMs = state.timeWindow.rightEdgeLockedToNow ? nowMs : state.timeWindow.endMs;
      const boundedStartMs = clampNumber(
        startMs,
        TIME_DOMAIN_START_MS,
        forcedEndMs - MIN_TIME_WINDOW_MS
      );

      const nextWindow = sanitizeWindow(
        {
          ...state.timeWindow,
          startMs: boundedStartMs,
          endMs: forcedEndMs
        },
        nowMs
      );

      return {
        timeWindow: nextWindow
      };
    }),
  setTimeWindowEnd: (endMs) =>
    set((state) => {
      const nowMs = Date.now();
      const boundedEndMs = clampNumber(
        endMs,
        state.timeWindow.startMs + MIN_TIME_WINDOW_MS,
        nowMs + TIME_DOMAIN_FUTURE_MS
      );

      const nextWindow = sanitizeWindow(
        {
          ...state.timeWindow,
          endMs: boundedEndMs,
          rightEdgeLockedToNow: false
        },
        nowMs
      );

      return {
        timeWindow: nextWindow
      };
    }),
  setTimeWindowRange: (startMs, endMs) =>
    set((state) => {
      const nowMs = Date.now();
      const nextWindow = sanitizeWindow(
        {
          ...state.timeWindow,
          startMs,
          endMs,
          rightEdgeLockedToNow: false
        },
        nowMs
      );

      return {
        timeWindow: nextWindow
      };
    }),
  setRightEdgeLockedToNow: (locked) =>
    set((state) => {
      if (!locked) {
        return {
          timeWindow: {
            ...state.timeWindow,
            rightEdgeLockedToNow: false
          }
        };
      }

      const nowMs = Date.now();
      const currentDurationMs = state.timeWindow.endMs - state.timeWindow.startMs;
      const boundedDurationMs = clampNumber(
        currentDurationMs,
        MIN_TIME_WINDOW_MS,
        nowMs - TIME_DOMAIN_START_MS
      );

      return {
        timeWindow: {
          startMs: nowMs - boundedDurationMs,
          endMs: nowMs,
          rightEdgeLockedToNow: true
        }
      };
    }),
  syncTimeWindowToNow: (nowMs = Date.now()) =>
    set((state) => {
      if (!state.timeWindow.rightEdgeLockedToNow) {
        return state;
      }

      const currentDurationMs = state.timeWindow.endMs - state.timeWindow.startMs;
      const boundedDurationMs = clampNumber(
        currentDurationMs,
        MIN_TIME_WINDOW_MS,
        nowMs - TIME_DOMAIN_START_MS
      );

      return {
        timeWindow: {
          ...state.timeWindow,
          startMs: nowMs - boundedDurationMs,
          endMs: nowMs
        }
      };
    }),
  toggleLayer: (layerId) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layerId]: !state.activeLayers[layerId]
      }
    })),
  loadBricks: (bricks, errors) =>
    set((state) => {
      const proposals = state.bricks.filter((brick) => brick.origin === "proposal");
      const merged = [
        ...bricks,
        ...proposals.filter((proposal) => !bricks.some((brick) => brick.id === proposal.id))
      ];
      return {
        bricks: merged,
        brickErrors: errors,
        selectedBrickId: state.selectedBrickId ?? merged[0]?.id
      };
    }),
  selectBrick: (brickId) =>
    set((state) => {
      if (!brickId) {
        return { selectedBrickId: undefined };
      }

      const layerId = layerByBrickId[brickId];
      const graphNodeId = graphNodeByBrickId[brickId];

      return {
        selectedBrickId: brickId,
        activeLayers: layerId
          ? {
              ...state.activeLayers,
              [layerId]: true
            }
          : state.activeLayers,
        focusNodeId: graphNodeId ?? state.focusNodeId
      };
    }),
  clearSelection: () => set({ selectedBrickId: undefined }),
  addProposalBrick: (brick) =>
    set((state) => {
      const others = state.bricks.filter((entry) => entry.id !== brick.id);
      return {
        bricks: [brick, ...others],
        selectedBrickId: brick.id
      };
    }),
  setGraphMode: (mode) => set({ graphMode: mode }),
  setFocusNodeId: (nodeId) => set({ focusNodeId: nodeId }),
  setFocusedTemperatureCity: (city) => set({ focusedTemperatureCity: city }),
  pushMindAttentionEvent: (event) =>
    set((state) => {
      let matchedIndex = -1;
      for (let index = state.mindAttentionEvents.length - 1; index >= 0; index -= 1) {
        const current = state.mindAttentionEvents[index];
        if (current.dedupeKey !== event.dedupeKey) {
          continue;
        }

        if (event.lastSeenAtMs - current.lastSeenAtMs <= MIND_EVENT_DEDUP_WINDOW_MS) {
          matchedIndex = index;
        }
        break;
      }

      if (matchedIndex >= 0) {
        const current = state.mindAttentionEvents[matchedIndex];
        const updatedEvent: MindAttentionEvent = {
          ...current,
          lastSeenAtMs: event.lastSeenAtMs,
          createdAtMs: event.lastSeenAtMs,
          ingressId: event.ingressId,
          repeatCount: current.repeatCount + 1,
          summary: event.summary,
          confidence: Math.max(current.confidence, event.confidence),
          priority:
            priorityRank(event.priority) > priorityRank(current.priority)
              ? event.priority
              : current.priority
        };

        const nextEvents = [...state.mindAttentionEvents];
        nextEvents[matchedIndex] = updatedEvent;
        return {
          mindAttentionEvents: nextEvents
        };
      }

      return {
        mindAttentionEvents: [...state.mindAttentionEvents, event].slice(-MAX_MIND_ATTENTION_EVENTS)
      };
    }),
  clearMindAttentionEvents: () => set({ mindAttentionEvents: [] }),
  setMultiScaleViewPreset: (preset) => set({ multiScaleViewPreset: preset }),
  setEpistemicLayerFilter: (filter) => set({ epistemicLayerFilter: filter }),
  updateMindPanelState: (partial) =>
    set((state) => ({
      mindPanelState: {
        ...state.mindPanelState,
        ...partial
      }
    })),
  updateSceneSnapshotInvestigation: (snapshotId, partial) =>
    set((state) => {
      const nextSnapshots = state.sceneSnapshots.map((snapshot) => {
        if (snapshot.id !== snapshotId) {
          return snapshot;
        }

        const current = resolveSnapshotInvestigationState(snapshot);
        const next: SnapshotInvestigationState = {
          ...current,
          ...partial
        };

        const changed = (
          Object.keys(partial) as Array<keyof Omit<SnapshotInvestigationState, "version" | "updatedAtMs">>
        ).some((key) => next[key] !== current[key]);

        if (!changed) {
          return snapshot;
        }

        return {
          ...snapshot,
          investigation: {
            ...next,
            confidencePercent: clampNumber(next.confidencePercent, 0, 100),
            version: current.version + 1,
            updatedAtMs: Date.now()
          }
        };
      });

      return {
        sceneSnapshots: nextSnapshots
      };
    }),
  createSceneSnapshot: (label) =>
    set((state) => {
      const createdAtMs = Date.now();
      const cleanLabel = typeof label === "string" && label.trim().length > 0 ? label.trim() : defaultSnapshotLabel(createdAtMs);
      const activeLayerIds = Object.entries(state.activeLayers)
        .filter(([, isActive]) => isActive)
        .map(([layerId]) => layerId);
      const snapshot: AtlasSceneSnapshot = {
        id: `scene-snapshot:${createdAtMs}:${Math.random().toString(36).slice(2, 8)}`,
        label: cleanLabel,
        createdAtMs,
        timeMode: state.timeMode,
        compareEnabled: state.compareEnabled,
        timeWindow: { ...state.timeWindow },
        activeLayerIds,
        selectedBrickId: state.selectedBrickId,
        graphMode: state.graphMode,
        focusNodeId: state.focusNodeId,
        multiScaleViewPreset: state.multiScaleViewPreset,
        epistemicLayerFilter: state.epistemicLayerFilter,
        mindPanelState: { ...state.mindPanelState },
        investigation: buildDefaultSnapshotInvestigationState(createdAtMs)
      };
      return {
        sceneSnapshots: [...state.sceneSnapshots, snapshot].slice(-MAX_SCENE_SNAPSHOTS)
      };
    }),
  restoreSceneSnapshot: (snapshotId) =>
    set((state) => {
      const snapshot = state.sceneSnapshots.find((entry) => entry.id === snapshotId);
      if (!snapshot) {
        return state;
      }

      const restoredActiveLayers = Object.fromEntries(
        layerCatalog.map((layer) => [layer.id, snapshot.activeLayerIds.includes(layer.id)])
      );

      const selectedLayerId = snapshot.selectedBrickId ? layerByBrickId[snapshot.selectedBrickId] : undefined;
      if (selectedLayerId) {
        restoredActiveLayers[selectedLayerId] = true;
      }

      return {
        timeMode: snapshot.timeMode,
        compareEnabled: snapshot.compareEnabled,
        timeWindow: { ...snapshot.timeWindow },
        activeLayers: restoredActiveLayers,
        selectedBrickId: snapshot.selectedBrickId,
        graphMode: snapshot.graphMode,
        focusNodeId: snapshot.focusNodeId,
        multiScaleViewPreset: snapshot.multiScaleViewPreset ?? state.multiScaleViewPreset,
        epistemicLayerFilter: snapshot.epistemicLayerFilter ?? state.epistemicLayerFilter,
        mindPanelState: snapshot.mindPanelState
          ? {
              ...defaultMindPanelState,
              ...snapshot.mindPanelState
            }
          : state.mindPanelState
      };
    }),
  deleteSceneSnapshot: (snapshotId) =>
    set((state) => ({
      sceneSnapshots: state.sceneSnapshots.filter((entry) => entry.id !== snapshotId)
    })),
  clearSceneSnapshots: () => set({ sceneSnapshots: [] })
}));
