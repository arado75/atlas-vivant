# Architecture MVP Atlas Vivant

## Objectif

Le MVP cherche a rendre credible la vision Atlas Vivant sans construire toute l'infrastructure finale. L'accent est mis sur:

- une interface calme et sombre
- une architecture modulaire
- une distinction explicite entre donnees, relations et niveau de confiance
- un registre de briques extensible
- une separation nette entre visualisation, etat UI et logique de chargement

## Choix techniques

### Frontend

- **React + TypeScript + Vite**
- **Zustand** pour l'etat global du MVP
- **SVG + d3-geo** pour un globe interactif sans dependance a un fond cartographique externe
- **YAML** pour parser les briques versionnees

### Pourquoi un globe SVG plutot qu'un SDK cartographique

Pour le MVP, un globe SVG orthographique:

- couvre l'exigence "carte ou globe interactif"
- permet un rendu plus poetique et plus maitrise
- elimine la dependance immediate a des tuiles ou tokens externes
- suffit pour afficher couches, traces, halos et pulses

Dans une phase suivante, ce module pourra etre remplace par `deck.gl + MapLibre` ou `Cesium` si l'on veut de la 3D volumique ou des jeux de donnees massifs.

## Decoupage modulaire

### `src/app/store`

Etat transversal:

- temps courant
- lecture/pause
- longueur des traces
- mode comparaison
- couches visibles
- briques chargees
- selection de brique
- mode et focus du graphe causal

### `src/modules/map`

Responsabilites:

- rendre le globe
- gerer rotation et zoom
- projeter les donnees sur la sphere
- afficher les differents types de couches:
  - flows
  - tracks
  - heat
  - pulses

### `src/modules/time`

Responsabilites:

- piloter la lecture temporelle
- regler la memoire visuelle des traces
- activer la comparaison d'une periode de reference

### `src/modules/bricks`

Responsabilites:

- afficher le registre local
- montrer les briques chargees depuis `public/bricks`
- exposer les metadonnees, statut et maturite

### `src/modules/orion`

Responsabilites:

- recueillir une proposition de brique
- produire une analyse locale et contestable
- sugerer des connexions avec les briques existantes
- generer un preview YAML
- injecter la proposition dans le registre local

### `src/modules/causal`

Responsabilites:

- afficher un mini graphe causal lisible
- supporter deux modes:
  - `root`: remonter des consequences vers les causes
  - `tree`: descendre d'une cause vers les effets
- rendre visible le statut et la confiance des relations

## Modele de donnees

### Brique

Une brique contient:

- identite et version
- domaine
- statut
- description
- sources
- resolutions spatiale/temporelle
- observables
- relations amont / aval
- mode de visualisation
- maturite
- notes

Formats supportes dans le MVP:

- `.json`
- `.yaml`

### Couches de visualisation

Le MVP gere 4 primitives de rendu:

- `flows`: lignes de flux
- `tracks`: trajectoires temporelles avec trace et marqueur
- `heat`: halos de chaleur ou anomalies
- `pulses`: impulsions regionales pour indicateurs socio-humains

## Flux de chargement

1. l'application charge `public/bricks/manifest.json`
2. chaque fichier liste est recupere et parse en JSON ou YAML
3. les briques sont normalisees dans `loadBrickRegistry`
4. le registre alimente l'UI et Orion
5. les donnees simulees restent separees dans `src/data/mockAtlasData.ts`

## Evolution prevue

L'architecture a ete pensee pour permettre ensuite:

- un backend FastAPI ou NestJS
- une base Postgres/PostGIS
- une ingestion reelle par brique
- des jobs de rafraichissement
- une API de distribution de briques
- un moteur de scoring Orion plus robuste
- un graphe causal plus profond et multi-echelles

## Demarrage local

```bash
npm install
npm run dev
```

Si vous voulez une prochaine iteration, le meilleur axe naturel est:

1. brancher un vrai fond cartographique ou un globe WebGL
2. relier les briques a de vraies sources
3. externaliser Orion dans un service separe
4. ajouter un backend de registre et de validation
