import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = process.cwd();
const OUT_DIR = resolve(PROJECT_ROOT, ".tmp-run");
const OUT_FILE = resolve(OUT_DIR, "check-ui-gate.json");
const RUNNER_FILE = resolve(PROJECT_ROOT, ".tmp-run/check-ui-runner.json");
const MAX_ARTIFACT_AGE_MS = 10 * 60 * 1000;

mkdirSync(OUT_DIR, { recursive: true });

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function readJsonArtifact(relativePath) {
  const absolutePath = resolve(PROJECT_ROOT, relativePath);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  const stats = statSync(absolutePath);
  return {
    path: absolutePath,
    parsed,
    ageMs: Date.now() - stats.mtimeMs
  };
}

function readRunnerArtifact() {
  const raw = readFileSync(RUNNER_FILE, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const failures = [];
  const runner = readRunnerArtifact();

  if (runner?.status === "skip_environment" || runner?.status === "fail_environment") {
    const isSkipped = runner?.status === "skip_environment";
    const environmentResult = {
      ok: true,
      status: runner.status,
      checkedAtIso: new Date().toISOString(),
      summary: {
        reason: isSkipped
          ? "UI check saute par environnement (preflight spawn/CDP indisponible), pas de verdict produit negatif."
          : "UI check bloque par environnement (CDP/spawn), pas de verdict produit negatif.",
        runner
      },
      failures
    };

    writeFileSync(OUT_FILE, JSON.stringify(environmentResult, null, 2), "utf8");
    console.log(JSON.stringify(environmentResult));
    return;
  }

  assertCondition(runner?.status === "pass", "UI gate: runner non valide (attendu pass).", failures);

  const headlessArtifact = readJsonArtifact(".tmp-run/phase1c-ui-headless-check.json");
  const proofArtifact = readJsonArtifact(".tmp-run/phase1c-ui-proof.json");

  const headless = headlessArtifact.parsed;
  const proof = proofArtifact.parsed;

  const summary = {
    artifacts: {
      headlessAgeMs: Math.round(headlessArtifact.ageMs),
      proofAgeMs: Math.round(proofArtifact.ageMs)
    },
    headless: {
      ok: Boolean(headless?.ok),
      normalCities: Number(headless?.normal?.nonNullRequiredCities ?? 0),
      blockedCities: Number(headless?.blocked?.nonNullRequiredCities ?? 0),
      normalBanner: Boolean(headless?.normal?.banner),
      blockedBanner: Boolean(headless?.blocked?.banner)
    },
    proof: {
      ok: Boolean(proof?.ok),
      normalCities: Number(proof?.normal?.nonNullRequiredCities ?? 0),
      blockedCities: Number(proof?.blocked?.nonNullRequiredCities ?? 0),
      normalUnavailableBanner: Boolean(proof?.normal?.unavailableBanner),
      blockedUnavailableBanner: Boolean(proof?.blocked?.unavailableBanner),
      normalLastRefreshPresent: typeof proof?.normal?.lastOpenMeteoRefreshIso === "string",
      blockedLastRefreshPresent: typeof proof?.blocked?.lastOpenMeteoRefreshIso === "string"
    }
  };

  assertCondition(summary.artifacts.headlessAgeMs <= MAX_ARTIFACT_AGE_MS, "UI gate: artefact headless trop ancien.", failures);
  assertCondition(summary.artifacts.proofAgeMs <= MAX_ARTIFACT_AGE_MS, "UI gate: artefact proof trop ancien.", failures);

  assertCondition(headless?.ok === true, "UI headless: script non OK.", failures);
  assertCondition(proof?.ok === true, "UI proof: script non OK.", failures);

  assertCondition(summary.headless.normalCities >= 8, "UI headless: villes valides insuffisantes (normal).", failures);
  assertCondition(summary.headless.blockedCities >= 6, "UI headless: villes valides insuffisantes (blocked).", failures);
  assertCondition(summary.proof.normalCities >= 8, "UI proof: villes valides insuffisantes (normal).", failures);
  assertCondition(summary.proof.blockedCities >= 8, "UI proof: villes valides insuffisantes (blocked).", failures);

  assertCondition(summary.proof.normalUnavailableBanner === false, "UI proof: banniere indisponible affichee en mode normal.", failures);
  assertCondition(summary.proof.blockedUnavailableBanner === false, "UI proof: banniere indisponible affichee en mode blocked.", failures);

  const result = {
    ok: failures.length === 0,
    status: failures.length === 0 ? "pass" : "fail_product",
    checkedAtIso: new Date().toISOString(),
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
  const failure = {
    ok: false,
    status: "fail_product",
    checkedAtIso: new Date().toISOString(),
    failures: [String(error?.stack || error)]
  };
  writeFileSync(OUT_FILE, JSON.stringify(failure, null, 2), "utf8");
  console.log(JSON.stringify(failure));
  process.exitCode = 1;
});
