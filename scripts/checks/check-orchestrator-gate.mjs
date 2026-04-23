import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const OUT_DIR = resolve(PROJECT_ROOT, ".tmp-run");
const OUT_FILE = resolve(OUT_DIR, "check-orchestrator-gate.json");
const BUILD_DIR = resolve(OUT_DIR, "check-orchestrator-build");

const CHECK_ENTRY_POINTS = [
  "src/atlas-mind/examples/run-p2-02-orchestrator-check.ts",
  "src/atlas-mind/examples/run-p2-04-three-route-check.ts",
  "src/atlas-mind/examples/run-p2-05-bounded-lot-check.ts",
  "src/atlas-mind/examples/run-p3-01-credit-system-check.ts",
  "src/atlas-mind/examples/run-p3-02-minimal-tribunal-check.ts"
];

mkdirSync(OUT_DIR, { recursive: true });

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

async function buildFreshCheckBundles(failures) {
  try {
    const { build } = await import("esbuild");
    rmSync(BUILD_DIR, { recursive: true, force: true });
    mkdirSync(BUILD_DIR, { recursive: true });

    await build({
      absWorkingDir: PROJECT_ROOT,
      entryPoints: CHECK_ENTRY_POINTS,
      outdir: BUILD_DIR,
      bundle: true,
      platform: "node",
      format: "esm",
      target: ["node20"],
      sourcemap: false,
      logLevel: "silent"
    });

    return {
      ok: true,
      status: "pass"
    };
  } catch (error) {
    const message = String(error?.message || error);
    const isEnvironmentFailure =
      /\bspawn\s+eperm\b/i.test(message) ||
      /\beperm\b/i.test(message) ||
      /\beacces\b/i.test(message) ||
      /\benoent\b/i.test(message) ||
      /\bnot recognized\b/i.test(message) ||
      /\bpermission denied\b/i.test(message);

    if (!isEnvironmentFailure) {
      failures.push(`Orchestrator gate: impossible de compiler les checks depuis src (${message}).`);
      return {
        ok: false,
        status: "fail_product",
        message
      };
    }

    return {
      ok: false,
      status: "fail_environment",
      message
    };
  }
}

async function importBuiltModule(fileName) {
  const moduleUrl = pathToFileURL(resolve(BUILD_DIR, fileName)).href;
  return import(`${moduleUrl}?t=${Date.now()}`);
}

async function runExportedCheck(fileName, exportedFunctionName) {
  const importedModule = await importBuiltModule(fileName);
  const exportedFunction = importedModule?.[exportedFunctionName];
  if (typeof exportedFunction !== "function") {
    throw new Error(`Export ${exportedFunctionName} introuvable dans ${fileName}.`);
  }
  return exportedFunction();
}

function buildFailureResult(failures, summary = {}) {
  const result = {
    ok: false,
    status: "fail_product",
    checkedAtIso: new Date().toISOString(),
    mode: "deterministic_src_bundle",
    summary,
    failures
  };

  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}

function buildEnvironmentResult(message) {
  const result = {
    ok: true,
    status: "fail_environment",
    checkedAtIso: new Date().toISOString(),
    mode: "deterministic_src_bundle",
    summary: {
      reason: "Orchestrator check bloque par environnement, pas de verdict produit negatif.",
      message
    },
    failures: []
  };

  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result));
}

async function main() {
  const failures = [];
  const summary = {};

  const built = await buildFreshCheckBundles(failures);
  if (!built.ok && built.status === "fail_environment") {
    buildEnvironmentResult(built.message);
    return;
  }

  if (!built.ok) {
    buildFailureResult(failures, summary);
    return;
  }

  try {
    const p202 = await runExportedCheck("run-p2-02-orchestrator-check.js", "runP202OrchestratorCheck");
    const cityDeltaC = Number(p202?.cityResult?.cycleResult?.signal?.context?.deltaC ?? Number.NaN);

    summary.p202 = {
      cityAccepted: Boolean(p202?.cityResult?.accepted),
      cityRoute: p202?.cityResult?.routedTo ?? null,
      citySource: p202?.cityResult?.cycleResult?.source ?? null,
      cityDecision: p202?.cityResult?.decision ?? null,
      cityDeltaC: Number.isFinite(cityDeltaC) ? cityDeltaC : null,
      signalDecision: p202?.signalResult?.decision ?? null
    };

    assertCondition(p202?.cityResult?.accepted === true, "P2-02: city ingress non accepte.", failures);
    assertCondition(
      p202?.cityResult?.routedTo === "p2-01.temperature-mini-cycle",
      "P2-02: route city inattendue.",
      failures
    );
    assertCondition(
      p202?.cityResult?.cycleResult?.source === "manual_signal",
      "P2-02: check non deterministe (source attendue: manual_signal).",
      failures
    );
    assertCondition(Number.isFinite(cityDeltaC), "P2-02: deltaC manquant ou non numerique sur city ingress.", failures);
    assertCondition(
      typeof p202?.signalResult?.decision === "string",
      "P2-02: decision manquante sur ingress signal.",
      failures
    );
    assertCondition(Array.isArray(p202?.decisionLogs) && p202.decisionLogs.length >= 2, "P2-02: logs insuffisants.", failures);
  } catch (error) {
    failures.push(`P2-02: execution check impossible (${String(error?.message || error)}).`);
  }

  try {
    const p204 = await runExportedCheck("run-p2-04-three-route-check.js", "runP204ThreeRouteCheck");
    summary.p204 = {
      anomalyRoute: p204?.anomalyResult?.routedTo ?? null,
      runtimeRoute: p204?.runtimeAvailabilityResult?.routedTo ?? null,
      dataQualityRoute: p204?.dataQualityResult?.routedTo ?? null
    };
    assertCondition(p204?.anomalyResult?.accepted === true, "P2-04: route anomalie non acceptee.", failures);
    assertCondition(
      p204?.anomalyResult?.routedTo === "p2-01.temperature-mini-cycle",
      "P2-04: routage anomalie invalide.",
      failures
    );
    assertCondition(
      p204?.runtimeAvailabilityResult?.routedTo === "p2-03.temperature-runtime-availability-cycle",
      "P2-04: routage runtime invalide.",
      failures
    );
    assertCondition(
      p204?.dataQualityResult?.routedTo === "p2-04.temperature-data-quality-cycle",
      "P2-04: routage data quality invalide.",
      failures
    );
    assertCondition(
      p204?.dataQualityResult?.cycleResult?.snapshot?.issueCode &&
        p204?.dataQualityResult?.cycleResult?.snapshot?.issueCode !== "unknown",
      "P2-04: issueCode data quality absent/unknown.",
      failures
    );
  } catch (error) {
    failures.push(`P2-04: execution check impossible (${String(error?.message || error)}).`);
  }

  try {
    const p205 = await runExportedCheck("run-p2-05-bounded-lot-check.js", "runP205BoundedLotCheck");
    const actionable = p205?.result?.actionable;
    const processedSignals = Number(p205?.result?.processedSignals ?? 0);
    const decisionCount = Array.isArray(p205?.result?.decisions) ? p205.result.decisions.length : 0;
    const actionableTotal =
      Number(actionable?.ignore ?? 0) +
      Number(actionable?.log ?? 0) +
      Number(actionable?.watch ?? 0) +
      Number(actionable?.flag ?? 0);

    summary.p205 = {
      processedSignals,
      decisionCount,
      actionableTotal,
      flags: Number(actionable?.flag ?? 0)
    };
    assertCondition(processedSignals === decisionCount, "P2-05: processedSignals != decisions.length.", failures);
    assertCondition(actionableTotal === decisionCount, "P2-05: total actionable incoherent.", failures);
    assertCondition(Number(actionable?.flag ?? 0) >= 1, "P2-05: aucune action FLAG detectee.", failures);
  } catch (error) {
    failures.push(`P2-05: execution check impossible (${String(error?.message || error)}).`);
  }

  try {
    const p301 = await runExportedCheck("run-p3-01-credit-system-check.js", "runP301CreditSystemCheck");
    summary.p301 = {
      standardGate: p301?.standardAcceptedResult?.credit?.gateDecision ?? null,
      refusedGate: p301?.standardRefusedResult?.credit?.gateDecision ?? null,
      urgentGate: p301?.urgentAcceptedResult?.credit?.gateDecision ?? null,
      load: p301?.creditSnapshot?.load ?? null
    };
    assertCondition(
      p301?.standardAcceptedResult?.credit?.gateDecision === "accepted",
      "P3-01: standard accepted gate invalide.",
      failures
    );
    assertCondition(
      p301?.standardRefusedResult?.accepted === false && p301?.standardRefusedResult?.credit?.gateDecision === "rejected",
      "P3-01: refus standard non detecte.",
      failures
    );
    assertCondition(
      p301?.urgentAcceptedResult?.credit?.gateDecision === "urgent_bypass",
      "P3-01: urgent bypass non respecte.",
      failures
    );
    assertCondition(
      Number(p301?.creditSnapshot?.load ?? 0) <= Number(p301?.creditSnapshot?.config?.maxLoad ?? 0),
      "P3-01: charge credit depasse maxLoad.",
      failures
    );
  } catch (error) {
    failures.push(`P3-01: execution check impossible (${String(error?.message || error)}).`);
  }

  try {
    const p302 = await runExportedCheck("run-p3-02-minimal-tribunal-check.js", "runP302MinimalTribunalCheck");
    summary.p302 = {
      contradictionDetected: Boolean(p302?.arbitration?.contradictionDetected),
      ruling: p302?.arbitration?.ruling ?? null,
      tribunalLogs: Array.isArray(p302?.tribunalLogs) ? p302.tribunalLogs.length : 0
    };
    assertCondition(Boolean(p302?.arbitration?.contradictionDetected), "P3-02: contradiction non detectee.", failures);
    assertCondition(
      ["accept", "revise", "reject"].includes(String(p302?.arbitration?.ruling ?? "")),
      "P3-02: ruling tribunal invalide.",
      failures
    );
    assertCondition(Array.isArray(p302?.tribunalLogs) && p302.tribunalLogs.length >= 1, "P3-02: logs tribunal absents.", failures);
  } catch (error) {
    failures.push(`P3-02: execution check impossible (${String(error?.message || error)}).`);
  }

  const result = {
    ok: failures.length === 0,
    status: failures.length === 0 ? "pass" : "fail_product",
    checkedAtIso: new Date().toISOString(),
    mode: "deterministic_src_bundle",
    summary,
    failures
  };

  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  buildFailureResult([String(error?.stack || error)]);
});
