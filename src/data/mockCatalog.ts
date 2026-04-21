import type { LayerMeta, TimelineMoment } from "../types/atlas";

export const timelineMoments: TimelineMoment[] = [
  { index: 0, shortLabel: "Jan", label: "Janvier 2026", compareLabel: "Janvier 2025", season: "Hiver", note: "Base hivernale et inertie forte." },
  { index: 1, shortLabel: "Fev", label: "Fevrier 2026", compareLabel: "Fevrier 2025", season: "Hiver", note: "Flux atlantiques encore denses." },
  { index: 2, shortLabel: "Mar", label: "Mars 2026", compareLabel: "Mars 2025", season: "Transition", note: "Bascules progressives sur les routes et gradients." },
  { index: 3, shortLabel: "Avr", label: "Avril 2026", compareLabel: "Avril 2025", season: "Printemps", note: "Ouverture des signatures biologiques." },
  { index: 4, shortLabel: "Mai", label: "Mai 2026", compareLabel: "Mai 2025", season: "Printemps", note: "Montée de l'activite mobile et oceanique." },
  { index: 5, shortLabel: "Jun", label: "Juin 2026", compareLabel: "Juin 2025", season: "Ete", note: "Les contrastes thermiques deviennent lisibles." },
  { index: 6, shortLabel: "Jul", label: "Juillet 2026", compareLabel: "Juillet 2025", season: "Ete", note: "Point haut des nappes et trajectoires." },
  { index: 7, shortLabel: "Aou", label: "Aout 2026", compareLabel: "Aout 2025", season: "Ete", note: "Les flux persistent mais se redistribuent." },
  { index: 8, shortLabel: "Sep", label: "Septembre 2026", compareLabel: "Septembre 2025", season: "Transition", note: "Retour progressif des lignes de force." },
  { index: 9, shortLabel: "Oct", label: "Octobre 2026", compareLabel: "Octobre 2025", season: "Automne", note: "Recomposition des couloirs aeriens et marins." },
  { index: 10, shortLabel: "Nov", label: "Novembre 2026", compareLabel: "Novembre 2025", season: "Automne", note: "Refroidissement et recentrage du signal." },
  { index: 11, shortLabel: "Dec", label: "Decembre 2026", compareLabel: "Decembre 2025", season: "Hiver", note: "Cycle simule referme et comparable." }
];

export const timelineLabels = timelineMoments.map((moment) => moment.shortLabel);

export const layerCatalog: LayerMeta[] = [
  {
    id: "wind_patterns",
    brickId: "wind_patterns",
    label: "Vents",
    family: "Atmosphere",
    description: "Flux majeurs, jet streams et nappes de circulation.",
    kind: "flows",
    color: "#86d0ff",
    visibleByDefault: true
  },
  {
    id: "surface_temperature",
    brickId: "surface_temperature",
    label: "Temperature",
    family: "Climat",
    description: "Nappes thermiques de surface et gradients saisonniers.",
    kind: "heat",
    color: "#ff8f70",
    visibleByDefault: true
  },
  {
    id: "ocean_currents",
    brickId: "ocean_currents",
    label: "Courants marins",
    family: "Ocean",
    description: "Courants majeurs visibles comme lignes d'inertie.",
    kind: "flows",
    color: "#5ae3c3",
    visibleByDefault: true
  },
  {
    id: "aviation_routes",
    brickId: "aviation_routes",
    label: "Aviation",
    family: "Mobilite",
    description: "Routes aeriennes simulees avec traces temporelles.",
    kind: "tracks",
    color: "#ffd87d",
    visibleByDefault: true
  },
  {
    id: "maritime_routes",
    brickId: "maritime_routes",
    label: "Maritime",
    family: "Mobilite",
    description: "Trajectoires maritimes et routes intercontinentales.",
    kind: "tracks",
    color: "#72d8ff",
    visibleByDefault: true
  },
  {
    id: "biosphere_migrations",
    brickId: "biosphere_migrations",
    label: "Biosphere",
    family: "Vivant",
    description: "Migrations biologiques et signatures de deplacement.",
    kind: "tracks",
    color: "#7cf1a8",
    visibleByDefault: true
  },
  {
    id: "healthy_life_expectancy",
    brickId: "healthy_life_expectancy",
    label: "Vie en bonne sante",
    family: "Societe",
    description: "Pulses regionaux pour un indicateur humain avance.",
    kind: "pulses",
    color: "#c89cff",
    visibleByDefault: false
  }
];
