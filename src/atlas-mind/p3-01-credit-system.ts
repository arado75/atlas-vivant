export type CreditType = "standard" | "priority" | "urgent";

export type CreditGateDecision = "accepted" | "degraded" | "rejected" | "urgent_bypass";

export interface CreditGateOutcome {
  accepted: boolean;
  requestedType: CreditType;
  appliedType: CreditType;
  cost: number;
  gateDecision: CreditGateDecision;
  reason: string;
  loadBefore: number;
  loadAfter: number;
}

export interface CreditGateLogEntry extends CreditGateOutcome {
  timestampMs: number;
}

export interface CreditSystemConfig {
  maxWindow: number;
  maxLoad: number;
  costs: Record<CreditType, number>;
}

const creditConfig: CreditSystemConfig = {
  maxWindow: 6,
  maxLoad: 3,
  costs: {
    standard: 1,
    priority: 2,
    urgent: 3
  }
};

const recentAppliedCosts: number[] = [];
const creditLogs: CreditGateLogEntry[] = [];

function pushAppliedCost(cost: number): void {
  recentAppliedCosts.push(cost);
  if (recentAppliedCosts.length > creditConfig.maxWindow) {
    recentAppliedCosts.splice(0, recentAppliedCosts.length - creditConfig.maxWindow);
  }
}

function appendCreditLog(entry: CreditGateLogEntry): void {
  creditLogs.push(entry);

  if (creditLogs.length > 200) {
    creditLogs.splice(0, creditLogs.length - 200);
  }
}

function getCurrentLoad(): number {
  return recentAppliedCosts.reduce((sum, cost) => sum + cost, 0);
}

function toCreditType(type: CreditType | undefined): CreditType {
  return type ?? "standard";
}

export function consumeIngressCredit(requestedType?: CreditType): CreditGateOutcome {
  const requested = toCreditType(requestedType);
  const loadBefore = getCurrentLoad();

  const result: CreditGateOutcome = {
    accepted: false,
    requestedType: requested,
    appliedType: requested,
    cost: 0,
    gateDecision: "rejected",
    reason: "Flux refuse: surcharge en cours.",
    loadBefore,
    loadAfter: loadBefore
  };

  if (requested === "urgent") {
    result.accepted = true;
    result.appliedType = "urgent";
    result.cost = creditConfig.costs.urgent;
    result.gateDecision = "urgent_bypass";
    result.reason = "Flux urgent accepte (bypass anti-bruit).";
    result.loadAfter = loadBefore;

    pushAppliedCost(0);
    appendCreditLog({
      timestampMs: Date.now(),
      ...result
    });

    return result;
  }

  const requestedCost = creditConfig.costs[requested];
  if (loadBefore + requestedCost <= creditConfig.maxLoad) {
    result.accepted = true;
    result.appliedType = requested;
    result.cost = requestedCost;
    result.gateDecision = "accepted";
    result.reason = `Flux ${requested} accepte.`;

    pushAppliedCost(requestedCost);
    result.loadAfter = getCurrentLoad();
    appendCreditLog({
      timestampMs: Date.now(),
      ...result
    });

    return result;
  }

  if (requested === "priority") {
    const degradedCost = creditConfig.costs.standard;
    if (loadBefore + degradedCost <= creditConfig.maxLoad) {
      result.accepted = true;
      result.appliedType = "standard";
      result.cost = degradedCost;
      result.gateDecision = "degraded";
      result.reason = "Flux priority degrade en standard pour limiter le bruit.";

      pushAppliedCost(degradedCost);
      result.loadAfter = getCurrentLoad();
      appendCreditLog({
        timestampMs: Date.now(),
        ...result
      });

      return result;
    }
  }

  pushAppliedCost(0);
  result.loadAfter = getCurrentLoad();
  appendCreditLog({
    timestampMs: Date.now(),
    ...result
  });
  return result;
}

export function getRecentCreditGateLogs(limit = 20): CreditGateLogEntry[] {
  const safeLimit = Math.max(0, Math.min(limit, 200));
  if (safeLimit === 0) {
    return [];
  }

  return creditLogs.slice(-safeLimit);
}

export function getCreditSystemSnapshot(): {
  config: CreditSystemConfig;
  load: number;
  recentAppliedCosts: number[];
} {
  return {
    config: creditConfig,
    load: getCurrentLoad(),
    recentAppliedCosts: recentAppliedCosts.slice()
  };
}

export function clearCreditSystemState(): void {
  recentAppliedCosts.length = 0;
  creditLogs.length = 0;
}