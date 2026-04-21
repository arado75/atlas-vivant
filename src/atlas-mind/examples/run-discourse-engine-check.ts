import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary } from "../decision-global-summary";
import { clearDiscourseState } from "../decision-discourse-memory";
import { evaluateDiscourse } from "../decision-discourse-engine";
import { getReasonedFocusedSummaryText } from "../decision-focus-reason";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8 : decision === "watch" ? 3 : 1,
    anomalyThresholdC: 2,
    persistenceLevel:
      decision === "flag" ? "high" : decision === "watch" ? "medium" : decision === "log" ? "low" : "none",
    persistenceCount: decision === "flag" ? 3 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    weightedRecentScore: decision === "flag" ? 2.5 : decision === "watch" ? 1.4 : decision === "log" ? 0.8 : 0,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

function buildAlertLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "flag", startTs + 0),
    makeLog("Paris", "flag", startTs + 1),
    makeLog("Paris", "flag", startTs + 2),
    makeLog("Paris", "flag", startTs + 3),
    makeLog("Tokyo", "log", startTs + 4),
    makeLog("Lagos", "log", startTs + 5)
  ];
}

function buildWatchLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "ignore", startTs + 0),
    makeLog("Tokyo", "ignore", startTs + 1),
    makeLog("Lagos", "ignore", startTs + 2),
    makeLog("Sydney", "ignore", startTs + 3)
  ];
}

function buildOkLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "watch", startTs + 0),
    makeLog("Tokyo", "log", startTs + 1),
    makeLog("Lagos", "log", startTs + 2),
    makeLog("Sydney", "log", startTs + 3),
    makeLog("Mexico", "log", startTs + 4),
    makeLog("Cairo", "log", startTs + 5)
  ];
}

type ScenarioStep = {
  label: string;
  logs: DecisionLogEntry[];
};

function runLegacyPath(steps: ScenarioStep[]): string[] {
  clearDiscourseState();
  return steps.map((step) => getReasonedFocusedSummaryText(getGlobalSummary(step.logs), step.logs));
}

function runEnginePath(steps: ScenarioStep[]): string[] {
  clearDiscourseState();
  return steps.map((step) => evaluateDiscourse(getGlobalSummary(step.logs), step.logs).text);
}

/**
 * Test manuel R5:
 * - stable
 * - amelioration
 * - degradation
 * - oscillation
 * - silence/rappel
 */
export function runAtlasMindDiscourseEngineCheck() {
  const scenarios: Array<{ name: string; steps: ScenarioStep[] }> = [
    {
      name: "stable",
      steps: [{ label: "stable_1", logs: buildOkLogs(1_000) }]
    },
    {
      name: "improvement",
      steps: [
        { label: "improve_alert", logs: buildAlertLogs(2_000) },
        { label: "improve_watch", logs: buildWatchLogs(3_000) },
        { label: "improve_ok", logs: buildOkLogs(4_000) }
      ]
    },
    {
      name: "degradation",
      steps: [
        { label: "degrade_ok", logs: buildOkLogs(5_000) },
        { label: "degrade_watch", logs: buildWatchLogs(6_000) },
        { label: "degrade_alert", logs: buildAlertLogs(7_000) }
      ]
    },
    {
      name: "oscillation",
      steps: [
        { label: "osc_alert_1", logs: buildAlertLogs(8_000) },
        { label: "osc_watch", logs: buildWatchLogs(9_000) },
        { label: "osc_alert_2", logs: buildAlertLogs(10_000) }
      ]
    },
    {
      name: "silence_presence",
      steps: [
        { label: "emit", logs: buildAlertLogs(11_000) },
        { label: "silence_1", logs: buildAlertLogs(11_000) },
        { label: "silence_2", logs: buildAlertLogs(11_000) },
        { label: "presence_1", logs: buildAlertLogs(11_000) },
        { label: "blocked_1", logs: buildAlertLogs(11_000) },
        { label: "blocked_2", logs: buildAlertLogs(11_000) },
        { label: "presence_2", logs: buildAlertLogs(11_000) }
      ]
    }
  ];

  const report = scenarios.map((scenario) => {
    const legacy = runLegacyPath(scenario.steps);
    const engine = runEnginePath(scenario.steps);
    const equivalence = legacy.map((item, index) => item === engine[index]);

    console.log(`\\n[AtlasMind][DiscourseEngine][${scenario.name}]`);
    scenario.steps.forEach((step, index) => {
      console.log(`- ${step.label}`);
      console.log("  ancienne:", legacy[index]);
      console.log("  nouvelle:", engine[index]);
      console.log("  equivalence:", equivalence[index]);
    });

    return {
      name: scenario.name,
      equivalence,
      allEquivalent: equivalence.every(Boolean)
    };
  });

  return {
    report,
    allEquivalent: report.every((item) => item.allEquivalent)
  };
}
