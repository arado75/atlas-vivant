import { timelineMoments } from "../data/mockCatalog";
import type { TimeMode } from "../types/atlas";
import type { BrickDefinition } from "../types/brick";

export interface InstrumentInsight {
  headline: string;
  summary: string;
  whyItMatters: string;
  blindSpot: string;
  nextChecks: string[];
  usefulQuestions: string[];
}

function domainUseCase(domain: string): string {
  const normalized = domain.toLowerCase();

  if (normalized.includes("atmos")) {
    return "Elle aide a comprendre les forçages amont et les redistributions rapides a l'echelle planetaire.";
  }

  if (normalized.includes("ocean")) {
    return "Elle rend lisibles des inerties lentes qui structurent ensuite le vivant et les activites humaines.";
  }

  if (normalized.includes("bio")) {
    return "Elle relie les flux physiques a des reponses du vivant, souvent plus diffuses mais decisives.";
  }

  if (normalized.includes("soc") || normalized.includes("health")) {
    return "Elle montre comment des indicateurs humains emergent a partir de contextes plus larges et moins visibles.";
  }

  if (normalized.includes("human") || normalized.includes("mobil")) {
    return "Elle rend concret l'impact des flux sur les circulations, pressions et vulnerabilites humaines.";
  }

  return "Elle permet de relier un signal local a un systeme plus vaste, sans perdre le contexte.";
}

function domainBlindSpot(domain: string): string {
  const normalized = domain.toLowerCase();

  if (normalized.includes("atmos") || normalized.includes("ocean")) {
    return "Le signal est net visuellement, mais les delais et facteurs confondants restent faciles a sous-estimer.";
  }

  if (normalized.includes("bio")) {
    return "Le vivant reagit rarement de facon lineaire; une belle signature visuelle ne suffit pas a conclure.";
  }

  if (normalized.includes("soc") || normalized.includes("health")) {
    return "Les indicateurs humains combinent perception, contexte social et conditions objectives: attention au sur-sens.";
  }

  return "Un motif propre n'est pas encore une causalite solide; la confiance doit rester explicite.";
}

export function buildInstrumentInsight(
  brick: BrickDefinition | undefined,
  currentStep: number,
  timeMode: TimeMode,
  compareEnabled: boolean
): InstrumentInsight {
  const moment = timelineMoments[currentStep];

  if (!brick) {
    return {
      headline: "Vue d'ensemble en attente de focus",
      summary: `Le globe montre actuellement un contexte multi-couches sur ${moment.label}.`,
      whyItMatters:
        "Choisir une brique fait passer l'application d'une simple visualisation a une lecture orientee et utile.",
      blindSpot:
        "Sans focus explicite, l'outil est contemplatif mais moins decisif pour l'investigation.",
      nextChecks: [
        "Selectionner une brique noyau pour ancrer l'exploration.",
        "Activer la comparaison N / N-1 pour faire ressortir un ecart structurel.",
        "Basculer ensuite dans le graphe causal pour remonter vers les causes ou descendre vers les effets."
      ],
      usefulQuestions: [
        "Quel signal merite une lecture prioritaire aujourd'hui ?",
        "Quel contraste temporel serait le plus instructif ?",
        "Quel niveau de confiance est acceptable pour cette exploration ?"
      ]
    };
  }

  const upstreamCount = brick.relations.upstream.length;
  const downstreamCount = brick.relations.downstream.length;
  const motionMode = timeMode === "paused" ? "en coupe fixe" : timeMode === "realtime" ? "en lecture continue" : "en lecture acceleree";

  return {
    headline: `${brick.name} ${motionMode}`,
    summary: `${brick.description} Lecture courante sur ${moment.label}${compareEnabled ? ` avec reference ${moment.compareLabel}` : ""}.`,
    whyItMatters: domainUseCase(brick.domain),
    blindSpot: domainBlindSpot(brick.domain),
    nextChecks: [
      `Verifier les ${upstreamCount} relations amont pour voir ce qui force vraiment ${brick.name.toLowerCase()}.`,
      downstreamCount > 0
        ? `Observer les ${downstreamCount} relations aval pour estimer l'impact et non seulement le motif.`
        : "Chercher si la brique manque encore de relations aval ou si elle reste surtout descriptive.",
      compareEnabled
        ? `Comparer l'ecart entre ${moment.label} et ${moment.compareLabel} avant d'interpreter une tendance.`
        : "Activer la comparaison annuelle si vous cherchez une divergence structurelle plutot qu'un etat ponctuel."
    ],
    usefulQuestions: [
      "Ce que je vois est-il une observation, une correlation ou une causalite probable ?",
      "Quel delai de propagation plausible se cache derriere ce signal ?",
      "Quelle autre brique devrait etre ouverte juste apres pour consolider ou contester cette lecture ?"
    ]
  };
}
