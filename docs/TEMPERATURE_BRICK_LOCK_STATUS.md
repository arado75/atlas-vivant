# Temperature Brick Lock Status (Official)

## Statut

Verrouillee officiellement (LOT 7).

## Criteres valides

- Build production OK (`npm run build`).
- Source Open-Meteo branchee et indisponibilite explicite conservee (pas de fallback mock silencieux).
- Coherence ville/champ/tooltip preservee sur le pipeline temperature valide.
- Latence d'interaction reduite pendant drag via mode interaction du mesh temperature.
- Aucune modification de navigation du globe ni de logique Atlas Mind / Atlas Nuage.

## Correctifs cles appliques

- `src/modules/map/temperature-overlay.tsx`
  - Ajout d'un mode interaction (`isInteractionActive`) sur le mesh.
  - Maillage temporairement moins dense pendant drag.
  - Echantillonnage centre seul pendant drag (blend complet conserve hors interaction).
  - Filtre blur du mesh desactive uniquement pendant interaction.
- `src/modules/map/InteractiveGlobe.tsx`
  - Ajout d'un etat local de drag (`isDragInteractionActive`).
  - Activation/desactivation stricte sur pointer down/up/cancel/leave.
  - Passage du flag interaction au rendu du mesh temperature.

## Gardes-fous conserves

- Hors interaction: rendu complet conserve (blend local + front-face + source runtime).
- En interaction: optimisation transitoire uniquement; retour automatique au rendu complet a la fin du drag.
- Message d'indisponibilite Open-Meteo maintenu, fallback visuel trompeur interdit.

## Dettes mineures non bloquantes

- Mesure FPS live avec Open-Meteo actif dependante de la disponibilite reseau/quota amont.
- Les scripts de verification dans `.tmp-run/` restent des artefacts de validation locale (non runtime).

## Politique de changement

Ne modifier la brique temperature que pour regression prouvee (perf ou coherence factuelle) avec correction locale minimale.
Pas de refonte sans lot dedie.
