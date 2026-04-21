# Atlas Mind Constitution v0

## Rôle v0

Atlas Mind v0 est un organe de pilotage minimal.
Il reçoit des signaux simples, route vers un cycle deterministe, puis retourne une decision courte et tracable.

## Ce qu'Atlas Mind v0 a le droit de faire

- Router un signal `temperature.anomaly.simple` vers le mini-cycle P2-01.
- Produire une decision `ignore | log | watch | flag`.
- Journaliser la decision et conserver une trace courte d'orchestration.

## Ce qu'Atlas Mind v0 ne fait pas encore

- Pas de runtime autonome permanent.
- Pas de multi-agent complexe.
- Pas de ML.
- Pas de tribunal.
- Pas d'observatoire.
- Pas de conseil d'expansion.

## Principe de sobriete

- Reutiliser l'existant avant d'ajouter.
- Garder des interfaces courtes.
- Limiter les evaluations (P2-01: 2 maximum).
- Eviter toute infra lourde.

## Remontee d'information vs audit

- Remontee: flux operationnel court (signal -> decision).
- Audit: lecture analytique separee (hors perimetre P2-02).

## Priorite actuelle

- Signaux temperature simples uniquement.

## Interdictions de stade

- Interdiction d'ouvrir Atlas Nuage.
- Interdiction d'ouvrir Tribunal / Observatoire.
- Interdiction d'elargir en architecture cognitive lourde.
