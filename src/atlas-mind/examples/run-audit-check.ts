import { runTemperatureCheck } from "../orchestrator";
import { appendDecisionLog, clearDecisionLogs } from "../decision-log";
import { getSystemAudit, getSystemAuditText } from "../decision-auditor";

/**
 * Test manuel v9:
 * - alimente le decision log
 * - produit un pre-audit simple
 */
export async function runAtlasMindV9AuditExample() {
  clearDecisionLogs();

  await runTemperatureCheck("Paris", { forceRefresh: true, thresholdC: 0.5 });
  await runTemperatureCheck("Tokyo", { thresholdC: 0.5 });
  await runTemperatureCheck("Paris", { thresholdC: 2 });
  await runTemperatureCheck("Mexico", { thresholdC: 0.5 });

  // Fallback de demonstration pour garantir un cas auditable meme hors reseau.
  appendDecisionLog({
    timestampMs: Date.now() - 3,
    city: "Paris",
    cityId: "paris",
    deltaC: 8.2,
    anomalyThresholdC: 2,
    persistenceLevel: "high",
    persistenceCount: 3,
    weightedRecentScore: 2.1,
    evaluations: [],
    score: 4,
    decision: "flag",
    reason: "Exemple v9: flag de demonstration."
  });

  appendDecisionLog({
    timestampMs: Date.now() - 2,
    city: "Paris",
    cityId: "paris",
    deltaC: 7.9,
    anomalyThresholdC: 2,
    persistenceLevel: "high",
    persistenceCount: 3,
    weightedRecentScore: 2,
    evaluations: [],
    score: 4,
    decision: "flag",
    reason: "Exemple v9: flag de demonstration (concentration)."
  });

  appendDecisionLog({
    timestampMs: Date.now() - 1,
    city: "Tokyo",
    cityId: "tokyo",
    deltaC: 2.5,
    anomalyThresholdC: 2,
    persistenceLevel: "medium",
    persistenceCount: 2,
    weightedRecentScore: 1.3,
    evaluations: [],
    score: 2,
    decision: "watch",
    reason: "Exemple v9: watch de demonstration."
  });

  const audit = getSystemAudit();
  const auditText = getSystemAuditText(audit);

  console.log("[AtlasMind][Audit] Structured:", audit);
  console.log("[AtlasMind][Audit] Text:", auditText);

  return {
    audit,
    auditText
  };
}