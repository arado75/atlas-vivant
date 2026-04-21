import { clamp } from "./formatters";

interface TemperatureStop {
  tempC: number;
  color: [number, number, number];
}

const temperatureStops: TemperatureStop[] = [
  // Echelle demandee:
  // -20 violet, 0 bleu, bleute jusqu'a 10, 20 orange, 30 rouge, 40 rouge fonce.
  { tempC: -20, color: [92, 36, 176] },
  { tempC: 0, color: [36, 102, 232] },
  { tempC: 10, color: [74, 172, 246] },
  { tempC: 20, color: [255, 146, 46] },
  { tempC: 30, color: [214, 52, 40] },
  { tempC: 40, color: [104, 10, 10] }
];

function channelToHex(channel: number): string {
  return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0");
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${channelToHex(rgb[0])}${channelToHex(rgb[1])}${channelToHex(rgb[2])}`;
}

function mix(a: number, b: number, ratio: number): number {
  return a + (b - a) * ratio;
}

export function getTemperatureLegendStops(): Array<{ tempC: number; color: string }> {
  return temperatureStops.map((stop) => ({
    tempC: stop.tempC,
    color: rgbToHex(stop.color)
  }));
}

export function intensityToTemperatureC(intensity: number, minC = -20, maxC = 44): number {
  const bounded = clamp(intensity, 0, 1);
  return minC + (maxC - minC) * bounded;
}

export function temperatureToColor(tempC: number): string {
  if (tempC <= temperatureStops[0].tempC) {
    return rgbToHex(temperatureStops[0].color);
  }

  const lastStop = temperatureStops[temperatureStops.length - 1];
  if (tempC >= lastStop.tempC) {
    return rgbToHex(lastStop.color);
  }

  for (let index = 0; index < temperatureStops.length - 1; index += 1) {
    const left = temperatureStops[index];
    const right = temperatureStops[index + 1];

    if (tempC >= left.tempC && tempC <= right.tempC) {
      const ratio = (tempC - left.tempC) / Math.max(0.0001, right.tempC - left.tempC);
      return rgbToHex([
        mix(left.color[0], right.color[0], ratio),
        mix(left.color[1], right.color[1], ratio),
        mix(left.color[2], right.color[2], ratio)
      ]);
    }
  }

  return rgbToHex(lastStop.color);
}

export function formatTemperature(tempC: number): string {
  return `${tempC.toFixed(1).replace(".", ",")} C`;
}

export function temperatureTrendGlyph(deltaC: number): "up" | "down" | "stable" {
  if (deltaC >= 0.35) {
    return "up";
  }

  if (deltaC <= -0.35) {
    return "down";
  }

  return "stable";
}

export function temperatureTrendSize(deltaC: number): number {
  const amplitude = Math.abs(deltaC);
  return clamp(8 + amplitude * 2.2, 8, 14);
}
