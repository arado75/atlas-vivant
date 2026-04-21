import { access, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const docsDir = path.join(rootDir, "docs");
const checksDir = path.join(rootDir, ".tmp-run");
const outputRootDir = path.join(rootDir, "demo-package");

const docsToInclude = [
  "ARCHITECTURE_MVP.md",
  "MASTER_ROADMAP_PHASES.md",
  "PHASE1_ATLAS_V0_STATUS.md",
  "STABILIZATION_NOTES.md",
  "DEMO_ROBUST_STATUS_2026-04-21.md"
];

const checkPattern = /^(phase1c-ui|av10c|av10d-hover-real|phase7-perf-drag|phase8-interaction-frame-profile|check-canon).*\.json$/i;

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function timestampForPath(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

async function readPackageMetadata() {
  const raw = await readFile(path.join(rootDir, "package.json"), "utf8");
  return JSON.parse(raw);
}

async function copyExistingDocs(targetDocsDir) {
  await mkdir(targetDocsDir, { recursive: true });
  const copiedDocs = [];

  for (const fileName of docsToInclude) {
    const sourcePath = path.join(docsDir, fileName);
    if (!(await pathExists(sourcePath))) {
      continue;
    }

    const destinationPath = path.join(targetDocsDir, fileName);
    await cp(sourcePath, destinationPath, { recursive: false });
    copiedDocs.push(fileName);
  }

  return copiedDocs;
}

async function copyCheckReports(targetChecksDir) {
  await mkdir(targetChecksDir, { recursive: true });
  if (!(await pathExists(checksDir))) {
    return [];
  }

  const entries = await readdir(checksDir, { withFileTypes: true });
  const selected = entries
    .filter((entry) => entry.isFile() && checkPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of selected) {
    const sourcePath = path.join(checksDir, fileName);
    const destinationPath = path.join(targetChecksDir, fileName);
    await cp(sourcePath, destinationPath, { recursive: false });
  }

  return selected;
}

async function main() {
  if (!(await pathExists(distDir))) {
    throw new Error("Build introuvable. Lance d'abord `npm run build`.");
  }

  const packageMeta = await readPackageMetadata();
  const generatedAt = new Date();
  const packageDirName = `${packageMeta.name}-demo-${timestampForPath(generatedAt)}`;
  const packageDir = path.join(outputRootDir, packageDirName);
  const packageDistDir = path.join(packageDir, "dist");
  const packageDocsDir = path.join(packageDir, "docs");
  const packageChecksDir = path.join(packageDir, "checks");

  await mkdir(packageDir, { recursive: true });
  await cp(distDir, packageDistDir, { recursive: true });

  const docsCopied = await copyExistingDocs(packageDocsDir);
  const checksCopied = await copyCheckReports(packageChecksDir);

  const manifest = {
    generatedAtIso: generatedAt.toISOString(),
    nodeVersion: process.version,
    package: {
      name: packageMeta.name,
      version: packageMeta.version
    },
    contents: {
      dist: "dist/",
      docs: docsCopied,
      checks: checksCopied
    },
    notes: [
      "Package de demonstration robuste (build + evidences de checks).",
      "Aucun cout financier utilisateur: execution locale et gratuite."
    ]
  };

  await writeFile(path.join(packageDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(
    path.join(packageDir, "README.txt"),
    [
      "Atlas Vivant - Demo Package",
      "",
      "1) Servir dist/ avec un serveur statique.",
      "2) Consulter docs/ pour l'architecture et la roadmap.",
      "3) Verifier checks/ pour les preuves de stabilisation.",
      "",
      `Genere le: ${generatedAt.toISOString()}`
    ].join("\n"),
    "utf8"
  );

  console.log(
    JSON.stringify({
      ok: true,
      packageDir,
      docsCopied,
      checksCopiedCount: checksCopied.length
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: String(error?.stack || error)
    })
  );
  process.exitCode = 1;
});
