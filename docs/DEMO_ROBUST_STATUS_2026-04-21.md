# Demo Robust Status - 2026-04-21

## Objectif de cette passe

- verrouiller l UX souris verticale avec preference persistante (`Y normal` / `Y inverse`)
- profiler les frames > 24ms en interaction continue
- renforcer la lisibilite du panneau Mind P2/P3
- preparer une sortie "demo robuste" reproductible

## Etat actuel

- `InteractiveGlobe`:
  - preference `Y` persistante via `localStorage` (`atlas.globe.invertY.v1`)
  - commande explicite dans l UI (`Y normal`, `Y inverse`)
  - profileur interaction expose via `window.__atlasPerfApi`
- Performance:
  - script `phase8-interaction-frame-profile.mjs` ajoute au canon perf
  - mesure continue des frames interaction (`over24/over32/over50`, pire frame, sessions recentes)
- Mind P2/P3:
  - vue `Pilotage` / `Diagnostics`
  - traces orchestration + logs credit + snapshots P2-01/P2-03/P2-04
  - formulation explicite "aucun cout financier utilisateur"
- Packaging demo:
  - `npm run demo:stabilize`
  - `npm run demo:package`
  - generation d un dossier `demo-package/<name>-demo-<timestamp>/`

## Commandes recommandees

```bash
npm run demo:stabilize
npm run demo:package
```

## Criteres de sortie de cette passe

- build production OK
- checks UI/PERF/ORCHESTRATOR executables localement
- package demo genere avec:
  - `dist/`
  - `docs/`
  - `checks/`
  - `manifest.json`
