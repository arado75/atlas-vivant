# Atlas Vivant - Roadmap Global (P2 -> P5)

## Objectif

Livrer Atlas Vivant comme instrument cognitif complet:
- observation fiable
- exploration multi echelles
- distinction epistemique explicite
- file d attention exploitable
- gouvernance Orion tracable

## Etat actuel (2026-04-20)

- P1 v0: termine (globe, couches, temperature verrouillee, base UX stable)
- P2: en cours (orchestration P2-02 et cycles P2-03/P2-04 deja presents)
- P3: composants initiaux presents en code (credit + tribunal minimal), pas encore exposes proprement dans UX

## P2 - Operations Mind v0

### P2-03 moteur d evenements minimal
- entree: sorties P2-02 (`watch|flag|log`)
- sortie: evenements structures (categorie, route, decision, confiance, statut epistemique)
- UX: file d attention + reperes de timeline
- done quand:
  - un cycle Mind cree automatiquement un evenement visible
  - le nombre d evenements dans la fenetre temporelle est lisible
  - aucune ressaisie requise depuis le globe vers Mind

### P2-04 qualite et disponibilite
- unifier les evenements `runtime_availability` et `data_quality`
- regler les seuils de bruit (pas de spam d evenements)
- done quand:
  - pas de duplication evidente
  - signal utile conserve, bruit coupe

### P2-05 lot borne
- mode operationnel borne (volume, priorites, traces)
- done quand:
  - l utilisateur voit "quoi regarder ensuite" sans surcharge

## P3 - Decision et gouvernance locale

### P3-01 gouvernance de charge interne (gratuite)
- appliquer des budgets techniques explicites aux routes (anti inflation de decisions)
- afficher decision de filtrage et raison dans l UX
- done quand:
  - chaque decision est justifiee par trace de filtrage interne

### P3-02 tribunal minimal
- ajouter revue locale contestable des flags sensibles
- done quand:
  - une escalation peut etre revisee avec trace courte

## P4 - Memoire d enquete et transmission

### P4-01 snapshots et favoris
- capture d une scene (temps, couches, zone, decisions)
- done quand:
  - un snapshot se restaure en un clic

### P4-02 annotations et hypotheses
- notes locales structurees par scene
- mode "ce que l on sait / ce qui reste fragile"
- done quand:
  - une hypothese est lisible, versionnee, contestable

### P4-03 partage de lecture
- export briefing (court) et mode transmission
- done quand:
  - une autre personne comprend la scene sans reconfiguration

## P5 - Instrument cognitif complet

### P5-01 navigation multi echelles avancee
- presets geo + zoom narratif + ponts directs globe -> graphe -> Orion

### P5-02 couche epistemique continue
- filtre `observation only`, `hypotheses`, `causalite probable`
- confiance/source/delai affiches partout

### P5-03 moteur de decouverte prudent
- suggestions de motifs et chaines causales prioritaires
- garde fous anti dogme (explication des limites + confondants)

## Rythme de livraison

- cadence: lots courts, validables localement
- gate qualite minimum par lot:
  - `npm run build`
  - smoke test UI
  - note de statut mise a jour dans `docs/`

## Lot actif maintenant

- lot en cours: **stabilisation P4/P5 + packaging demo robuste**
