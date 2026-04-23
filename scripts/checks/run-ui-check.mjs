import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TMP_DIR,
  classifyScriptRunDetailed,
  detectRunnerEnvironmentReadiness,
  readJsonIfExists,
  runNodeScript
} from "./check-runner-utils.mjs";

const OUT_FILE = resolve(TMP_DIR, "check-ui-runner.json");

const UI_STEPS = [
  {
    id: "phase1c_ui_headless",
    script: ".tmp-run/phase1c-ui-headless-check.mjs",
    artifact: ".tmp-run/phase1c-ui-headless-check.json",
    timeoutMs: 3 * 60 * 1000
  },
  {
    id: "phase1c_ui_proof",
    script: ".tmp-run/phase1c-ui-proof.mjs",
    artifact: ".tmp-run/phase1c-ui-proof.json",
    timeoutMs: 3 * 60 * 1000
  }
];

function summarizeStatus(runs) {
  if (runs.some((run) => run.status === "fail_product")) {
    return "fail_product";
  }

  if (runs.some((run) => run.status === "fail_environment")) {
    return "fail_environment";
  }

  if (runs.some((run) => run.status === "skip_environment")) {
    return "skip_environment";
  }

  return "pass";
}

function runStep(step) {
  const runResult = runNodeScript(step.script, step.timeoutMs);
  const artifact = readJsonIfExists(step.artifact);
  const classification = classifyScriptRunDetailed(runResult, artifact);

  return {
    id: step.id,
    script: step.script,
    artifactPath: step.artifact,
    status: classification.status,
    failureCode: classification.failureCode,
    exitCode: runResult.status,
    elapsedMs: runResult.elapsedMs,
    timedOut: runResult.timedOut,
    errorMessage: runResult.errorMessage,
    artifactOk: artifact?.ok === true,
    artifactError: typeof artifact?.error === "string" ? artifact.error : null
  };
}

function main() {
  const readiness = detectRunnerEnvironmentReadiness();
  const runs = readiness.ready
    ? UI_STEPS.map(runStep)
    : UI_STEPS.map((step) => ({
        id: step.id,
        script: step.script,
        artifactPath: step.artifact,
        status: readiness.status,
        failureCode: readiness.failureCode,
        skipped: true,
        skipReason: readiness.reason,
        exitCode: null,
        elapsedMs: 0,
        timedOut: false,
        errorMessage: readiness.detail,
        artifactOk: null,
        artifactError: null
      }));
  const status = readiness.ready ? summarizeStatus(runs) : readiness.status;

  const result = {
    ok: status !== "fail_product" && status !== "fail_environment",
    status,
    checkedAtIso: new Date().toISOString(),
    runnerEnvironment: readiness,
    runs
  };

  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result));

  if (status === "fail_product") {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const result = {
    ok: false,
    status: "fail_product",
    checkedAtIso: new Date().toISOString(),
    runs: [],
    error: String(error?.stack || error)
  };
  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}
