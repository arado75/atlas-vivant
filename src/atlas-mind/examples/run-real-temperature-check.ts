import { runTemperatureCheck } from "../orchestrator";

/**
 * Point d'entree manuel Atlas Mind v1.
 * Pas de boucle, pas de scheduler.
 */
export async function runAtlasMindV1RealFlowExample() {
  const paris = await runTemperatureCheck("Paris", { forceRefresh: true });
  const tokyo = await runTemperatureCheck("Tokyo");

  return {
    paris,
    tokyo
  };
}
