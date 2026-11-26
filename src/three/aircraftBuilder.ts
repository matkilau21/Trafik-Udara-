import * as THREE from 'three';

/**
 * Shared procedural geometries for the composite 9-part commercial jet aircraft model.
 * Built once and reused across all aircraft instances for optimal GPU performance.
 * Local coordinate convention:
 *   +Z = nose forward (so Object3D.lookAt aligns nose along travel tangent!)
 *   +Y = dorsal up (away from Earth center)
 *   +X = starboard (right wing)
 */
export interface SharedAircraftGeometries {
  fuselage: THREE.BufferGeometry;
  cockpit: THREE.BufferGeometry;
  mainWing: THREE.BufferGeometry;
  tailplane: THREE.BufferGeometry;
  verticalFin: THREE.BufferGeometry;
  engineNacelle: THREE.BufferGeometry;
  engineIntake: THREE.BufferGeometry;
  beaconLight: THREE.BufferGeometry;
  hitProxy: THREE.BufferGeometry;
  selectionRing: THREE.BufferGeometry;
  dispose: () => void;
}

export function createSharedAircraftGeometries(): SharedAircraftGeometries {
  // 1. Fuselage: smooth aerodynamic LatheGeometry oriented along +Z
  const lathePoints: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -0.52), // tail cone tip
    new THREE.Vector2(0.032, -0.4),
    new THREE.Vector2(0.068, -0.22),
    new THREE.Vector2(0.078, -0.05),
    new THREE.Vector2(0.08, 0.25),
    new THREE.Vector2(0.072, 0.39),
    new THREE.Vector2(0.048, 0.47),
    new THREE.Vector2(0.018, 0.52),
    new THREE.Vector2(0.0, 0.54), // nose radome tip
  ];
  const fuselage = new THREE.LatheGeometry(lathePoints, 14);
  fuselage.rotateX(Math.PI / 2); // Align lathe Y axis to +Z nose forward

  // 2. Cockpit visor accent
  const cockpit = new THREE.BoxGeometry(0.095, 0.032, 0.085);
  cockpit.translate(0, 0.046, 0.39);

  // 3. Swept main wings (ExtrudeGeometry with subtle bevel)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.16);
  wingShape.lineTo(0.56, -0.11);
  wingShape.lineTo(0.56, -0.17);
  wingShape.lineTo(0.0, -0.07);
  wingShape.lineTo(-0.56, -0.17);
  wingShape.lineTo(-0.56, -0.11);
  wingShape.closePath();

  const mainWing = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  mainWing.rotateX(Math.PI / 2); // Lay flat on XZ plane (+Y up, +Z nose)
  mainWing.translate(0, -0.005, 0.02);

  // 4. Horizontal tail stabilizer
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0.06);
  tailShape.lineTo(0.22, -0.05);
  tailShape.lineTo(0.22, -0.09);
  tailShape.lineTo(0, -0.04);
  tailShape.lineTo(-0.22, -0.09);
  tailShape.lineTo(-0.22, -0.05);
  tailShape.closePath();

  const tailplane = new THREE.ExtrudeGeometry(tailShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
  });
  tailplane.rotateX(Math.PI / 2);
  tailplane.translate(0, 0.015, -0.39);

  // 5. Vertical tail fin (rudder) with airline livery color
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-0.21, 0);
  finShape.lineTo(-0.29, 0.22);
  finShape.lineTo(-0.20, 0.22);
  finShape.lineTo(-0.04, 0.03);
  finShape.closePath();

  const verticalFin = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 1,
  });
  // Extrude is in XY; rotate so X maps to +Z and Y stays +Y
  verticalFin.rotateY(-Math.PI / 2);
  verticalFin.translate(0.007, 0.04, -0.24);

  // 6. Twin turbofan engine nacelles
  const engineNacelle = new THREE.CylinderGeometry(0.034, 0.028, 0.14, 10);
  engineNacelle.rotateX(Math.PI / 2);

  // 7. Dark turbine intake face
  const engineIntake = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10);
  engineIntake.rotateX(Math.PI / 2);

  // 8. Wingtip navigation marker
  const beaconLight = new THREE.SphereGeometry(0.022, 8, 8);

  // 9. Forgiving invisible hit proxy sphere on Layer 1 for crisp 3D selection
  const hitProxy = new THREE.SphereGeometry(0.78, 10, 10);

  // 10. Selection halo ring beneath selected aircraft
  const selectionRing = new THREE.RingGeometry(0.56, 0.70, 32);
  selectionRing.rotateX(-Math.PI / 2);

  return {
    fuselage,
    cockpit,
    mainWing,
    tailplane,
    verticalFin,
    engineNacelle,
    engineIntake,
    beaconLight,
    hitProxy,
    selectionRing,
    dispose: () => {
      fuselage.dispose();
      cockpit.dispose();
      mainWing.dispose();
      tailplane.dispose();
      verticalFin.dispose();
      engineNacelle.dispose();
      engineIntake.dispose();
      beaconLight.dispose();
      hitProxy.dispose();
      selectionRing.dispose();
    },
  };
}

export interface AircraftMeshBundle {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  liveryMaterial: THREE.MeshStandardMaterial;
  fuselageMaterial: THREE.MeshPhysicalMaterial;
  selectionRing: THREE.Mesh;
  disposeMaterials: () => void;
}

/**
 * Builds a composite 9-part procedural 3D commercial jet (`THREE.Group`) with
 * distinct PBR material roughness/metalness contrast between fuselage, wings,
 * engine nacelles, dark cockpit glass, and airline livery tail fin.
 */
export function buildAircraftGroup(
  flightId: string,
  airlineColorHex: string,
  geoms: SharedAircraftGeometries
): AircraftMeshBundle {
  const group = new THREE.Group();
  group.name = `aircraft-${flightId}`;

  // Primary silhouette: polished white-silver metallic fuselage
  const fuselageMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f8fafc'),
    metalness: 0.35,
    roughness: 0.24,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
    emissive: new THREE.Color('#0c4a6e'),
    emissiveIntensity: 0.12,
  });

  // Secondary structural wings: satin brushed alloy (roughness contrast >= 0.25 vs cockpit)
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#cbd5e1'),
    metalness: 0.55,
    roughness: 0.42,
  });

  // Airline livery accent material (tail fin + engine cowling trim)
  const liveryMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(airlineColorHex),
    metalness: 0.25,
    roughness: 0.34,
    emissive: new THREE.Color(airlineColorHex),
    emissiveIntensity: 0.28,
  });

  // Cockpit glass & turbine intake: deep obsidian low roughness
  const darkTrimMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0f172a'),
    metalness: 0.85,
    roughness: 0.12,
  });

  // Wingtip port (red) & starboard (green) navigation beacons
  const portBeaconMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
  const starboardBeaconMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });

  const fuselageMesh = new THREE.Mesh(geoms.fuselage, fuselageMaterial);
  const cockpitMesh = new THREE.Mesh(geoms.cockpit, darkTrimMaterial);
  const wingMesh = new THREE.Mesh(geoms.mainWing, wingMaterial);
  const tailplaneMesh = new THREE.Mesh(geoms.tailplane, wingMaterial);
  const finMesh = new THREE.Mesh(geoms.verticalFin, liveryMaterial);

  // Left & right turbofan engines
  const leftEngine = new THREE.Mesh(geoms.engineNacelle, liveryMaterial);
  leftEngine.position.set(-0.21, -0.042, 0.04);
  const leftIntake = new THREE.Mesh(geoms.engineIntake, darkTrimMaterial);
  leftIntake.position.set(-0.21, -0.042, 0.105);

  const rightEngine = new THREE.Mesh(geoms.engineNacelle, liveryMaterial);
  rightEngine.position.set(0.21, -0.042, 0.04);
  const rightIntake = new THREE.Mesh(geoms.engineIntake, darkTrimMaterial);
  rightIntake.position.set(0.21, -0.042, 0.105);

  const portLight = new THREE.Mesh(geoms.beaconLight, portBeaconMat);
  portLight.position.set(-0.56, -0.005, -0.12);

  const starboardLight = new THREE.Mesh(geoms.beaconLight, starboardBeaconMat);
  starboardLight.position.set(0.56, -0.005, -0.12);

  // Selection halo ring (hidden unless selected/hovered)
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const selectionRing = new THREE.Mesh(geoms.selectionRing, ringMaterial);
  selectionRing.position.set(0, -0.02, 0);
  selectionRing.visible = false;

  // Dedicated Layer-1 invisible raycast proxy
  const hitMaterial = new THREE.MeshBasicMaterial({
    visible: false,
  });
  const hitMesh = new THREE.Mesh(geoms.hitProxy, hitMaterial);
  hitMesh.layers.set(1);
  hitMesh.userData = { kind: 'flight', id: flightId };

  group.add(
    fuselageMesh,
    cockpitMesh,
    wingMesh,
    tailplaneMesh,
    finMesh,
    leftEngine,
    leftIntake,
    rightEngine,
    rightIntake,
    portLight,
    starboardLight,
    selectionRing,
    hitMesh
  );

  // Scale cleanly to globe radius 10 (compact realistic proportion)
  group.scale.setScalar(0.30);

  return {
    group,
    hitMesh,
    liveryMaterial,
    fuselageMaterial,
    selectionRing,
    disposeMaterials: () => {
      fuselageMaterial.dispose();
      wingMaterial.dispose();
      liveryMaterial.dispose();
      darkTrimMaterial.dispose();
      portBeaconMat.dispose();
      starboardBeaconMat.dispose();
      ringMaterial.dispose();
      hitMaterial.dispose();
    },
  };
}
