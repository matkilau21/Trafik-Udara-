import * as THREE from 'three';

export const GLOBE_RADIUS = 10;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/**
 * Converts geographic latitude/longitude (degrees) to a 3D Cartesian position on a sphere.
 * Matches Three.js SphereGeometry UV mapping (equirectangular).
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS,
  target: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;

  const sinPhi = Math.sin(phi);
  target.set(
    -radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta)
  );
  return target;
}

/**
 * Converts a unit or scaled 3D Cartesian point on the globe back to lat/lon (degrees).
 */
export function vector3ToLatLon(vec: THREE.Vector3): { lat: number; lon: number } {
  const r = vec.length();
  if (r === 0) return { lat: 0, lon: 0 };
  const lat = Math.asin(THREE.MathUtils.clamp(vec.y / r, -1, 1)) * RAD2DEG;
  const lon = Math.atan2(vec.z, -vec.x) * RAD2DEG - 180;
  // Normalize lon to [-180, 180]
  const normLon = ((lon + 540) % 360) - 180;
  return { lat, lon: normLon };
}

/**
 * Haversine great-circle distance in kilometers.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c);
}

/**
 * Computes initial bearing/heading in degrees (0-359) from point 1 to point 2.
 */
export function calculateBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;

  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * RAD2DEG;
  return Math.round((brng + 360) % 360);
}

// Reusable scratch vectors for GC-free interpolation
const _startUnit = new THREE.Vector3();
const _endUnit = new THREE.Vector3();
const _interpVec = new THREE.Vector3();

/**
 * Computes an elevated 3D point along the great-circle flight arc between two airports.
 * t in [0, 1]. Uses smooth spherical linear interpolation + realistic parabolic cruise arc.
 */
export function getFlightArcPoint(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  t: number,
  distanceKm: number,
  target: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
  latLonToVector3(originLat, originLon, 1, _startUnit);
  latLonToVector3(destLat, destLon, 1, _endUnit);

  const dot = THREE.MathUtils.clamp(_startUnit.dot(_endUnit), -1, 1);
  const omega = Math.acos(dot);

  if (omega < 0.0001) {
    _interpVec.copy(_startUnit);
  } else {
    const sinOmega = Math.sin(omega);
    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;
    _interpVec.set(
      _startUnit.x * s0 + _endUnit.x * s1,
      _startUnit.y * s0 + _endUnit.y * s1,
      _startUnit.z * s0 + _endUnit.z * s1
    );
    _interpVec.normalize();
  }

  // Smooth elevation profile: lifts rapidly after takeoff, plateaus in cruise, descends smoothly
  const arcPeak = THREE.MathUtils.clamp(0.28 + (distanceKm / 15000) * 1.45, 0.3, 1.75);
  const elevationFactor = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1));
  const altitudeOffset = Math.pow(elevationFactor, 0.72) * arcPeak;

  const radius = GLOBE_RADIUS + 0.04 + altitudeOffset;
  target.copy(_interpVec).multiplyScalar(radius);
  return target;
}

/**
 * Computes realistic live flight altitude (feet) from progress [0, 1] and cruise altitude.
 */
export function computeLiveAltitudeFt(progress: number, cruiseAltitudeFt: number): number {
  if (progress <= 0.005 || progress >= 0.995) return 0;
  if (progress < 0.12) {
    // Climb phase
    const ratio = Math.sin((progress / 0.12) * (Math.PI / 2));
    return Math.round((cruiseAltitudeFt * ratio) / 100) * 100;
  }
  if (progress > 0.86) {
    // Descent phase
    const ratio = Math.sin(((1 - progress) / 0.14) * (Math.PI / 2));
    return Math.round((cruiseAltitudeFt * ratio) / 100) * 100;
  }
  return cruiseAltitudeFt;
}

/**
 * Computes realistic live ground speed (knots) from progress [0, 1] and cruise speed.
 */
export function computeLiveSpeedKts(progress: number, cruiseSpeedKts: number): number {
  if (progress <= 0.005 || progress >= 0.995) return 0;
  if (progress < 0.08) {
    return Math.round(165 + (cruiseSpeedKts - 165) * (progress / 0.08));
  }
  if (progress > 0.88) {
    return Math.round(145 + (cruiseSpeedKts - 145) * ((1 - progress) / 0.12));
  }
  return cruiseSpeedKts;
}

/**
 * Formats a timestamp (ms) into HH:MM Malaysian 24-hour format.
 */
export function formatTimeHM(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatTimeHMS(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
