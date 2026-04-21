import { runTemperatureCheck } from "../orchestrator";
import { clearDecisionLogs, getRecentDecisionLogs } from "../decision-log";

/**
 * Test manuel v6:
 * - lance quelques checks
 * - recupere les dernieres entrees structurees du journal
 */
export async function runAtlasMindV6DecisionLogExample() {
  clearDecisionLogs();

  await runTemperatureCheck("Paris", { forceRefresh: true });
  await runTemperatureCheck("Tokyo");
  await runTemperatureCheck("Paris");

  const recent = getRecentDecisionLogs(5);
  console.log("[AtlasMind][DecisionLog] Recent entries:", recent);

  return recent;
}