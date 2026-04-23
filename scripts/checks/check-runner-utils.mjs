import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const PROJECT_ROOT = process.cwd();
export const TMP_DIR = resolve(PROJECT_ROOT, ".tmp-run");

mkdirSync(TMP_DIR, { recursive: true });

const ENVIRONMENT_FAILURE_PATTERNS = [
  /\bspawn\s+eperm\b/i,
  /\beperm\b/i,
  /\beacces\b/i,
  /\benoent\b/i,
  /\bcommand not found\b/i,
  /\bnot recognized\b/i,
  /\bpermission denied\b/i
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
  if (!text || typeof text !== "string") {
    return "fail_product";
  }

  for (const pattern of ENVIRONMENT_FAILURE_PATTERNS) {
    if (pattern.test(text)) {
      return "fail_environment";
    }
  }

  return "fail_product";
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
  if (runResult.status === 0 && (!artifactJson || artifactJson.ok !== false)) {
    return "pass";
  }

  const rawMessage = [
    runResult.errorMessage,
    artifactJson?.error,
    runResult.stderr,
    runResult.stdout
  ]
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .join("\n");

  return classifyFailureText(rawMessage);
}
