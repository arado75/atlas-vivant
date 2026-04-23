# Atlas Vivant MVP

MVP web TypeScript pour **Atlas Vivant**, concu comme un instrument d'observation systemique: globe sombre interactif, couches modulaires, traces temporelles, registre de briques chargeables et mini graphe causal.

## Ce que contient le MVP

- une application web React + TypeScript + Vite
- un globe SVG interactif en projection orthographique
- un panneau de couches activables
- un systeme de traces temporelles avec lecture et comparaison N / N-1
- un chargeur local de briques JSON / YAML
- un panneau Orion minimal pour proposer une brique
- un mini graphe causal en mode `racine` et `arbre`
- des donnees simulees, structurees pour etre remplacees plus tard par de vraies sources

## Architecture technique

Le detail est documente dans [docs/ARCHITECTURE_MVP.md](/C:/AtlasVivant/docs/ARCHITECTURE_MVP.md).

Resume:

- `src/modules/map`: rendu du globe, overlays et traces
- `src/modules/layers`: pilotage des couches visibles
- `src/modules/time`: lecture temporelle, comparaison et longueur de trace
- `src/modules/bricks`: registre local et inspection des briques chargees
- `src/modules/causal`: mini graphe causal root/tree
- `src/modules/orion`: proposition locale de briques et analyse heuristique
- `src/lib`: chargeur de briques, formatteurs, moteur Orion minimal
- `src/data`: catalogue de couches, graphe causal et donnees simulees
- `public/bricks`: briques versionnees au format JSON/YAML

## Installation

Prerequis:

- Node.js 20+ recommande
- npm 10+ ou equivalent

Depuis la racine du projet:

```bash
npm install
```

## Lancer en local

Mode developpement:

```bash
npm run dev
```

Build de production:

```bash
npm run build
```

Preview du build:

```bash
npm run preview
```

Stabilisation + packaging demo robuste:

```bash
npm run demo:stabilize
npm run demo:package
```

Par defaut, Vite expose l'application sur [http://localhost:5173](http://localhost:5173).

## Notes MVP

- donnees hybrides: temperature live Open-Meteo + couches non-temperature simulees
- le globe ne depend pas d'un fournisseur cartographique externe
- les briques chargees depuis `public/bricks` sont deja melangees entre JSON et YAML
- Orion ne fait pas d'IA distante: il applique une analyse locale heuristique et tracable

## Structure du projet

```text
.
|-- public/
|   `-- bricks/
|-- src/
|   |-- app/store/
|   |-- data/
|   |-- lib/
|   |-- modules/
|   |-- types/
|   `-- App.tsx
|-- docs/
|   `-- ARCHITECTURE_MVP.md
|-- index.html
|-- package.json
`-- vite.config.ts
```

## Statut de verification local

Build et runtime local sont executables. Pour la cloture produit Phase 1, voir `docs/PHASE1_ATLAS_V0_STATUS.md` et `docs/TEMPERATURE_BRICK_LOCK_STATUS.md`.
Pour la passe demo robuste (stabilisation/perf/packaging), voir `docs/DEMO_ROBUST_STATUS_2026-04-21.md`.
Pour la completion P4-01 snapshots complets (avec etat Mind), voir `docs/P4_01_SNAPSHOT_COMPLETE_STATUS_2026-04-21.md`.	
Pour le lot P4-02 + P5 (annotations/hypotheses, export briefing, navigation multi-echelles, couche epistemique), voir `docs/P4_02_P5_STATUS_2026-04-21.md`.
Les checks durcis sont centralises dans `scripts/checks/` et sont executes via `npm run check:orchestrator`, `npm run check:ui`, `npm run check:perf`, `npm run check:canon`.
`check:ui` et `check:perf` distinguent maintenant `fail_product` (regression verifiee) et `fail_environment` (execution CDP impossible).


