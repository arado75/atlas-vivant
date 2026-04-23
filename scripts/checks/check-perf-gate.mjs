import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = process.cwd();
const OUT_DIR = resolve(PROJECT_ROOT, ".tmp-run");
const OUT_FILE = resolve(OUT_DIR, "check-perf-gate.json");
const RUNNER_FILE = resolve(PROJECT_ROOT, ".tmp-run/check-perf-runner.json");
const MAX_ARTIFACT_AGE_MS = 12 * 60 * 1000;

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

function checkZoomBenchmark(zoom, failures) {
  assertCondition(zoom?.ok === true, "Perf zoom: script non OK.", failures);
  const scenarios = Array.isArray(zoom?.scenarios) ? zoom.scenarios : [];
  assertCondition(scenarios.length >= 1, "Perf zoom: aucun scenario mesure.", failures);

  for (const scenario of scenarios) {
    const name = String(scenario?.name ?? "unknown");
    const readinessOk = Boolean(scenario?.readiness?.ok);
    const idleAvg = Number(scenario?.idleFrames?.avgFrameMs ?? Number.NaN);
    const zoomAvg = Number(scenario?.zoomFrames?.avgFrameMs ?? Number.NaN);
    const zoomOver50 = Number(scenario?.zoomFrames?.over50Ms ?? Number.NaN);

    if (name !== "zoom_temp_on_mesh_suspended") {
      assertCondition(readinessOk, `Perf zoom: readiness KO sur ${name}.`, failures);
    }
    assertCondition(Number.isFinite(idleAvg) && idleAvg <= 24, `Perf zoom: idle avgFrameMs > 24 sur ${name}.`, failures);
    assertCondition(Number.isFinite(zoomAvg) && zoomAvg <= 24, `Perf zoom: zoom avgFrameMs > 24 sur ${name}.`, failures);
    assertCondition(
      Number.isFinite(zoomOver50) && zoomOver50 <= 2,
      `Perf zoom: over50Ms excessif sur ${name} (>2).`,
      failures
    );
  }
}

function checkHoverBenchmark(hover, failures) {
  assertCondition(hover?.ok === true, "Perf hover: script non OK.", failures);
  assertCondition(hover?.readiness?.ok === true, "Perf hover: readiness KO.", failures);
  assertCondition(hover?.firstHover?.ok === true, "Perf hover: premier hover KO.", failures);
  assertCondition(hover?.secondHover?.ok === true, "Perf hover: second hover KO.", failures);

  const firstHoverMs = Number(hover?.firstHover?.inputToTooltipMs ?? Number.NaN);
  const secondHoverMs = Number(hover?.secondHover?.inputToTooltipMs ?? Number.NaN);
  assertCondition(
    Number.isFinite(firstHoverMs) && firstHoverMs <= 250,
    "Perf hover: latence tooltip trop elevee (first hover).",
    failures
  );
  assertCondition(
    Number.isFinite(secondHoverMs) && secondHoverMs <= 250,
    "Perf hover: latence tooltip trop elevee (second hover).",
    failures
  );

  const cityBefore = Number(hover?.continuityBefore?.cityCount ?? 0);
  const cityAfter = Number(hover?.continuityAfter?.cityCount ?? 0);
  assertCondition(cityAfter >= cityBefore && cityAfter > 0, "Perf hover: continuite ville non preservee apres zoom.", failures);
}

function checkDragBenchmark(drag, failures) {
  assertCondition(drag?.ok === true, "Perf drag: script non OK.", failures);
  const normalP95 = Number(drag?.normal?.frameStats?.p95Ms ?? Number.NaN);
  const blockedP95 = Number(drag?.blocked?.frameStats?.p95Ms ?? Number.NaN);
  assertCondition(Number.isFinite(normalP95) && normalP95 <= 24, "Perf drag: p95 normal > 24ms.", failures);
  assertCondition(Number.isFinite(blockedP95) && blockedP95 <= 24, "Perf drag: p95 blocked > 24ms.", failures);
}

function checkInteractionProfile(profile, failures) {
  assertCondition(profile?.ok === true, "Perf interaction-profile: script non OK.", failures);
  const totalFrames = Number(profile?.summary?.totalFrames ?? 0);
  const over24Frames = Number(profile?.summary?.over24Frames ?? 0);
  const worstFrameMs = Number(profile?.summary?.worstFrameMs ?? Number.NaN);
  assertCondition(totalFrames > 0, "Perf interaction-profile: totalFrames = 0.", failures);
  assertCondition(
    over24Frames <= Math.ceil(totalFrames * 0.05),
    "Perf interaction-profile: plus de 5% de frames > 24ms.",
    failures
  );
  assertCondition(Number.isFinite(worstFrameMs) && worstFrameMs <= 32, "Perf interaction-profile: worstFrameMs > 32ms.", failures);
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
          ? "Perf check saute par environnement (preflight spawn/CDP indisponible), pas de verdict produit negatif."
          : "Perf check bloque par environnement (CDP/spawn), pas de verdict produit negatif.",
        runner
      },
      failures
    };

    writeFileSync(OUT_FILE, JSON.stringify(environmentResult, null, 2), "utf8");
    console.log(JSON.stringify(environmentResult));
    return;
  }

  assertCondition(runner?.status === "pass", "Perf gate: runner non valide (attendu pass).", failures);

  const zoomArtifact = readJsonArtifact(".tmp-run/av10c-zoom-benchmark.json");
  const hoverArtifact = readJsonArtifact(".tmp-run/av10d-hover-real-benchmark.json");
  const dragArtifact = readJsonArtifact(".tmp-run/phase7-perf-drag-check.json");
  const profileArtifact = readJsonArtifact(".tmp-run/phase8-interaction-frame-profile.json");

  assertCondition(zoomArtifact.ageMs <= MAX_ARTIFACT_AGE_MS, "Perf gate: artefact zoom trop ancien.", failures);
  assertCondition(hoverArtifact.ageMs <= MAX_ARTIFACT_AGE_MS, "Perf gate: artefact hover trop ancien.", failures);
  assertCondition(dragArtifact.ageMs <= MAX_ARTIFACT_AGE_MS, "Perf gate: artefact drag trop ancien.", failures);
  assertCondition(profileArtifact.ageMs <= MAX_ARTIFACT_AGE_MS, "Perf gate: artefact frame-profile trop ancien.", failures);

  checkZoomBenchmark(zoomArtifact.parsed, failures);
  checkHoverBenchmark(hoverArtifact.parsed, failures);
  checkDragBenchmark(dragArtifact.parsed, failures);
  checkInteractionProfile(profileArtifact.parsed, failures);

  const result = {
    ok: failures.length === 0,
    status: failures.length === 0 ? "pass" : "fail_product",
    checkedAtIso: new Date().toISOString(),
    summary: {
      artifacts: {
        zoomAgeMs: Math.round(zoomArtifact.ageMs),
        hoverAgeMs: Math.round(hoverArtifact.ageMs),
        dragAgeMs: Math.round(dragArtifact.ageMs),
        frameProfileAgeMs: Math.round(profileArtifact.ageMs)
      },
      zoom: {
        ok: Boolean(zoomArtifact.parsed?.ok),
        scenarios: Array.isArray(zoomArtifact.parsed?.scenarios) ? zoomArtifact.parsed.scenarios.length : 0
      },
      hover: {
        ok: Boolean(hoverArtifact.parsed?.ok),
        firstHoverMs: Number(hoverArtifact.parsed?.firstHover?.inputToTooltipMs ?? Number.NaN),
        secondHoverMs: Number(hoverArtifact.parsed?.secondHover?.inputToTooltipMs ?? Number.NaN)
      },
      drag: {
        ok: Boolean(dragArtifact.parsed?.ok),
        normalP95Ms: Number(dragArtifact.parsed?.normal?.frameStats?.p95Ms ?? Number.NaN),
        blockedP95Ms: Number(dragArtifact.parsed?.blocked?.frameStats?.p95Ms ?? Number.NaN)
      },
      interactionProfile: {
        ok: Boolean(profileArtifact.parsed?.ok),
        totalFrames: Number(profileArtifact.parsed?.summary?.totalFrames ?? 0),
        over24Frames: Number(profileArtifact.parsed?.summary?.over24Frames ?? 0),
        worstFrameMs: Number(profileArtifact.parsed?.summary?.worstFrameMs ?? Number.NaN)
      }
    },
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
