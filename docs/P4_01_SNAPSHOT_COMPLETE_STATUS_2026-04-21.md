# P4-01 Snapshot Complete - 2026-04-21

## Objectif

Rendre le snapshot de scene vraiment complet, incluant l etat du panneau Mind, pour supprimer la ressaisie lors de la reprise d une enquete.

## Ce qui est livre

- etat Mind structure dans le store global (`mindPanelState`)
- capture snapshot:
  - temps
  - couches actives
  - selection brique
  - mode/noeud causal
  - etat panneau Mind (vue + champs d entree)
- restauration snapshot:
  - reapplication complete de ces etats en une action
- visibilite UI:
  - la liste de snapshots affiche maintenant un resume Mind (vue + ville)

## Fichiers touches

- `src/app/store/useAtlasStore.ts`
- `src/modules/mind/MindPanel.tsx`
- `src/modules/time/TimelineControls.tsx`

## Validation

- `npm run build` OK
- `npm run check:ui` OK

## Limites connues

- les traces dynamiques (logs decision/orchestration) ne sont pas serializees dans le snapshot de scene P4-01.
- ce lot couvre le **contexte operatoire** (pilotage), pas l archivage complet d historique.
