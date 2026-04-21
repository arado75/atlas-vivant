import {
  runMindP202Orchestrator,
  type MindIngressSignal,
  type MindOrchestrationOutput
} from "./p2-02-orchestrator";

export interface MindBoundedLotInput {
  lotId: string;
  source: string;
  createdAtMs: number;
  signals: MindIngressSignal[];
}

export interface MindBoundedLotActionItem {
  ingressId: string;
  signalType: string;
  action: "ignore" | "log" | "watch" | "flag";
  priority: "low" | "medium" | "high";
  reason: string;
}

export interface MindBoundedLotActionableSummary {
  ignore: number;
  log: number;
  watch: number;
  flag: number;
  toPrioritize: MindBoundedLotActionItem[];
}

export interface MindBoundedLotResult {
  lotId: string;
  source: string;
  createdAtMs: number;
  processedAtMs: number;
  totalSignals: number;
  processedSignals: number;
  decisions: MindOrchestrationOutput[];
  actionable: MindBoundedLotActionableSummary;
}

const MAX_LOT_HISTORY = 100;
const lotHistory: MindBoundedLotResult[] = [];

function getDecisionWeight(decision: "ignore" | "log" | "watch" | "flag"): number {
  switch (decision) {
    case "flag":
      return 4;
    case "watch":
      return 3;
    case "log":
      return 2;
    default:
      return 1;
  }
}

function getPriorityWeight(priority: "low" | "medium" | "high"): number {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function toActionItem(output: MindOrchestrationOutput): MindBoundedLotActionItem {
  return {
    ingressId: output.ingressId,
    signalType: output.cycleResult?.signal?.kind ?? output.routedTo,
    action: output.decision,
    priority: output.priority,
    reason: output.reason
  };
}

function buildActionableSummary(decisions: MindOrchestrationOutput[]): MindBoundedLotActionableSummary {
  const items = decisions.map(toActionItem);
  const ignore = items.filter((item) => item.action === "ignore").length;
  const log = items.filter((item) => item.action === "log").length;
  const watch = items.filter((item) => item.action === "watch").length;
  const flag = items.filter((item) => item.action === "flag").length;

  const toPrioritize = items
    .slice()
    .sort((a, b) => {
      const byDecision = getDecisionWeight(b.action) - getDecisionWeight(a.action);
      if (byDecision !== 0) {
        return byDecision;
      }

      const byPriority = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
      if (byPriority !== 0) {
        return byPriority;
      }

      return a.ingressId.localeCompare(b.ingressId);
    });

  return {
    ignore,
    log,
    watch,
    flag,
    toPrioritize
  };
}

function appendLotHistory(result: MindBoundedLotResult): void {
  lotHistory.push(result);

  if (lotHistory.length > MAX_LOT_HISTORY) {
    lotHistory.splice(0, lotHistory.length - MAX_LOT_HISTORY);
  }
}

export async function runP205BoundedLot(input: MindBoundedLotInput): Promise<MindBoundedLotResult> {
  const decisions: MindOrchestrationOutput[] = [];

  for (const signal of input.signals) {
    const decision = await runMindP202Orchestrator(signal);
    decisions.push(decision);
  }

  const result: MindBoundedLotResult = {
    lotId: input.lotId,
    source: input.source,
    createdAtMs: input.createdAtMs,
    processedAtMs: Date.now(),
    totalSignals: input.signals.length,
    processedSignals: decisions.length,
    decisions,
    actionable: buildActionableSummary(decisions)
  };

  appendLotHistory(result);
  return result;
}

export function getRecentP205LotResults(limit = 20): MindBoundedLotResult[] {
  const safeLimit = Math.max(0, Math.min(limit, MAX_LOT_HISTORY));
  if (safeLimit === 0) {
    return [];
  }

  return lotHistory.slice(-safeLimit);
}

export function clearP205LotResults(): void {
  lotHistory.length = 0;
}