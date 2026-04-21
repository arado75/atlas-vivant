import type { GraphEdge, GraphNode } from "../types/atlas";

export const causalNodes: GraphNode[] = [
  {
    id: "solar_radiation",
    label: "Rayonnement solaire",
    domain: "Cosmique",
    description: "Impulsion energetique de fond."
  },
  {
    id: "wind_patterns",
    label: "Vents",
    domain: "Atmosphere",
    description: "Organisation des flux atmospheriques."
  },
  {
    id: "ocean_temperature",
    label: "Temperature oceanique",
    domain: "Ocean",
    description: "Variable pivot pour le systeme marin."
  },
  {
    id: "phytoplankton",
    label: "Phytoplancton",
    domain: "Biosphere",
    description: "Base trophique sensible aux variations physiques."
  },
  {
    id: "krill_density",
    label: "Densite de krill",
    domain: "Biosphere",
    description: "Maillon cle entre plancton et poissons."
  },
  {
    id: "fish_abundance",
    label: "Abondance de poissons",
    domain: "Biosphere",
    description: "Proxy de disponibilite halieutique."
  },
  {
    id: "fishing_pressure",
    label: "Pression de peche",
    domain: "Humain",
    description: "Intensite d'exploitation des zones de peche."
  },
  {
    id: "fish_price",
    label: "Prix du poisson",
    domain: "Humain",
    description: "Effet socio-economique visible."
  },
  {
    id: "coastal_tourism",
    label: "Tourisme cotier",
    domain: "Humain",
    description: "Activite sensible a l'etat des ecosystems."
  }
];

export const causalEdges: GraphEdge[] = [
  {
    id: "solar_to_wind",
    source: "solar_radiation",
    target: "wind_patterns",
    status: "robust_causality",
    confidence: 0.91,
    delay: "0-3 jours"
  },
  {
    id: "wind_to_ocean",
    source: "wind_patterns",
    target: "ocean_temperature",
    status: "probable_causality",
    confidence: 0.76,
    delay: "1-6 semaines"
  },
  {
    id: "ocean_to_phyto",
    source: "ocean_temperature",
    target: "phytoplankton",
    status: "probable_causality",
    confidence: 0.72,
    delay: "2-5 semaines"
  },
  {
    id: "phyto_to_krill",
    source: "phytoplankton",
    target: "krill_density",
    status: "probable_causality",
    confidence: 0.74,
    delay: "1-2 mois"
  },
  {
    id: "ocean_to_krill",
    source: "ocean_temperature",
    target: "krill_density",
    status: "correlation",
    confidence: 0.61,
    delay: "0-2 mois"
  },
  {
    id: "krill_to_fish",
    source: "krill_density",
    target: "fish_abundance",
    status: "probable_causality",
    confidence: 0.71,
    delay: "1-3 mois"
  },
  {
    id: "fish_to_fishing",
    source: "fish_abundance",
    target: "fishing_pressure",
    status: "correlation",
    confidence: 0.63,
    delay: "2-6 semaines"
  },
  {
    id: "fishing_to_price",
    source: "fishing_pressure",
    target: "fish_price",
    status: "probable_causality",
    confidence: 0.69,
    delay: "1-3 semaines"
  },
  {
    id: "fish_to_tourism",
    source: "fish_abundance",
    target: "coastal_tourism",
    status: "correlation",
    confidence: 0.52,
    delay: "1 saison"
  }
];
