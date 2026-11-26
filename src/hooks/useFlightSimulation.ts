import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { AIRPORT_MAP } from '../data/airports';
import { createInitialFlights } from '../data/initialFlights';
import {
  Flight,
  FlightStatus,
  KliaTrafficPoint,
  NotificationScope,
  ScheduleCategory,
  ScheduleNotification,
} from '../types/flight';
import { playAviationChime } from '../utils/audioChime';
import {
  calculateBearingDeg,
  computeLiveAltitudeFt,
  computeLiveSpeedKts,
  formatTimeHM,
  getFlightArcPoint,
  vector3ToLatLon,
} from '../utils/geoMath';

const DELAY_REASONS = [
  'Kesesakan trafik udara di koridor berlepas KLIA',
  'Penyelarasan giliran pesawat operasi',
  'Keadaan cuaca dinamik di sekitar landasan',
  'Pemeriksaan teknikal pra-penerbangan berkala',
  'Penyelarasan slot pelepasan menara kawalan',
];

const KLIA_GATES = ['C14', 'C22', 'G08', 'H04', 'B06', 'J12', 'P14', 'Q07'];

const _scratchVec = new THREE.Vector3();

function buildStatusNotification(
  flight: Flight,
  previousStatus: FlightStatus,
  newStatus: FlightStatus,
  delayDeltaMinutes?: number,
  customNote?: string
): ScheduleNotification {
  const orig = AIRPORT_MAP[flight.origin];
  const dest = AIRPORT_MAP[flight.destination];
  const now = Date.now();

  let category: ScheduleCategory = 'JADWAL';
  let title = '';
  let message = '';
  let severity: ScheduleNotification['severity'] = 'info';

  switch (newStatus) {
    case 'BOARDING':
      category = 'KEBERANGKATAN';
      title = `Panggilan Menaiki Pesawat · ${flight.flightNumber}`;
      message = `Penumpang ke ${dest.city} (${dest.code}) dipersilakan ke Pintu ${flight.departureGate} (${flight.departureTerminal}). ETD ${formatTimeHM(flight.estimatedDepartureMs)}.`;
      severity = 'info';
      break;
    case 'BERANGKAT':
      category = 'KEBERANGKATAN';
      title = `Telah Berlepas · ${flight.flightNumber}`;
      message = `Pesawat ${flight.airline} telah berlepas dari ${orig.city} (${orig.code}) menuju ke ${dest.city} (${dest.code}). ETA ${formatTimeHM(flight.estimatedArrivalMs)}.`;
      severity = 'info';
      break;
    case 'MENGUDARA':
      category = 'KEBERANGKATAN';
      title = `Ketinggian Jelajah · ${flight.flightNumber}`;
      message = `Mencapai ketinggian jelajah ${flight.cruiseAltitudeFt.toLocaleString('ms-MY')} kaki menuju ke ${dest.city} (${dest.code}).`;
      severity = 'info';
      break;
    case 'TERTUNDA': {
      category = 'KEBERANGKATAN';
      const delta = delayDeltaMinutes ?? Math.max(15, flight.delayMinutes);
      title = `Jadual Tertangguh +${delta} min · ${flight.flightNumber}`;
      message = `${customNote ?? flight.statusNote ?? DELAY_REASONS[0]}. Jangkaan berlepas baharu: ${formatTimeHM(flight.estimatedDepartureMs)} · ETA ${formatTimeHM(flight.estimatedArrivalMs)}.`;
      severity = 'warning';
      break;
    }
    case 'MENDEKAT':
      category = 'KEDATANGAN';
      title = `Menghampiri Pendaratan · ${flight.flightNumber}`;
      message = `Memasuki koridor pendaratan di ${dest.name} (${dest.code}). Jangkaan tiba ${formatTimeHM(flight.estimatedArrivalMs)} di ${flight.arrivalTerminal}, Pintu ${flight.arrivalGate}.`;
      severity = 'info';
      break;
    case 'MENDARAT':
      category = 'KEDATANGAN';
      title = `Telah Mendarat · ${flight.flightNumber}`;
      message = `Mendarat dengan selamat di ${dest.city} (${dest.code}) pada jam ${formatTimeHM(now)}. Menuju ke Pintu ${flight.arrivalGate} (${flight.arrivalTerminal}).`;
      severity = 'success';
      break;
    case 'DIALIHKAN':
      category = 'KEDATANGAN';
      title = `Lencongan Laluan · ${flight.flightNumber}`;
      message = `Penerbangan ${flight.origin} → ${flight.destination} mengalami pelarasan laluan pendaratan berikutan keadaan cuaca.`;
      severity = 'alert';
      break;
    default:
      category = 'JADWAL';
      title = `Kemas Kini Jadual · ${flight.flightNumber}`;
      message = `Jadual baharu dikemas kini bagi laluan ${orig.code} → ${dest.code} · ETD ${formatTimeHM(flight.estimatedDepartureMs)}.`;
      severity = 'info';
      break;
  }

  return {
    id: `notif-${now}-${Math.random().toString(36).slice(2, 7)}`,
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    airline: flight.airline,
    origin: flight.origin,
    destination: flight.destination,
    category,
    previousStatus,
    newStatus,
    title,
    message,
    timestampMs: now,
    delayDeltaMinutes,
    read: false,
    severity,
  };
}

function buildInitialKliaTrafficHistory(initialFlights: Flight[]): KliaTrafficPoint[] {
  const now = Date.now();
  const depNow = initialFlights.filter((f) => f.origin === 'KUL').length;
  const arrNow = initialFlights.filter((f) => f.destination === 'KUL').length;
  const delNow = initialFlights.filter(
    (f) => f.status === 'TERTUNDA' || f.status === 'DIALIHKAN'
  ).length;

  // 6 intervals covering the past 60 minutes (every 10 minutes up to 'Kini')
  const historicalOffsets = [
    { minsAgo: 50, depDelta: -3, arrDelta: -2, del: 1 },
    { minsAgo: 40, depDelta: -1, arrDelta: -3, del: 2 },
    { minsAgo: 30, depDelta: 1, arrDelta: -1, del: 1 },
    { minsAgo: 20, depDelta: -2, arrDelta: 1, del: 2 },
    { minsAgo: 10, depDelta: 0, arrDelta: -1, del: Math.max(1, delNow) },
  ];

  const points: KliaTrafficPoint[] = historicalOffsets.map((slot) => ({
    timeLabel: formatTimeHM(now - slot.minsAgo * 60 * 1000),
    berlepas: Math.max(3, depNow + slot.depDelta),
    ketibaan: Math.max(4, arrNow + slot.arrDelta),
    tertangguh: slot.del,
  }));

  points.push({
    timeLabel: 'Kini',
    berlepas: depNow,
    ketibaan: arrNow,
    tertangguh: delNow,
  });

  return points;
}

export function useFlightSimulation() {
  const [flights, setFlights] = useState<Flight[]>(() => createInitialFlights());
  const [trafficHistory, setTrafficHistory] = useState<KliaTrafficPoint[]>(() =>
    buildInitialKliaTrafficHistory(createInitialFlights())
  );
  const [notifications, setNotifications] = useState<ScheduleNotification[]>([]);
  const [activeToasts, setActiveToasts] = useState<ScheduleNotification[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(
    () => new Set(['fl-mh002', 'fl-sq108', 'fl-ak5110', 'fl-mh2516'])
  );

  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 5 | 15>(5);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState(false);
  const [notificationScope, setNotificationScope] = useState<NotificationScope>('SEMUA');

  const watchedRef = useRef(watchedIds);
  watchedRef.current = watchedIds;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const desktopRef = useRef(desktopAlertsEnabled);
  desktopRef.current = desktopAlertsEnabled;
  const scopeRef = useRef(notificationScope);
  scopeRef.current = notificationScope;
  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  const scheduleEventCooldownRef = useRef(11);
  const trafficRollCooldownRef = useRef(20);

  const dispatchNotifications = useCallback((items: ScheduleNotification[]) => {
    if (items.length === 0) return;

    const filtered = items.filter((n) => {
      const scope = scopeRef.current;
      if (scope === 'SEMUA') return true;
      if (scope === 'DIPANTAU') return watchedRef.current.has(n.flightId);
      if (scope === 'GANGGUAN_DAN_TIBA') {
        return (
          n.newStatus === 'TERTUNDA' ||
          n.newStatus === 'DIALIHKAN' ||
          n.newStatus === 'MENDARAT' ||
          n.newStatus === 'MENDEKAT'
        );
      }
      return true;
    });

    setNotifications((prev) => [...items, ...prev].slice(0, 60));

    if (filtered.length > 0) {
      setActiveToasts((prev) => [...filtered, ...prev].slice(0, 4));

      if (soundRef.current) {
        playAviationChime(filtered[0].severity);
      }

      if (
        desktopRef.current &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const top = filtered[0];
        try {
          new Notification(top.title, { body: top.message });
        } catch {
          // Ignore sandboxed notification restrictions
        }
      }

      filtered.forEach((item) => {
        window.setTimeout(() => {
          setActiveToasts((curr) => curr.filter((t) => t.id !== item.id));
        }, 7500);
      });
    }
  }, []);

  useEffect(() => {
    const TICK_MS = 250;
    const interval = window.setInterval(() => {
      if (!playingRef.current) return;

      const dtSec = (TICK_MS / 1000) * speedRef.current;
      const realDtSec = TICK_MS / 1000;
      const emitted: ScheduleNotification[] = [];

      scheduleEventCooldownRef.current -= realDtSec;
      const shouldInjectScheduleEvent = scheduleEventCooldownRef.current <= 0;
      if (shouldInjectScheduleEvent) {
        scheduleEventCooldownRef.current = 16 + Math.random() * 10;
      }

      let injectedOnce = false;

      setFlights((prevFlights) =>
        prevFlights.map((flight) => {
          const orig = AIRPORT_MAP[flight.origin];
          const dest = AIRPORT_MAP[flight.destination];
          let next: Flight = { ...flight };

          if (
            next.status === 'TERJADWAL' ||
            next.status === 'BOARDING' ||
            next.status === 'TERTUNDA' ||
            next.status === 'MENDARAT'
          ) {
            next.groundPhaseTimerSec -=
              realDtSec * (speedRef.current === 15 ? 2.2 : speedRef.current === 5 ? 1.35 : 1);

            if (next.groundPhaseTimerSec <= 0) {
              const prevStatus = next.status;

              if (prevStatus === 'TERJADWAL') {
                next.status = 'BOARDING';
                next.previousStatus = prevStatus;
                next.groundPhaseTimerSec = 14 + Math.random() * 8;
                emitted.push(buildStatusNotification(next, prevStatus, 'BOARDING'));
              } else if (prevStatus === 'BOARDING') {
                if (Math.random() < 0.22 && next.delayMinutes === 0) {
                  const delayDelta = [15, 20, 25, 30][Math.floor(Math.random() * 4)];
                  const reason = DELAY_REASONS[Math.floor(Math.random() * DELAY_REASONS.length)];
                  next.status = 'TERTUNDA';
                  next.previousStatus = prevStatus;
                  next.delayMinutes += delayDelta;
                  next.estimatedDepartureMs += delayDelta * 60 * 1000;
                  next.estimatedArrivalMs += delayDelta * 60 * 1000;
                  next.statusNote = reason;
                  next.groundPhaseTimerSec = 15 + Math.random() * 8;
                  emitted.push(
                    buildStatusNotification(next, prevStatus, 'TERTUNDA', delayDelta, reason)
                  );
                } else {
                  next.status = 'BERANGKAT';
                  next.previousStatus = prevStatus;
                  next.progress = 0.015;
                  next.estimatedDepartureMs = Date.now();
                  next.estimatedArrivalMs =
                    next.estimatedDepartureMs + next.durationMinutes * 60 * 1000;
                  emitted.push(buildStatusNotification(next, prevStatus, 'BERANGKAT'));
                }
              } else if (prevStatus === 'TERTUNDA') {
                next.status = 'BOARDING';
                next.previousStatus = prevStatus;
                next.statusNote = undefined;
                next.groundPhaseTimerSec = 11 + Math.random() * 6;
                emitted.push(buildStatusNotification(next, prevStatus, 'BOARDING'));
              } else if (prevStatus === 'MENDARAT') {
                const newOrig = next.destination;
                const newDest = next.origin;
                const now = Date.now();
                const durMs = next.durationMinutes * 60 * 1000;
                next.origin = newOrig;
                next.destination = newDest;
                next.progress = 0;
                next.altitudeFt = 0;
                next.speedKts = 0;
                next.delayMinutes = 0;
                next.statusNote = undefined;
                next.status = 'TERJADWAL';
                next.previousStatus = prevStatus;
                next.scheduledDepartureMs = now + 22 * 60 * 1000;
                next.estimatedDepartureMs = next.scheduledDepartureMs;
                next.scheduledArrivalMs = next.scheduledDepartureMs + durMs;
                next.estimatedArrivalMs = next.scheduledArrivalMs;
                next.departureGate = KLIA_GATES[Math.floor(Math.random() * KLIA_GATES.length)];
                next.groundPhaseTimerSec = 18 + Math.random() * 12;
              }
            }
          } else {
            const baseVisualRatePerSec = 0.00055 * (4500 / Math.max(1200, next.distanceKm));
            next.progress = Math.min(1, next.progress + baseVisualRatePerSec * dtSec);

            const prevStatus = next.status;

            if (prevStatus === 'BERANGKAT' && next.progress >= 0.1) {
              next.status = 'MENGUDARA';
              next.previousStatus = prevStatus;
              emitted.push(buildStatusNotification(next, prevStatus, 'MENGUDARA'));
            } else if (prevStatus === 'MENGUDARA' && next.progress >= 0.87) {
              next.status = 'MENDEKAT';
              next.previousStatus = prevStatus;
              emitted.push(buildStatusNotification(next, prevStatus, 'MENDEKAT'));
            } else if (next.progress >= 0.998) {
              next.progress = 1.0;
              next.status = 'MENDARAT';
              next.previousStatus = prevStatus;
              next.altitudeFt = 0;
              next.speedKts = 0;
              next.estimatedArrivalMs = Date.now();
              next.groundPhaseTimerSec = 24 + Math.random() * 14;
              emitted.push(buildStatusNotification(next, prevStatus, 'MENDARAT'));
            } else if (
              shouldInjectScheduleEvent &&
              !injectedOnce &&
              prevStatus === 'MENGUDARA' &&
              next.progress > 0.25 &&
              next.progress < 0.72 &&
              Math.random() < 0.16
            ) {
              injectedOnce = true;
              const isEarly = Math.random() > 0.45;
              const deltaMin = isEarly ? -10 : 15;
              next.delayMinutes += deltaMin;
              next.estimatedArrivalMs += deltaMin * 60 * 1000;
              const newGate = KLIA_GATES[Math.floor(Math.random() * KLIA_GATES.length)];
              next.arrivalGate = newGate;
              const destInfo = AIRPORT_MAP[next.destination];

              emitted.push({
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                flightId: next.id,
                flightNumber: next.flightNumber,
                airline: next.airline,
                origin: next.origin,
                destination: next.destination,
                category: 'KEDATANGAN',
                previousStatus: next.status,
                newStatus: next.status,
                title: isEarly
                  ? `Tiba Lebih Awal ${Math.abs(deltaMin)} min · ${next.flightNumber}`
                  : `Perubahan ETA +${deltaMin} min · ${next.flightNumber}`,
                message: isEarly
                  ? `Angin ekor mempercepatkan ketibaan ke ${destInfo.city} (${destInfo.code}). ETA baharu ${formatTimeHM(next.estimatedArrivalMs)}, Pintu ${newGate}.`
                  : `Pelarasan kelajuan jelajah menuju ke ${destInfo.city} (${destInfo.code}). ETA dikemas kini kepada ${formatTimeHM(next.estimatedArrivalMs)}, Pintu ${newGate}.`,
                timestampMs: Date.now(),
                delayDeltaMinutes: deltaMin,
                read: false,
                severity: isEarly ? 'success' : 'warning',
              });
            }
          }

          const isAirborne =
            next.status === 'BERANGKAT' ||
            next.status === 'MENGUDARA' ||
            next.status === 'MENDEKAT';

          getFlightArcPoint(
            orig.lat,
            orig.lon,
            dest.lat,
            dest.lon,
            next.progress,
            next.distanceKm,
            _scratchVec
          );
          const { lat, lon } = vector3ToLatLon(_scratchVec);
          next.lat = lat;
          next.lon = lon;
          next.headingDeg = calculateBearingDeg(lat, lon, dest.lat, dest.lon);
          next.altitudeFt = isAirborne
            ? computeLiveAltitudeFt(next.progress, next.cruiseAltitudeFt)
            : 0;
          next.speedKts = isAirborne
            ? computeLiveSpeedKts(next.progress, next.cruiseSpeedKts)
            : 0;

          return next;
        })
      );

      if (emitted.length > 0) {
        dispatchNotifications(emitted);

        // Update current KLIA traffic bucket whenever departures, arrivals, or delays occur
        const depEvents = emitted.filter(
          (e) => e.origin === 'KUL' && (e.newStatus === 'BERANGKAT' || e.newStatus === 'BOARDING')
        ).length;
        const arrEvents = emitted.filter(
          (e) => e.destination === 'KUL' && (e.newStatus === 'MENDARAT' || e.newStatus === 'MENDEKAT')
        ).length;
        const delayEvents = emitted.filter((e) => e.newStatus === 'TERTUNDA').length;

        if (depEvents > 0 || arrEvents > 0 || delayEvents > 0) {
          setTrafficHistory((prev) => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            const last = { ...copy[copy.length - 1] };
            last.berlepas += depEvents;
            last.ketibaan += arrEvents;
            if (delayEvents > 0) last.tertangguh += delayEvents;
            copy[copy.length - 1] = last;
            return copy;
          });
        }
      }

      // Periodically roll the 60-minute window forward so live chart shifts smoothly
      trafficRollCooldownRef.current -= realDtSec;
      if (trafficRollCooldownRef.current <= 0) {
        trafficRollCooldownRef.current = 24;
        setFlights((currentFlights) => {
          const depActive = currentFlights.filter((f) => f.origin === 'KUL').length;
          const arrActive = currentFlights.filter((f) => f.destination === 'KUL').length;
          const delActive = currentFlights.filter(
            (f) => f.status === 'TERTUNDA' || f.status === 'DIALIHKAN'
          ).length;

          setTrafficHistory((prev) => {
            if (prev.length < 2) return prev;
            const stampedPrev = prev.slice(1).map((pt, idx, arr) =>
              idx === arr.length - 1
                ? { ...pt, timeLabel: formatTimeHM(Date.now()) }
                : pt
            );
            return [
              ...stampedPrev,
              {
                timeLabel: 'Kini',
                berlepas: depActive,
                ketibaan: arrActive,
                tertangguh: delActive,
              },
            ];
          });
          return currentFlights;
        });
      }
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [dispatchNotifications]);

  const triggerFlightStatusUpdate = useCallback(
    (flightId: string) => {
      let generated: ScheduleNotification | null = null;

      setFlights((prev) =>
        prev.map((flight) => {
          if (flight.id !== flightId) return flight;
          const next = { ...flight };
          const prevStatus = next.status;

          if (prevStatus === 'TERJADWAL') {
            next.status = 'BOARDING';
            next.groundPhaseTimerSec = 14;
            generated = buildStatusNotification(next, prevStatus, 'BOARDING');
          } else if (prevStatus === 'BOARDING') {
            next.status = 'BERANGKAT';
            next.progress = 0.03;
            next.estimatedDepartureMs = Date.now();
            generated = buildStatusNotification(next, prevStatus, 'BERANGKAT');
          } else if (prevStatus === 'TERTUNDA') {
            next.status = 'BOARDING';
            next.statusNote = undefined;
            next.groundPhaseTimerSec = 12;
            generated = buildStatusNotification(next, prevStatus, 'BOARDING');
          } else if (prevStatus === 'BERANGKAT') {
            next.status = 'MENGUDARA';
            next.progress = Math.max(next.progress, 0.2);
            generated = buildStatusNotification(next, prevStatus, 'MENGUDARA');
          } else if (prevStatus === 'MENGUDARA') {
            if (next.progress < 0.65 && next.delayMinutes === 0) {
              const delta = 20;
              next.delayMinutes += delta;
              next.estimatedArrivalMs += delta * 60 * 1000;
              next.status = 'TERTUNDA';
              const reason = DELAY_REASONS[Math.floor(Math.random() * DELAY_REASONS.length)];
              next.statusNote = reason;
              next.groundPhaseTimerSec = 12;
              generated = buildStatusNotification(next, prevStatus, 'TERTUNDA', delta, reason);
            } else {
              next.status = 'MENDEKAT';
              next.progress = 0.9;
              generated = buildStatusNotification(next, prevStatus, 'MENDEKAT');
            }
          } else if (prevStatus === 'MENDEKAT') {
            next.status = 'MENDARAT';
            next.progress = 1.0;
            next.altitudeFt = 0;
            next.speedKts = 0;
            next.estimatedArrivalMs = Date.now();
            next.groundPhaseTimerSec = 25;
            generated = buildStatusNotification(next, prevStatus, 'MENDARAT');
          } else {
            const orig = next.destination;
            const dest = next.origin;
            next.origin = orig;
            next.destination = dest;
            next.progress = 0;
            next.status = 'BOARDING';
            next.delayMinutes = 0;
            next.groundPhaseTimerSec = 14;
            generated = buildStatusNotification(next, prevStatus, 'BOARDING');
          }

          next.previousStatus = prevStatus;
          return next;
        })
      );

      if (generated) {
        dispatchNotifications([generated]);
      }
    },
    [dispatchNotifications]
  );

  const toggleWatchFlight = useCallback((flightId: string) => {
    setWatchedIds((prev) => {
      const next = new Set(prev);
      if (next.has(flightId)) next.delete(flightId);
      else next.add(flightId);
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setActiveToasts([]);
  }, []);

  const toggleDesktopAlerts = useCallback(async () => {
    if (desktopAlertsEnabled) {
      setDesktopAlertsEnabled(false);
      return;
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setDesktopAlertsEnabled(true);
      } else if (Notification.permission !== 'denied') {
        const res = await Notification.requestPermission();
        if (res === 'granted') setDesktopAlertsEnabled(true);
      }
    }
  }, [desktopAlertsEnabled]);

  const unreadCount = notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  return {
    flights,
    trafficHistory,
    notifications,
    activeToasts,
    unreadCount,
    watchedIds,
    isPlaying,
    setIsPlaying,
    speedMultiplier,
    setSpeedMultiplier,
    soundEnabled,
    setSoundEnabled,
    desktopAlertsEnabled,
    toggleDesktopAlerts,
    notificationScope,
    setNotificationScope,
    toggleWatchFlight,
    dismissToast,
    markAllNotificationsRead,
    clearNotifications,
    triggerFlightStatusUpdate,
  };
}
