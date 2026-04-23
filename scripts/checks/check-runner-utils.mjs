import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const PROJECT_ROOT = process.cwd();
export const TMP_DIR = resolve(PROJECT_ROOT, ".tmp-run");

mkdirSync(TMP_DIR, { recursive: true });

const ENVIRONMENT_FAILURE_PATTERNS = [
  { pattern: /\bspawn\s+eperm\b/i, code: "spawn_eperm" },
  { pattern: /\beperm\b/i, code: "eperm" },
  { pattern: /\beacces\b/i, code: "eacces" },
  { pattern: /\benoent\b/i, code: "enoent" },
  { pattern: /\bcommand not found\b/i, code: "command_not_found" },
  { pattern: /\bnot recognized\b/i, code: "not_recognized" },
  { pattern: /\bpermission denied\b/i, code: "permission_denied" }
];

export function readJsonIfExists(relativePath) {
  const absolutePath = resolve(PROJECT_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

export function classifyFailureText(text) {
  return classifyFailureInfo(text).status;
}

export function classifyFailureInfo(text) {
  if (!text || typeof text !== "string") {
    return {
      status: "fail_product",
      failureCode: "unknown"
    };
  }

  for (const { pattern, code } of ENVIRONMENT_FAILURE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        status: "fail_environment",
        failureCode: code
      };
    }
  }

  return {
    status: "fail_product",
    failureCode: "product_failure"
  };
}

export function runNodeScript(relativeScriptPath, timeoutMs) {
  const absoluteScriptPath = resolve(PROJECT_ROOT, relativeScriptPath);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [absoluteScriptPath], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: timeoutMs
  });

  return {
    status: typeof result.status === "number" ? result.status : 1,
    signal: result.signal ?? null,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    elapsedMs: Date.now() - startedAt,
    timedOut: Boolean(result.error && /ETIMEDOUT/i.test(String(result.error.message || ""))),
    errorMessage: result.error ? String(result.error.message || result.error) : null
  };
}

export function classifyScriptRun(runResult, artifactJson) {
  return classifyScriptRunDetailed(runResult, artifactJson).status;
}

export function classifyScriptRunDetailed(runResult, artifactJson) {
  if (runResult.status === 0 && (!artifactJson || artifactJson.ok !== false)) {
    return {
      status: "pass",
      failureCode: null
    };
  }

  const rawMessage = [
    runResult.errorMessage,
    artifactJson?.error,
    runResult.stderr,
    runResult.stdout
  ]
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .join("\n");

  const classification = classifyFailureInfo(rawMessage);
  return {
    status: classification.status,
    failureCode: classification.failureCode
  };
}

export function detectRunnerEnvironmentReadiness() {
  const probe = spawnSync(process.execPath, ["-e", "process.stdout.write('runner_probe_ok')"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 5000
  });

  if (probe.status === 0) {
    return {
      ready: true,
      status: "pass",
      reason: null,
      failureCode: null,
      detail: null
    };
  }

  const rawMessage = [
    probe.error ? String(probe.error.message || probe.error) : "",
    String(probe.stderr ?? ""),
    String(probe.stdout ?? "")
  ]
    .filter((entry) => entry.trim().length > 0)
    .join("\n");
  const classification = classifyFailureInfo(rawMessage);

  if (classification.status === "fail_environment") {
    return {
      ready: false,
      status: "skip_environment",
      reason: "node_spawn_blocked",
      failureCode: classification.failureCode,
      detail: rawMessage || "Node child-process spawn unavailable in this environment."
    };
  }

  return {
    ready: false,
    status: "fail_product",
    reason: "runner_preflight_failed",
    failureCode: classification.failureCode,
    detail: rawMessage || "Runner preflight failed."
  };
}
