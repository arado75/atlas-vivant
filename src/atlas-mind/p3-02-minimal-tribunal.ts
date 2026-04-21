import type { MindBoundedLotResult } from "./p2-05-bounded-lot";

export type TribunalRuling = "accept" | "revise" | "reject";

export interface TribunalPosition {
  role: "builder" | "critic";
  ingressId: string;
  routedTo: string;
  signalType: string;
  decision: "ignore" | "log" | "watch" | "flag";
  priority: "low" | "medium" | "high";
  reason: string;
}

export interface TribunalArbitration {
  lotId: string;
  timestampMs: number;
  contradictionDetected: boolean;
  contradictionType: "severity_gap" | "none";
  builder: TribunalPosition | null;
  critic: TribunalPosition | null;
  ruling: TribunalRuling;
  priority: "low" | "medium" | "high";
  reason: string;
}

const MAX_TRIBUNAL_LOGS = 200;
const tribunalLogs: TribunalArbitration[] = [];

function decisionWeight(decision: "ignore" | "log" | "watch" | "flag"): number {
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

function priorityWeight(priority: "low" | "medium" | "high"): number {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function pickHigherPriority(
  a: "low" | "medium" | "high",
  b: "low" | "medium" | "high"
): "low" | "medium" | "high" {
  return priorityWeight(a) >= priorityWeight(b) ? a : b;
}

function toPosition(
  role: "builder" | "critic",
  output: MindBoundedLotResult["decisions"][number]
): TribunalPosition {
  return {
    role,
    ingressId: output.ingressId,
    routedTo: output.routedTo,
    signalType: output.cycleResult?.signal?.kind ?? output.routedTo,
    decision: output.decision,
    priority: output.priority,
    reason: output.reason
  };
}

function pickBuilder(result: MindBoundedLotResult): TribunalPosition | null {
  const firstAccepted = result.decisions.find((decision) => decision.accepted);
  return firstAccepted ? toPosition("builder", firstAccepted) : null;
}

function isCriticRoute(route: string): boolean {
  return route === "p2-03.temperature-runtime-availability-cycle" || route === "p2-04.temperature-data-quality-cycle";
}

function pickCritic(result: MindBoundedLotResult, builder: TribunalPosition | null): TribunalPosition | null {
  const candidates = result.decisions
    .filter((decision) => decision.accepted)
    .filter((decision) => isCriticRoute(decision.routedTo))
    .filter((decision) => (builder ? decision.ingressId !== builder.ingressId : true));

  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates
    .slice()
    .sort((a, b) => {
      const byDecision = decisionWeight(b.decision) - decisionWeight(a.decision);
      if (byDecision !== 0) {
        return byDecision;
      }

      const byPriority = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (byPriority !== 0) {
        return byPriority;
      }

      return a.ingressId.localeCompare(b.ingressId);
    })[0];

  return toPosition("critic", selected);
}

function appendTribunalLog(entry: TribunalArbitration): void {
  tribunalLogs.push(entry);

  if (tribunalLogs.length > MAX_TRIBUNAL_LOGS) {
    tribunalLogs.splice(0, tribunalLogs.length - MAX_TRIBUNAL_LOGS);
  }
}

export function runP302MinimalTribunal(result: MindBoundedLotResult): TribunalArbitration {
  const builder = pickBuilder(result);
  const critic = pickCritic(result, builder);

  if (!builder || !critic) {
    const arbitration: TribunalArbitration = {
      lotId: result.lotId,
      timestampMs: Date.now(),
      contradictionDetected: false,
      contradictionType: "none",
      builder,
      critic,
      ruling: "accept",
      priority: builder?.priority ?? "low",
      reason: "Pas de contradiction exploitable: proposition acceptee."
    };

    appendTribunalLog(arbitration);
    return arbitration;
  }

  const gap = Math.abs(decisionWeight(builder.decision) - decisionWeight(critic.decision));
  const contradictionDetected = gap >= 2;

  if (!contradictionDetected) {
    const arbitration: TribunalArbitration = {
      lotId: result.lotId,
      timestampMs: Date.now(),
      contradictionDetected: false,
      contradictionType: "none",
      builder,
      critic,
      ruling: "accept",
      priority: builder.priority,
      reason: "Positions compatibles: proposition acceptee."
    };

    appendTribunalLog(arbitration);
    return arbitration;
  }

  const builderWeight = decisionWeight(builder.decision);
  const criticWeight = decisionWeight(critic.decision);

  let ruling: TribunalRuling = "revise";
  let priority: "low" | "medium" | "high" = pickHigherPriority(builder.priority, critic.priority);
  let reason = "Contradiction detectee: proposition revisee avec reserve critique.";

  if (builderWeight <= 2 && criticWeight >= 4) {
    ruling = "reject";
    priority = critic.priority;
    reason = "Contradiction critique: proposition initiale rejetee.";
  }

  const arbitration: TribunalArbitration = {
    lotId: result.lotId,
    timestampMs: Date.now(),
    contradictionDetected: true,
    contradictionType: "severity_gap",
    builder,
    critic,
    ruling,
    priority,
    reason
  };

  appendTribunalLog(arbitration);
  return arbitration;
}

export function getRecentP302TribunalLogs(limit = 20): TribunalArbitration[] {
  const safeLimit = Math.max(0, Math.min(limit, MAX_TRIBUNAL_LOGS));
  if (safeLimit === 0) {
    return [];
  }

  return tribunalLogs.slice(-safeLimit);
}

export function clearP302TribunalLogs(): void {
  tribunalLogs.length = 0;
}