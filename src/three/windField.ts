export interface WindSample {
  /** Eastward wind velocity component (km/h) */
  u: number;
  /** Northward wind velocity component (km/h) */
  v: number;
  /** Wind speed in km/h */
  speedKmh: number;
  /** Wind speed in knots */
  speedKts: number;
  /** Meteorological direction wind is blowing TOWARD (degrees clockwise from North, 0-359) for visual arrow */
  flowAngleDeg: number;
  /** Meteorological direction wind is coming FROM (cardinal label, e.g. NE, SW) */
  fromCardinal: string;
  /** Estimated surface air temperature (°C) */
  tempC: number;
  /** Surface barometric pressure (hPa) */
  pressureHpa: number;
  /** Estimated precipitation rate (mm/h) */
  rainMmHr: number;
  /** Short Bahasa Malaysia condition summary */
  condition: string;
}

export interface WindStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: 'MY_CORE' | 'REGIONAL';
}

export const WIND_STATIONS: WindStation[] = [
  { id: 'ws-kl', name: 'Kuala Lumpur', lat: 2.95, lon: 101.68, region: 'MY_CORE' },
  { id: 'ws-pen', name: 'George Town', lat: 5.41, lon: 100.33, region: 'MY_CORE' },
  { id: 'ws-jb', name: 'Singapura', lat: 1.35, lon: 103.82, region: 'MY_CORE' },
  { id: 'ws-kch', name: 'Kuching', lat: 1.55, lon: 110.35, region: 'MY_CORE' },
  { id: 'ws-bki', name: 'Kota Kinabalu', lat: 5.98, lon: 116.07, region: 'MY_CORE' },
  { id: 'ws-kb', name: 'Kota Bharu', lat: 6.12, lon: 102.25, region: 'MY_CORE' },
  { id: 'ws-medan', name: 'Medan', lat: 3.59, lon: 98.67, region: 'REGIONAL' },
  { id: 'ws-phuket', name: 'Phuket', lat: 7.88, lon: 98.39, region: 'REGIONAL' },
  { id: 'ws-hcm', name: 'Ho Chi Minh', lat: 10.82, lon: 106.63, region: 'REGIONAL' },
  { id: 'ws-pontianak', name: 'Pontianak', lat: -0.02, lon: 109.34, region: 'REGIONAL' },
  { id: 'ws-jkt', name: 'Jakarta', lat: -6.2, lon: 106.84, region: 'REGIONAL' },
  { id: 'ws-bkk', name: 'Bangkok', lat: 13.75, lon: 100.5, region: 'REGIONAL' },
];

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function degToCardinal(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 45) % 8;
  return CARDINALS[idx];
}

function gaussian2D(
  lat: number,
  lon: number,
  cLat: number,
  cLon: number,
  sigLat: number,
  sigLon: number
): number {
  let dLon = lon - cLon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLat = lat - cLat;
  return Math.exp(-((dLat * dLat) / (2 * sigLat * sigLat) + (dLon * dLon) / (2 * sigLon * sigLon)));
}

/**
 * Evaluates a smooth, continuous global wind vector field (u = East km/h, v = North km/h).
 * Tuned around Malaysia, KLIA, Strait of Malacca, and South China Sea so the NE monsoon
 * corridor displays the exact vivid indigo -> cyan -> lime-yellow wind surge gradient.
 */
export function sampleWindVector(lat: number, lon: number): { u: number; v: number } {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  // 1. Baseline planetary circulation (equatorial easterlies + mid-latitude westerlies + Rossby waves)
  let u =
    -11.0 * Math.cos(latRad * 2.1) +
    15.5 * Math.pow(Math.sin(latRad * 1.85), 2) * Math.sign(Math.abs(lat) - 24) +
    5.5 * Math.sin(lonRad * 2.2 + latRad * 1.4);
  let v =
    4.5 * Math.cos(lonRad * 2.5 - latRad * 1.7) +
    3.5 * Math.sin(lonRad * 3.8 + latRad * 2.1);

  // 2. South China Sea NE Monsoon Surge (signature bright turquoise -> lime-yellow corridor NE of Malaysia!)
  const scsSurge = gaussian2D(lat, lon, 7.6, 108.4, 4.6, 5.2);
  u += -28.0 * scsSurge;
  v += -26.0 * scsSurge;

  // Secondary South China Sea jet tongue sweeping toward Peninsular East Coast & Natuna
  const scsTongue = gaussian2D(lat, lon, 4.4, 105.6, 3.4, 3.6);
  u += -14.0 * scsTongue;
  v += -16.5 * scsTongue;

  // 3. Calm sheltered lee pocket over Peninsular Malaysia / KLIA / Strait of Malacca (6-14 km/h purple-blue zone)
  const kliaLee = gaussian2D(lat, lon, 3.1, 101.4, 2.7, 2.4);
  u = u * (1 - 0.65 * kliaLee) + 6.5 * kliaLee;
  v = v * (1 - 0.65 * kliaLee) + 4.2 * kliaLee;

  // 4. Borneo / Kuching & Sabah coastal flow
  const borneoFlow = gaussian2D(lat, lon, 2.2, 111.5, 3.2, 3.8);
  u += 7.5 * borneoFlow;
  v += 6.0 * borneoFlow;

  // 5. Philippine Sea tropical vortex (counter-clockwise circulation in Northern Hemisphere)
  const philDistLat = lat - 16.5;
  const philDistLon = lon - 128.5;
  const philEnv = gaussian2D(lat, lon, 16.5, 128.5, 5.2, 5.5);
  u += (-philDistLat * 4.4 - 4.0) * philEnv;
  v += (philDistLon * 4.4) * philEnv;

  // 6. Bay of Bengal monsoon stream (KLIA -> Middle East / Europe corridor)
  const bobSurge = gaussian2D(lat, lon, 11.5, 88.0, 5.5, 6.0);
  u += -22.0 * bobSurge;
  v += -12.0 * bobSurge;

  // 7. Arabian Sea / Indian Ocean jet stream
  const arabJet = gaussian2D(lat, lon, 20.5, 65.0, 5.8, 10.5);
  u += 29.0 * arabJet;
  v += 6.0 * arabJet;

  // 8. Southern Indian Ocean / NW Australia trade band
  const ausBand = gaussian2D(lat, lon, -18.5, 119.0, 6.0, 9.0);
  u += -26.0 * ausBand;
  v += 11.0 * ausBand;

  // Subtle fine-scale organic atmospheric ripple
  u += 2.4 * Math.sin(lat * 0.55 + lon * 0.42);
  v += 2.2 * Math.cos(lat * 0.48 - lon * 0.51);

  return { u, v };
}

/**
 * Full meteorological readout at a geographic coordinate (lat, lon).
 */
export function sampleWindAt(lat: number, lon: number): WindSample {
  const { u, v } = sampleWindVector(lat, lon);
  const speedKmh = Math.max(1, Math.round(Math.hypot(u, v)));
  const speedKts = Math.max(1, Math.round(speedKmh * 0.539957));

  // Direction wind is blowing TOWARD (0 = North, 90 = East, 180 = South, 270 = West)
  const flowAngleDeg = Math.round(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360);
  // Meteorological wind direction is where wind comes FROM (+180 deg)
  const fromDeg = (flowAngleDeg + 180) % 360;
  const fromCardinal = degToCardinal(fromDeg);

  // Realistic latitude-based temperature + wind chill/convection variation
  const baseTemp = 31 - Math.abs(lat) * 0.44 + Math.sin((lon * Math.PI) / 90) * 1.4;
  const tempC = Math.round((baseTemp - Math.min(4, speedKmh * 0.05)) * 10) / 10;

  // Barometric pressure dips in strong wind/monsoon/vortex zones
  const pressureHpa = Math.round(1013 - Math.max(0, speedKmh - 12) * 0.32);

  // Rain rate correlates with strong humid equatorial surges
  const tropicalFactor = Math.max(0, 1 - Math.abs(lat) / 28);
  const rainMmHr =
    speedKmh > 26
      ? Math.round((speedKmh - 22) * 0.65 * tropicalFactor * 10) / 10
      : speedKmh > 16 && tropicalFactor > 0.65
      ? Math.round((speedKmh - 14) * 0.3 * 10) / 10
      : 0;

  let condition = 'Cerah Berawan';
  if (speedKmh >= 42) condition = 'Angin Kencang & Ribut';
  else if (speedKmh >= 30) condition = 'Luruan Monsun Aktif';
  else if (rainMmHr >= 2) condition = 'Hujan Renyai / Sederhana';
  else if (speedKmh >= 16) condition = 'Berangin Sederhana';
  else condition = 'Tenang & Cerah';

  return {
    u,
    v,
    speedKmh,
    speedKts,
    flowAngleDeg,
    fromCardinal,
    tempC,
    pressureHpa,
    rainMmHr,
    condition,
  };
}

// Windy-inspired smooth meteorological color ramp (deep violet -> cobalt -> cyan -> mint -> chartreuse yellow -> amber)
const COLOR_STOPS: Array<[number, number, number, number]> = [
  [0, 74, 52, 168],     // Deep indigo-violet (calm)
  [9, 89, 76, 198],     // Soft violet-indigo
  [16, 68, 122, 214],   // Cobalt azure
  [24, 64, 186, 218],   // Turquoise cyan
  [33, 108, 224, 182],  // Aqua mint
  [42, 196, 240, 108],  // Luminous chartreuse yellow-green
  [52, 248, 206, 74],   // Golden yellow
  [65, 249, 128, 72],   // Warm storm coral
];

export function windSpeedToRGB(speedKmh: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(65, speedKmh));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [s0, r0, g0, b0] = COLOR_STOPS[i];
    const [s1, r1, g1, b1] = COLOR_STOPS[i + 1];
    if (clamped >= s0 && clamped <= s1) {
      const t = (clamped - s0) / (s1 - s0);
      return [
        Math.round(r0 + (r1 - r0) * t),
        Math.round(g0 + (g1 - g0) * t),
        Math.round(b0 + (b1 - b0) * t),
      ];
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  return [last[1], last[2], last[3]];
}
