import type { BrickStatus } from "../types/brick";

const statusAccents: Record<BrickStatus, string> = {
  core: "#7ed6ff",
  validated: "#7cf5bf",
  experimental: "#ffd67c",
  personal: "#ff9f8f",
  community: "#d1a6ff"
};

export function getStatusAccent(status: BrickStatus): string {
  return statusAccents[status];
}

export function getDomainAccent(domain: string): string {
  const normalized = domain.toLowerCase();

  if (normalized.includes("atmos") || normalized.includes("wind")) {
    return "#86d0ff";
  }

  if (normalized.includes("climat") || normalized.includes("temp")) {
    return "#ff8f70";
  }

  if (normalized.includes("ocean") || normalized.includes("marine")) {
    return "#5ae3c3";
  }

  if (normalized.includes("bio") || normalized.includes("krill") || normalized.includes("planct")) {
    return "#7cf1a8";
  }

  if (normalized.includes("health") || normalized.includes("soc") || normalized.includes("sante")) {
    return "#c89cff";
  }

  if (normalized.includes("human") || normalized.includes("mobil")) {
    return "#ffd87d";
  }

  return "#9bb9dd";
}

export function mixAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}
