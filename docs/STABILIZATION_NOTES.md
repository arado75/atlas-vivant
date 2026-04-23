# Stabilization Notes

Cette passe intermediaire vise surtout la stabilisation ergonomique et fonctionnelle avant la grande refonte visuelle.

## Lot fiabilisation deterministe (2026-04-22)

- checks durcis:
  - `check:orchestrator` passe maintenant par `scripts/checks/check-orchestrator-gate.mjs`
  - `check:orchestrator` compile a chaque run des bundles frais depuis `src/atlas-mind/examples/*` (plus de dependance aux bundles `.tmp-run` potentiellement obsoletes)
  - le scenario P2-02 du gate orchestrateur utilise un ingress manuel deterministe (sans dependance live Open-Meteo)
  - `check:ui` et `check:perf` conservent l execution des scripts CDP, puis appliquent des gates strictes via:
    - `scripts/checks/run-ui-check.mjs`
    - `scripts/checks/run-perf-check.mjs`
    - `scripts/checks/check-ui-gate.mjs`
    - `scripts/checks/check-perf-gate.mjs`
  - `check:canon` appelle maintenant la chaine complete `build -> check:orchestrator -> check:ui -> check:perf`
- cas critiques explicitement rejetes:
  - incoherences de routage P2-02/P2-04/P2-05/P3-01/P3-02
  - delta temperature manquant/non numerique sur ingress P2-02 deterministe
  - regressions UI/perf (artefacts absents/trop anciens, seuils hors borne)
 - distinction explicite des echecs:
  - `fail_product`: regression produit verifiee
 - `fail_environment`: execution CDP impossible (ex: `spawn EPERM`), sans conclure a une regression produit

## Lot decompresse InteractiveGlobe (2026-04-22)

- extraction incremental du bloc "snapshot temperature leger + persistance localStorage" hors du monolithe:
  - nouveau module type: `src/modules/map/temperature-light-snapshot.ts`
  - fonctions sorties de `InteractiveGlobe.tsx`:
    - `buildTemperatureLightSnapshot`
    - `persistTemperatureLightSnapshot`
    - `readTemperatureLightSnapshot`
    - `buildTemperatureDatasetFromLightSnapshot`
  - types sortis du monolithe:
    - `TemperatureLightSnapshot`
    - `TemperatureLightSnapshotCity`
- effet:
  - reduction du volume de logique et parsing data dans `InteractiveGlobe.tsx`
  - perimetre type elargi hors `@ts-nocheck` sans changement UX
- verification:
  - `npm run build` OK
  - `npm run check:orchestrator` OK (hors sandbox)
  - `npm run check:ui` OK (hors sandbox)
  - `npm run check:perf` OK (hors sandbox)
  - `npm run check:canon` OK (hors sandbox)
- noyau globe:
  - extraction du bloc interaction drag/zoom vers `src/modules/map/globe-interaction-core.ts` (fichier TypeScript type, sans `@ts-nocheck`)
  - `InteractiveGlobe.tsx` conserve son rendu mais delegue maintenant les calculs critiques drag/zoom a ce module
- hygiene:
  - fichier backup retire du flux source actif:
    - de `src/modules/map/InteractiveGlobe.tsx.bak.av11b-pre-repair`
    - vers `.tmp-run/backups/InteractiveGlobe.tsx.bak.av11b-pre-repair`

## Lot extraction hover/tooltip temperature (2026-04-22)

- cible:
  - extraction du bloc dense `temperatureHoverCandidates` hors `InteractiveGlobe.tsx`
  - perimetre extrait: projection villes front-face + sampling temperature tooltip + delta + ranking distance
- implementation:
  - nouveau module type: `src/modules/map/temperature-hover-candidates.ts`
  - nouvelle API pure:
    - `buildTemperatureHoverCandidates(input)`
  - `InteractiveGlobe.tsx` delegue maintenant la construction des candidats hover a ce module
- effet:
  - baisse du volume de logique metier temperature dans le monolithe
  - bloc hover/tooltip rendu testable de facon isolee, sans changer l UX visible
- verification:
  - `npm run build` OK
  - `npm run check:orchestrator` OK (hors sandbox)
  - `npm run check:ui` OK (hors sandbox)
  - `npm run check:perf` OK (hors sandbox)
  - `npm run check:canon` OK (hors sandbox)

## Lot extraction selection hover/pointeur (2026-04-23)

- cible:
  - extraction de la logique finale de selection hover depuis `InteractiveGlobe.tsx`
  - perimetre extrait: probing pointeur, nearest match, radius par niveau de vue, decision clear/noop
- implementation:
  - nouveau module type: `src/modules/map/temperature-hover-interaction.ts`
  - nouvelle API:
    - `resolveTemperatureHoverFromPointer(input)`
  - `InteractiveGlobe.tsx` garde uniquement l orchestration (counters perf + application du resultat)
- effet:
  - reduction de la logique dense dans le monolithe sur la partie interaction hover
  - logique de decision hover rendue explicite et testable hors composant principal
- verification:
  - `npm run build` OK
  - `npm run check:orchestrator` OK (hors sandbox via `check:canon`)
  - `npm run check:ui` OK (hors sandbox via `check:canon`)
  - `npm run check:perf` OK (hors sandbox via `check:canon`)
  - `npm run check:canon` OK (hors sandbox)

## Lot extraction orchestration hover (2026-04-23)

- cible:
  - extraction de l orchestration hover restante dans `InteractiveGlobe.tsx`
  - perimetre: reconciliation de payload hover, update focus city, clear conditionnel par `expectedId`
- implementation:
  - nouveau module type: `src/modules/map/temperature-hover-state.ts`
  - fonctions extraites:
    - `resolveNextHoveredCity`
    - `resolveHoverFocusUpdate`
    - `clearHoveredCityIfExpected`
  - `InteractiveGlobe.tsx` delegue maintenant `setTemperatureHover` et `scheduleTemperatureHoverClear` a ce module
  - nettoyage: retrait des refs de clear timeout non utilisees
- effet:
  - reduction de la logique d etat hover dans le monolithe
  - orchestration hover rendue explicite et testable hors composant principal
- verification:
  - `npm run build` OK
  - `npm run check:orchestrator` OK (hors sandbox via `check:canon`)
  - `npm run check:ui` OK (hors sandbox via `check:canon`)
  - `npm run check:perf` OK (hors sandbox via `check:canon`)
  - `npm run check:canon` OK (hors sandbox)

## Lot reduction `@ts-nocheck` InteractiveGlobe (2026-04-23)

- diagnostic:
  - retrait de `@ts-nocheck` possible apres extraction des blocs critiques
  - blocages restants limites a des reliquats `noUnusedLocals`/`noUnusedParameters`
- corrections:
  - suppression du `@ts-nocheck` global en tete de `InteractiveGlobe.tsx`
  - nettoyage des imports/constantes/fonctions non utilises (sans impact UX)
  - simplification d etat: `nextTemperatureRefreshAtMs` conserve en setter seul (suppression de lecture morte)
- effet:
  - plus de bypass global TypeScript sur le composant central
  - verification de type active sur le fichier `InteractiveGlobe.tsx`
- verification:
  - `npm run build` OK
  - `npm run check:orchestrator` OK (hors sandbox via `check:canon`)
  - `npm run check:ui` OK (hors sandbox via `check:canon`)
  - `npm run check:perf` OK (hors sandbox via `check:canon`)
  - `npm run check:canon` OK (hors sandbox)

## Lot AV-11B fallback multi-source live (2026-04-23)

- sources retenues:
  - primaire: Open-Meteo
  - secondaire live: MET Norway
  - dernier filet: snapshot leger persistant (localStorage)
- strategie active:
  - tentative Open-Meteo en premier
  - fallback live sur MET Norway si Open-Meteo indisponible
  - si double echec live, runtime live invalide et bascule sur snapshot leger si present
  - sinon fallback visuel local explicite
- transparence UI:
  - statut explicite de source active/fallback live/snapshot
  - route affichee explicitement:
    - `Route: Open-Meteo`
    - `Route: Open-Meteo -> MET Norway`
    - `Route: snapshot leger persistant`
  - age du snapshot affiche quand snapshot utilise
- implementation:
  - `src/lib/temperature/temperature-data-source.ts`
    - ajout `sourceStatus` (`primaryProvider`, `activeProvider`, `fallbackLiveActive`, `attemptedProviders`)
    - suppression du maintien implicite d un cache live stale apres double echec provider
    - ajout d options de simulation provider (`failOpenMeteo`, `failMetNorway`) pour validation scenario
  - `src/modules/map/InteractiveGlobe.tsx`
    - branchage options simulation via query (`tempFailOpenMeteo`, `tempFailMetNorway`)
    - invalidation runtime live quand providers indisponibles (fallback snapshot effectif)
    - rendu status source/route/snapshot age explicite
- verification scenarios AV-11B (headless):
  - A Open-Meteo OK: `Source active: Open-Meteo`
  - B Open-Meteo KO / MET Norway OK: `Fallback live actif: MET Norway (Open-Meteo indisponible)`
  - C Open-Meteo KO / MET Norway KO: `Dernier snapshot valide affiche (...)`
  - D source affichee correctement selon scenario: OK
- verification canonique:
  - `npm run check:canon` OK (hors sandbox)

## Lot portabilite runners UI/perf sandbox (2026-04-23)

- objectif:
  - reduire les faux signaux `fail_environment` opaques en sandbox
  - distinguer clairement `PASS` / `FAIL produit` / `FAIL environnement` / `SKIP environnement`
- implementation:
  - `scripts/checks/check-runner-utils.mjs`
    - ajout classification detaillee (`classifyFailureInfo`, `classifyScriptRunDetailed`)
    - ajout preflight spawn Node (`detectRunnerEnvironmentReadiness`)
    - enrichissement des codes (`eperm`, `spawn_eperm`, etc.)
  - `scripts/checks/run-ui-check.mjs`
    - preflight environnement avant execution CDP
    - statut `skip_environment` structure (raison/code/detail) quand spawn bloque
  - `scripts/checks/run-perf-check.mjs`
    - meme mecanisme `skip_environment` + metadata structurees
  - `scripts/checks/check-ui-gate.mjs`
    - gate non negatif en cas `skip_environment`/`fail_environment`
    - message explicite "pas de verdict produit negatif"
  - `scripts/checks/check-perf-gate.mjs`
    - meme politique de gate que UI
- effet:
  - en sandbox restreint: checks UI/perf interpretes comme indisponibilite environnement, pas comme regression produit
  - hors sandbox: execution complete des checks UI/perf conservee
- verification:
  - `npm run build` OK (sandbox)
  - `npm run check:ui` OK, statut `skip_environment` en sandbox (`node_spawn_blocked`, `failureCode=eperm`)
  - `npm run check:perf` OK, statut `skip_environment` en sandbox (`node_spawn_blocked`, `failureCode=eperm`)
  - `npm run check:canon` KO en sandbox (vite/esbuild `spawn EPERM`)
  - `npm run check:canon` OK hors sandbox (chaine complete PASS)

## Lot P6-01 Paris 3D OSM (demonstrateur fidele) (2026-04-24)

- cadrage promesse:
  - ce lot n est **pas** "Paris exact" centimetrique
  - ce lot est "Paris 3D OSM / demonstrateur fidele" pour exploration urbaine fluide
- implementation:
  - `src/modules/map/ParisCityScene.tsx`
    - nouvelle vue locale 2.5D (canvas) pour Paris
    - navigation fluide (drag/zoom/rotation/inclinaison) + mode qualite (`auto`/`qualite`/`eco`)
  - `src/modules/map/paris-3d-data.ts`
    - ingestion OSM via Overpass (routes + batiments)
    - normalisation typée (footprints, hauteur, area, bbox)
    - fallback local synthetique si Overpass indisponible
  - `src/App.tsx`
    - switch de vue `Globe Atlas` / `Paris 3D`
    - persistance locale du mode (`atlas.mapView.v1`) + URL `?view=paris3d`
    - lazy-load de `ParisCityScene` (chunk dedie)
  - `src/index.css`
    - styles dedies au mode Paris 3D
- limites explicites:
  - dependance OSM/Overpass (couverture et disponibilite variables)
  - hauteurs batiments parfois estimees quand metadonnees manquantes
  - fallback local non geometrique exact en cas d indisponibilite live
  - pas de precision LiDAR / photogrammetrie / centimetrique dans ce lot
- impact perf/bundle:
  - chunk dedie `ParisCityScene-*.js` (chargement a la demande)
  - mode Globe protege par lazy-load (pas de dependance runtime imposee en mode planetaire)
- verification:
  - `npm run build` OK
  - `npm run check:orchestrator` OK (hors sandbox)
  - `npm run check:ui` OK (hors sandbox)
  - `npm run check:perf` OK (hors sandbox)
  - `npm run check:canon` OK (hors sandbox)

## Corrections apportees

### Globe

- zoom et dezoom rendus beaucoup plus amples
- capture native de la molette sur le globe avec `preventDefault`, pour eviter le scroll de page pendant la manipulation
- inertie douce sur rotation et zoom pour une sensation plus instrumentale
- focus clavier/pointer explicite sur le globe
- raccourcis de navigation ajoutes: fleches, `+`, `-`, `R`
- zone du globe agrandie, recentree et legerement mieux mise en valeur
- rendu un peu plus net avec ring, focus state et precision geometrique

### Briques

- selection de brique reliee a la couche correspondante
- le globe met maintenant en avant la couche selectionnee et attenue le reste du contexte
- labels et emphases ajoutes sur flux, trajectoires, halos et pulses quand une brique est selectionnee
- distinction plus claire des statuts de briques via accents de couleur coherents
- detail de brique rendu plus explicite sur l'effet produit dans le globe

### Temps

- modes explicites ajoutes: `Pause`, `Temps reel`, `Accelere`
- position temporelle reliee a des moments nommes du cycle simule 2026
- comparaison N / N-1 rendue plus lisible par un libelle clair
- le slider met maintenant la lecture en pause pour eviter une sensation arbitraire

### Ergonomie generale

- sidebars rendues plus stables avec scroll interne sur grand ecran
- reduction des ambiguities entre contexte global et couche focalisee
- architecture preservee: composants existants renforces plutot que remplaces

## Points prepares pour la prochaine grande passe

- systeme de couleurs par domaine et statut reutilisable
- composant globe pret pour enrichissement visuel futur
- logique de focus de brique exploitable pour une future narration visuelle plus ambitieuse
