import * as THREE from 'three';
import { CITY_LIGHT_CLUSTERS, WORLD_POLYGONS } from '../data/worldGeo';

export interface ProceduralEarthTextures {
  albedoMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
}

function lonToX(lon: number, width: number): number {
  return ((lon + 180) / 360) * width;
}

function latToY(lat: number, height: number): number {
  return ((90 - lat) / 180) * height;
}

/**
 * Generates high-resolution, 100% procedural PBR textures for the 3D Earth globe:
 * - Albedo map: Deep marine ocean gradient + subtle bathymetric contours + dark-slate tactical continents + fine graticule
 * - Roughness map: Glossy water (low roughness) vs matte terrain (higher roughness)
 * - Emissive map: Warm amber metropolitan night-lights + glowing coastal outlines
 * - Cloud map: Soft translucent procedural atmospheric cloud bands
 */
export function createProceduralEarthTextures(
  maxAnisotropy: number
): ProceduralEarthTextures {
  const width = 2048;
  const height = 1024;

  // 1. Albedo Canvas
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const ctx = albedoCanvas.getContext('2d')!;

  // Deep ocean gradient (polar abyssal blue -> equatorial deep navy)
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0.0, '#071122');
  oceanGrad.addColorStop(0.18, '#08182e');
  oceanGrad.addColorStop(0.5, '#0b203b');
  oceanGrad.addColorStop(0.82, '#08182e');
  oceanGrad.addColorStop(1.0, '#071122');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle bathymetric grid (latitude & longitude lines every 15 deg)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = lonToX(lon, width);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = latToY(lat, height);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Equator accent hairline
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // 2. Roughness Canvas (white = rough matte land, dark = smooth reflective ocean)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#383838'; // Ocean roughness (~0.22)
  rCtx.fillRect(0, 0, width, height);

  // 3. Emissive Canvas (night city glow + faint tectonic shoreline accent)
  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = width;
  emissiveCanvas.height = height;
  const eCtx = emissiveCanvas.getContext('2d')!;
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, width, height);

  // Draw continents on all three maps
  const drawPolygon = (targetCtx: CanvasRenderingContext2D, poly: Array<[number, number]>) => {
    if (poly.length < 3) return;
    targetCtx.beginPath();
    poly.forEach(([lon, lat], idx) => {
      const x = lonToX(lon, width);
      const y = latToY(lat, height);
      if (idx === 0) targetCtx.moveTo(x, y);
      else targetCtx.lineTo(x, y);
    });
    targetCtx.closePath();
  };

  WORLD_POLYGONS.forEach((poly) => {
    // Albedo landmass: elevated slate-blue tectonic tone with crisp cyan-slate coastline
    drawPolygon(ctx, poly);
    const landGrad = ctx.createLinearGradient(0, 0, 0, height);
    landGrad.addColorStop(0.0, '#22354a');
    landGrad.addColorStop(0.3, '#1a2c40');
    landGrad.addColorStop(0.5, '#1e3346');
    landGrad.addColorStop(0.75, '#1a2c40');
    landGrad.addColorStop(1.0, '#22354a');
    ctx.fillStyle = landGrad;
    ctx.fill();

    // Soft coastal rim
    ctx.strokeStyle = 'rgba(94, 185, 232, 0.42)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Roughness landmass (matte ~0.82)
    drawPolygon(rCtx, poly);
    rCtx.fillStyle = '#d4d4d4';
    rCtx.fill();

    // Emissive subtle coastline contour
    drawPolygon(eCtx, poly);
    eCtx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    eCtx.lineWidth = 1.5;
    eCtx.stroke();
  });

  // Add subtle topographic stipple across land for micro-texture richness
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#bae6fd';
  for (let i = 0; i < 2400; i++) {
    // Deterministic pseudo-random distribution
    const sx = ((i * 7919) % 1000) / 1000;
    const sy = ((i * 104729) % 1000) / 1000;
    const px = sx * width;
    const py = sy * height;
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.restore();

  // Paint warm golden metropolitan city lights onto both albedo & emissive canvases
  CITY_LIGHT_CLUSTERS.forEach(([lon, lat, intensity]) => {
    const cx = lonToX(lon, width);
    const cy = latToY(lat, height);
    const radius = 8 + intensity * 14;

    const glow = eCtx.createRadialGradient(cx, cy, 0.5, cx, cy, radius);
    glow.addColorStop(0, `rgba(255, 224, 150, ${0.85 * intensity})`);
    glow.addColorStop(0.35, `rgba(251, 191, 36, ${0.42 * intensity})`);
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    eCtx.fillStyle = glow;
    eCtx.beginPath();
    eCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    eCtx.fill();

    // Crisp bright center pin
    ctx.fillStyle = `rgba(254, 240, 199, ${0.55 * intensity})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4. Procedural Soft Cloud Layer Canvas
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 1024;
  cloudCanvas.height = 512;
  const cCtx = cloudCanvas.getContext('2d')!;
  cCtx.clearRect(0, 0, 1024, 512);

  // Subtle deterministic atmospheric swirl puffs
  for (let i = 0; i < 160; i++) {
    const rx = ((i * 3571 + 193) % 1024);
    const ry = 40 + ((i * 6151 + 41) % 432);
    const radX = 32 + ((i * 89) % 90);
    const radY = 10 + ((i * 47) % 28);
    const alpha = 0.03 + (((i * 23) % 10) / 10) * 0.05;

    cCtx.save();
    cCtx.translate(rx, ry);
    cCtx.scale(radX / radY, 1);
    const grad = cCtx.createRadialGradient(0, 0, 1, 0, 0, radY);
    grad.addColorStop(0, `rgba(226, 240, 255, ${alpha})`);
    grad.addColorStop(1, 'rgba(226, 240, 255, 0)');
    cCtx.fillStyle = grad;
    cCtx.beginPath();
    cCtx.arc(0, 0, radY, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.restore();
  }

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.anisotropy = maxAnisotropy;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.ClampToEdgeWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = maxAnisotropy;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.ClampToEdgeWrapping;

  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.wrapS = THREE.RepeatWrapping;
  cloudMap.wrapT = THREE.ClampToEdgeWrapping;

  return { albedoMap, roughnessMap, emissiveMap, cloudMap };
}
