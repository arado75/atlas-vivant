import type { LayerDataset, LonLat } from "../types/atlas";

function interpolateRoute(stops: LonLat[], steps = 12): LonLat[] {
  if (stops.length < 2) {
    return Array.from({ length: steps }, () => stops[0] ?? [0, 0]);
  }

  const segments = stops.length - 1;
  const result: LonLat[] = [];

  for (let step = 0; step < steps; step += 1) {
    const progress = step / Math.max(steps - 1, 1);
    const scaled = progress * segments;
    const segmentIndex = Math.min(segments - 1, Math.floor(scaled));
    const localProgress = scaled - segmentIndex;
    const start = stops[segmentIndex];
    const end = stops[segmentIndex + 1];

    result.push([
      start[0] + (end[0] - start[0]) * localProgress,
      start[1] + (end[1] - start[1]) * localProgress
    ]);
  }

  return result;
}

function shiftRoute(route: LonLat[], lonOffset: number, latOffset: number): LonLat[] {
  return route.map(([lon, lat]) => [lon + lonOffset, lat + latOffset]);
}

function sequence(base: number, swing: number, steps = 12): number[] {
  return Array.from({ length: steps }, (_, index) => {
    const wave = Math.sin((Math.PI * 2 * index) / steps);
    return Math.max(0.18, base + wave * swing);
  });
}

export const mockLayerData: Record<string, LayerDataset> = {
  wind_patterns: {
    flows: [
      {
        id: "jet_north_atlantic",
        label: "Jet Atlantique Nord",
        points: [
          [-95, 38],
          [-82, 41],
          [-68, 45],
          [-52, 50],
          [-34, 55],
          [-14, 57],
          [6, 55],
          [25, 51]
        ],
        color: "#85d7ff",
        opacity: 0.72,
        width: 2.1,
        confidence: 0.84
      },
      {
        id: "trade_pacific",
        label: "Alizes Pacifique",
        points: [
          [-160, 14],
          [-145, 11],
          [-130, 8],
          [-112, 6],
          [-96, 6],
          [-82, 8],
          [-68, 12]
        ],
        color: "#68c3ff",
        opacity: 0.58,
        width: 1.8,
        confidence: 0.71
      },
      {
        id: "southern_stream",
        label: "Ceinture australe",
        points: [
          [-170, -52],
          [-145, -54],
          [-118, -55],
          [-90, -56],
          [-60, -57],
          [-28, -58],
          [6, -57],
          [40, -56],
          [74, -55],
          [108, -53]
        ],
        color: "#9be8ff",
        opacity: 0.52,
        width: 1.8,
        confidence: 0.76
      }
    ]
  },
  surface_temperature: {
    heat: [
      {
        id: "north_atlantic_heat",
        label: "Anomalie Atlantique Nord",
        center: [-25, 42],
        compareCenter: [-29, 40],
        radius: 18,
        color: "#ff835d",
        intensity: sequence(0.82, 0.1),
        sourceType: "fallback",
        confidence: 0.68
      },
      {
        id: "indian_ocean_heat",
        label: "Ocean Indien",
        center: [72, -6],
        compareCenter: [69, -8],
        radius: 22,
        color: "#ffb15c",
        intensity: sequence(0.58, 0.08),
        sourceType: "fallback",
        confidence: 0.72
      },
      {
        id: "arctic_pulse",
        label: "Arctique",
        center: [35, 73],
        compareCenter: [20, 71],
        radius: 14,
        color: "#ffcab4",
        intensity: sequence(0.16, 0.09),
        sourceType: "fallback",
        confidence: 0.63
      }
    ],
    cityTemperatures: [
      { id: "paris", label: "Paris", position: [2.35, 48.85], baselineOffsetC: 0.8, trendFactor: 1.1, sourceType: "fallback" },
      { id: "mumbai", label: "Mumbai", position: [72.88, 19.08], baselineOffsetC: 1.9, trendFactor: 0.95, sourceType: "fallback" },
      { id: "lagos", label: "Lagos", position: [3.39, 6.45], baselineOffsetC: 1.2, trendFactor: 0.88, sourceType: "fallback" },
      { id: "montreal", label: "Montreal", position: [-73.57, 45.5], baselineOffsetC: -2.4, trendFactor: 1.2, sourceType: "fallback" },
      { id: "tokyo", label: "Tokyo", position: [139.69, 35.68], baselineOffsetC: 0.9, trendFactor: 1, sourceType: "fallback" },
      { id: "santiago", label: "Santiago", position: [-70.66, -33.45], baselineOffsetC: -1.1, trendFactor: 1.05, sourceType: "fallback" }
    ],
    eventZones: [
      {
        id: "mediterranean_heatwave",
        label: "Canicule mediterraneenne",
        kind: "heatwave",
        center: [16, 41],
        radius: 20,
        intensity: 0.78,
        startMs: Date.UTC(2026, 6, 3),
        endMs: Date.UTC(2026, 8, 11)
      },
      {
        id: "south_asia_heatwave",
        label: "Canicule Asie du Sud",
        kind: "heatwave",
        center: [78, 23],
        radius: 24,
        intensity: 0.84,
        startMs: Date.UTC(2026, 3, 15),
        endMs: Date.UTC(2026, 5, 22)
      },
      {
        id: "north_atlantic_storm",
        label: "Tempete Atlantique Nord",
        kind: "storm",
        center: [-38, 46],
        radius: 16,
        intensity: 0.62,
        startMs: Date.UTC(2026, 0, 4),
        endMs: Date.UTC(2026, 2, 2)
      }
    ]
  },
  ocean_currents: {
    flows: [
      {
        id: "gulf_stream",
        label: "Gulf Stream",
        points: [
          [-82, 25],
          [-79, 28],
          [-74, 32],
          [-68, 36],
          [-61, 40],
          [-53, 44],
          [-45, 48],
          [-34, 52],
          [-22, 56]
        ],
        color: "#52f3ca",
        opacity: 0.72,
        width: 2.6,
        confidence: 0.86
      },
      {
        id: "kuroshio",
        label: "Kuroshio",
        points: [
          [123, 23],
          [127, 27],
          [132, 31],
          [137, 35],
          [143, 38],
          [150, 40],
          [158, 42]
        ],
        color: "#34d2d0",
        opacity: 0.68,
        width: 2.2,
        confidence: 0.82
      },
      {
        id: "circumpolar",
        label: "Courant circumpolaire",
        points: [
          [-170, -54],
          [-145, -55],
          [-120, -56],
          [-95, -57],
          [-70, -58],
          [-42, -58],
          [-15, -57],
          [15, -56],
          [45, -56],
          [74, -55],
          [108, -54],
          [138, -53]
        ],
        color: "#7fffe7",
        opacity: 0.5,
        width: 1.8,
        confidence: 0.73
      }
    ]
  },
  aviation_routes: {
    tracks: [
      {
        id: "atlantic_bridge",
        label: "Pont aerien Atlantique",
        path: interpolateRoute([
          [-74, 40],
          [-65, 44],
          [-53, 48],
          [-40, 51],
          [-25, 53],
          [-11, 52],
          [2, 49]
        ]),
        comparePath: interpolateRoute([
          [-74, 40],
          [-66, 43],
          [-56, 47],
          [-44, 50],
          [-30, 52],
          [-14, 51],
          [2, 49]
        ]),
        color: "#ffd87d",
        width: 2.1,
        confidence: 0.78
      },
      {
        id: "europe_asia",
        label: "Couloir Europe - Asie",
        path: interpolateRoute([
          [2, 49],
          [14, 53],
          [28, 56],
          [44, 56],
          [60, 54],
          [78, 49],
          [95, 43],
          [110, 36],
          [121, 31]
        ]),
        comparePath: interpolateRoute([
          [2, 49],
          [13, 52],
          [25, 54],
          [40, 54],
          [57, 52],
          [75, 47],
          [92, 42],
          [108, 35],
          [121, 31]
        ]),
        color: "#ffe7aa",
        width: 2,
        confidence: 0.74
      }
    ]
  },
  maritime_routes: {
    tracks: [
      {
        id: "asia_europe_shipping",
        label: "Route Asie - Europe",
        path: interpolateRoute([
          [121, 31],
          [116, 24],
          [111, 18],
          [105, 10],
          [102, 4],
          [95, 2],
          [84, 5],
          [74, 9],
          [64, 12],
          [56, 13],
          [49, 12],
          [45, 11],
          [43, 12],
          [44, 16],
          [42, 22],
          [36, 30],
          [32, 31],
          [26, 34],
          [19, 36],
          [12, 37],
          [6, 41],
          [3, 46],
          [4, 51]
        ]),
        comparePath: interpolateRoute([
          [121, 31],
          [115, 23],
          [109, 16],
          [104, 8],
          [101, 3],
          [94, 1],
          [82, 4],
          [71, 8],
          [60, 11],
          [52, 12],
          [47, 11],
          [44, 10],
          [42, 11],
          [42, 15],
          [40, 20],
          [35, 28],
          [31, 30],
          [24, 33],
          [16, 35],
          [9, 37],
          [4, 40],
          [1, 45],
          [3, 50]
        ]),
        color: "#6fd8ff",
        width: 2.4,
        confidence: 0.8
      },
      {
        id: "south_america_shipping",
        label: "Arc sud Atlantique",
        path: interpolateRoute([
          [-46, -23],
          [-42, -21],
          [-37, -18],
          [-32, -14],
          [-28, -10],
          [-24, -5],
          [-20, -1],
          [-16, 4],
          [-11, 9],
          [-6, 13],
          [-1, 17],
          [5, 21],
          [11, 26],
          [16, 30],
          [20, 34]
        ]),
        comparePath: shiftRoute(
          interpolateRoute([
            [-46, -23],
            [-41, -20],
            [-35, -16],
            [-30, -12],
            [-26, -8],
            [-22, -3],
            [-18, 2],
            [-14, 6],
            [-9, 10],
            [-4, 14],
            [1, 19],
            [7, 23],
            [12, 27],
            [17, 31],
            [20, 34]
          ]),
          -1,
          1
        ),
        color: "#85f2ff",
        width: 2,
        confidence: 0.7
      }
    ]
  },
  biosphere_migrations: {
    tracks: [
      {
        id: "north_whales",
        label: "Migrations baleines",
        path: interpolateRoute([
          [-64, 18],
          [-60, 24],
          [-55, 30],
          [-50, 36],
          [-44, 42],
          [-36, 49],
          [-28, 55],
          [-18, 61]
        ]),
        comparePath: interpolateRoute([
          [-65, 20],
          [-61, 26],
          [-56, 31],
          [-50, 37],
          [-43, 43],
          [-35, 50],
          [-27, 56],
          [-18, 61]
        ]),
        color: "#7cf1a8",
        width: 2.2,
        confidence: 0.66
      },
      {
        id: "pacific_birds",
        label: "Arc oiseaux Pacifique",
        path: interpolateRoute([
          [147, -36],
          [152, -24],
          [157, -10],
          [162, 5],
          [168, 20],
          [174, 34],
          [-174, 48]
        ]),
        comparePath: interpolateRoute([
          [145, -34],
          [151, -21],
          [157, -7],
          [163, 8],
          [169, 23],
          [176, 37],
          [-170, 50]
        ]),
        color: "#aefc8e",
        width: 1.9,
        confidence: 0.59
      }
    ]
  },
  healthy_life_expectancy: {
    pulses: [
      {
        id: "japan_health",
        label: "Japon",
        center: [138, 37],
        color: "#c89cff",
        radius: 18,
        values: sequence(0.86, 0.04),
        confidence: 0.81
      },
      {
        id: "nordics_health",
        label: "Nordiques",
        center: [16, 62],
        color: "#d7b8ff",
        radius: 20,
        values: sequence(0.82, 0.03),
        confidence: 0.78
      },
      {
        id: "andes_health",
        label: "Andes",
        center: [-71, -16],
        color: "#a686ff",
        radius: 16,
        values: sequence(0.58, 0.05),
        confidence: 0.55
      }
    ]
  }
};




