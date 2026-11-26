export type FlightStatus =
  | 'TERJADWAL'
  | 'BOARDING'
  | 'TERTUNDA'
  | 'BERANGKAT'
  | 'MENGUDARA'
  | 'MENDEKAT'
  | 'MENDARAT'
  | 'DIALIHKAN';

export type ScheduleCategory = 'KEBERANGKATAN' | 'KEDATANGAN' | 'JADWAL';

export type NotificationScope = 'SEMUA' | 'DIPANTAU' | 'GANGGUAN_DAN_TIBA';

export type CameraPreset = 'KLIA' | 'MALAYSIA' | 'ASIA_PASIFIK' | 'GLOBAL' | 'IKUTI';

export type MapStyleId = 'jalan' | 'radar' | 'satelit';

export type StatusFilter = 'SEMUA' | 'MENGUDARA' | 'KEBERANGKATAN' | 'TERTUNDA' | 'MENDARAT';

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  region: 'MALAYSIA' | 'ASIA' | 'TIMUR_TENGAH' | 'EROPA' | 'AMERIKA' | 'OSEANIA';
}

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  airlineColor: string;
  aircraftType: string;
  registration: string;
  origin: string; // IATA code
  destination: string; // IATA code
  status: FlightStatus;
  previousStatus?: FlightStatus;
  /** 0.0 at origin -> 1.0 at destination */
  progress: number;
  /** Cruise speed in knots */
  cruiseSpeedKts: number;
  /** Current live speed in knots */
  speedKts: number;
  /** Cruise altitude in feet */
  cruiseAltitudeFt: number;
  /** Current live altitude in feet */
  altitudeFt: number;
  /** Heading in degrees 0-359 */
  headingDeg: number;
  /** Current live lat/lon */
  lat: number;
  lon: number;
  /** Scheduled departure ISO timestamp (ms) */
  scheduledDepartureMs: number;
  /** Estimated/actual departure timestamp (ms) */
  estimatedDepartureMs: number;
  /** Scheduled arrival timestamp (ms) */
  scheduledArrivalMs: number;
  /** Estimated/actual arrival timestamp (ms) */
  estimatedArrivalMs: number;
  /** Delay in minutes (positive = delayed, negative = early) */
  delayMinutes: number;
  departureTerminal: string;
  departureGate: string;
  arrivalTerminal: string;
  arrivalGate: string;
  /** Total flight duration in minutes */
  durationMinutes: number;
  /** Distance in km */
  distanceKm: number;
  /** Internal countdown seconds until next schedule transition when on ground */
  groundPhaseTimerSec: number;
  /** Reason note if delayed or diverted */
  statusNote?: string;
}

export interface ScheduleNotification {
  id: string;
  flightId: string;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  category: ScheduleCategory;
  previousStatus: FlightStatus;
  newStatus: FlightStatus;
  title: string;
  message: string;
  timestampMs: number;
  delayDeltaMinutes?: number;
  read: boolean;
  severity: 'info' | 'success' | 'warning' | 'alert';
}

export interface ProjectedLabel {
  id: string;
  code: string;
  subtitle: string;
  x: number;
  y: number;
  visible: boolean;
  kind: 'airport' | 'flight';
  status?: FlightStatus;
}

export interface KliaTrafficPoint {
  timeLabel: string;
  berlepas: number;
  ketibaan: number;
  tertangguh: number;
}

export interface ProjectedWindStation {
  id: string;
  name: string;
  x: number;
  y: number;
  speedKmh: number;
  flowAngleDeg: number;
  fromCardinal: string;
  lat: number;
  lon: number;
}

export interface PinnedWindProbe {
  lat: number;
  lon: number;
  speedKmh: number;
  speedKts: number;
  flowAngleDeg: number;
  fromCardinal: string;
  tempC: number;
  pressureHpa: number;
  rainMmHr: number;
  condition: string;
}

export const STATUS_META: Record<
  FlightStatus,
  {
    label: string;
    shortLabel: string;
    colorHex: string;
    threeColor: number;
    textClass: string;
    dotBgClass: string;
    borderClass: string;
  }
> = {
  TERJADWAL: {
    label: 'Dijadualkan',
    shortLabel: 'Dijadualkan',
    colorHex: '#94a3b8',
    threeColor: 0x94a3b8,
    textClass: 'text-slate-300',
    dotBgClass: 'bg-slate-400',
    borderClass: 'border-slate-500/40',
  },
  BOARDING: {
    label: 'Sedang Menaiki',
    shortLabel: 'Menaiki',
    colorHex: '#38bdf8',
    threeColor: 0x38bdf8,
    textClass: 'text-sky-300',
    dotBgClass: 'bg-sky-400',
    borderClass: 'border-sky-400/40',
  },
  TERTUNDA: {
    label: 'Tertangguh',
    shortLabel: 'Tertangguh',
    colorHex: '#f59e0b',
    threeColor: 0xf59e0b,
    textClass: 'text-amber-300',
    dotBgClass: 'bg-amber-400',
    borderClass: 'border-amber-400/40',
  },
  BERANGKAT: {
    label: 'Berlepas',
    shortLabel: 'Berlepas',
    colorHex: '#22d3ee',
    threeColor: 0x22d3ee,
    textClass: 'text-cyan-300',
    dotBgClass: 'bg-cyan-400',
    borderClass: 'border-cyan-400/40',
  },
  MENGUDARA: {
    label: 'Di Udara',
    shortLabel: 'Di Udara',
    colorHex: '#38bdf8',
    threeColor: 0x38bdf8,
    textClass: 'text-sky-300',
    dotBgClass: 'bg-sky-400',
    borderClass: 'border-sky-400/40',
  },
  MENDEKAT: {
    label: 'Menghampiri',
    shortLabel: 'Menghampiri',
    colorHex: '#a78bfa',
    threeColor: 0xa78bfa,
    textClass: 'text-violet-300',
    dotBgClass: 'bg-violet-400',
    borderClass: 'border-violet-400/40',
  },
  MENDARAT: {
    label: 'Telah Mendarat',
    shortLabel: 'Mendarat',
    colorHex: '#34d399',
    threeColor: 0x34d399,
    textClass: 'text-emerald-300',
    dotBgClass: 'bg-emerald-400',
    borderClass: 'border-emerald-400/40',
  },
  DIALIHKAN: {
    label: 'Dilencongkan',
    shortLabel: 'Dilencongkan',
    colorHex: '#f43f5e',
    threeColor: 0xf43f5e,
    textClass: 'text-rose-300',
    dotBgClass: 'bg-rose-500',
    borderClass: 'border-rose-500/40',
  },
};
