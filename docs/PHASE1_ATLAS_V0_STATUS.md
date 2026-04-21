# Phase 1 Atlas Vivant v0 - Statut Officiel

## Statut

Phase 1 Atlas Vivant v0: **TERMINEE (OUI)**.

Date de cloture: 2026-03-23.

## Perimetre valide

- Atlas local **consultable**: app React/Vite demarrable, globe manipulable, couches consultables.
- Atlas **credible**: brique temperature verrouillee (sources explicites, indisponibilite Open-Meteo explicite, coherence runtime preservee).
- Atlas **montrable**: lisibilite UI stabilisee sur les statuts de source temperature (reelle/interpolee/fallback/inferee, mock non utilise pour la temperature live).
- Atlas **testable**: verification locale standardisee via `npm run check:phase1` (build de reference) + scripts de validation locale sous `.tmp-run/` si besoin operateur.
- Atlas **modulaire**: separations conservees (`src/modules`, `src/lib`, `src/data`, `src/types`) sans refonte d'architecture.

## Criteres de cloture utilises

1. Build production propre (`npm run build`) et commande de verification de phase (`npm run check:phase1`) disponibles.
2. Temperature verrouillee et documentee dans `docs/TEMPERATURE_BRICK_LOCK_STATUS.md`.
3. Latence d'interaction du globe traitee localement sans degradation fonctionnelle.
4. Ambiguite de source temperature reduite dans l'UI (tooltip + micro-texte de statut).
5. Aucun elargissement vers Atlas Mind / Atlas Nuage dans cette phase.

## Dette mineure non bloquante

- Les validations visuelles automatisees restent des scripts locaux d'operation (headless isole) et non une suite CI complete.
- Les autres briques (hors temperature) restent principalement simulees: accepte pour le perimetre v0 de Phase 1.

## Gel de phase

A partir de cette cloture:

- Pas de reouverture du chantier temperature sauf regression prouvee.
- Les evolutions suivantes doivent passer en Phase 2 (Atlas Mind v0 minimal), lotes et bornees.

## Premier lot Phase 2 recommande (cadre)

Lot P2-01: **Atlas Mind v0 - signal temperature minimal**

- Entree: un signal d'anomalie temperature simple deja disponible dans le flux existant.
- Traitement: evaluation minimale deterministe + triage simple.
- Sortie: decision tracee (`ignore | log | watch | flag`) dans le journal structure.
- Contraintes: aucune UI nouvelle, aucun runtime autonome, aucune dependance lourde.
