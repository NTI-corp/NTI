"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export type NtiStackKey =
  | "engine"
  | "archive"
  | "oracle"
  | "guard"
  | "market"
  | "twap";

let sharedRenderer: THREE.WebGLRenderer | null = null;

function getSharedRenderer(): THREE.WebGLRenderer | null {
  if (typeof window === "undefined") return null;
  if (!sharedRenderer) {
    try {
      sharedRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      sharedRenderer.setClearColor(0x000000, 0);
      sharedRenderer.toneMapping = THREE.NoToneMapping;
      sharedRenderer.toneMappingExposure = 1.0;
    } catch {
      return null;
    }
  }
  return sharedRenderer;
}

function disposeSceneResources(scene: THREE.Scene) {
  scene.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.LineSegments ||
      obj instanceof THREE.Line
    ) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
  });
}

function addStudioLights(scene: THREE.Scene) {
  // High ambient + hemisphere fill eliminates black shadow faces completely
  scene.add(new THREE.AmbientLight(0xdce6f2, 1.35));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x627082, 1.25));

  const key = new THREE.DirectionalLight(0xffffff, 1.65);
  key.position.set(5, 8, 6);
  scene.add(key);

  const rimVolt = new THREE.DirectionalLight(0xccff00, 1.15);
  rimVolt.position.set(-5, 4, 5);
  scene.add(rimVolt);

  const backRim = new THREE.PointLight(0xccff00, 3.8, 18, 1.2);
  backRim.position.set(-3.2, 2.8, 3.4);
  scene.add(backRim);

  const coolFill = new THREE.PointLight(0xdce8f8, 2.5, 18, 1.2);
  coolFill.position.set(4.5, 0.5, 4.0);
  scene.add(coolFill);
}

function buildGridFloor(size: number, divisions: number, color = 0x4d5666) {
  const helper = new THREE.GridHelper(size, divisions, 0x6c7584, color);
  const mats = Array.isArray(helper.material) ? helper.material : [helper.material];
  mats.forEach((m) => {
    m.transparent = true;
    m.opacity = 0.65;
  });
  return helper;
}

function addEdgeOutline(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: number,
  opacity: number
) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  parent.add(edges);
  return edges;
}

function unitFrac(v: number) {
  const r = ((v % 1) + 1) % 1;
  return Math.min(0.999999, Math.max(0, Number.isFinite(r) ? r : 0));
}

function buildStackScene(kind: NtiStackKey) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 50);
  camera.position.set(0, 2.85, 7.6);
  camera.lookAt(0, -0.05, 0);

  addStudioLights(scene);

  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x5c6676,
    emissive: 0x1e242c,
    emissiveIntensity: 0.65,
    metalness: 0.08,
    roughness: 0.42,
  });

  const midMetal = new THREE.MeshStandardMaterial({
    color: 0x8793a6,
    emissive: 0x2c3440,
    emissiveIntensity: 0.55,
    metalness: 0.08,
    roughness: 0.35,
  });

  const smokedGlass = new THREE.MeshStandardMaterial({
    color: 0xc2cddb,
    emissive: 0x3b4452,
    emissiveIntensity: 0.5,
    metalness: 0.05,
    roughness: 0.18,
    transparent: true,
    opacity: 0.24,
  });

  const voltGlow = new THREE.MeshStandardMaterial({
    color: 0xccff00,
    emissive: 0xccff00,
    emissiveIntensity: 0.95,
    metalness: 0.15,
    roughness: 0.2,
  });

  const whiteGlow = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.75,
    metalness: 0.1,
    roughness: 0.15,
  });

  const root = new THREE.Group();
  scene.add(root);

  let update: (t: number) => void = () => {};

  if (kind === "engine") {
    // 01: 6x4 Isometric Mindshare Equalizer Matrix + 3 Glowing EMA Spline Trails + Tracing Beads
    const grid = buildGridFloor(5.6, 12);
    grid.position.y = -1.05;
    root.add(grid);

    const cols = 6;
    const rows = 4;
    const pillars: { mesh: THREE.Mesh; cap: THREE.Mesh; col: number; row: number }[] = [];
    const pillarGeo = new THREE.BoxGeometry(0.24, 1, 0.24);
    const capGeo = new THREE.BoxGeometry(0.25, 0.035, 0.25);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * 0.56;
        const z = (r - (rows - 1) / 2) * 0.56;
        const isLeader = (c >= 4 && r <= 2) || (c === 3 && r === 1);

        const mesh = new THREE.Mesh(pillarGeo, isLeader ? midMetal : darkMetal);
        mesh.position.set(x, -0.55, z);
        addEdgeOutline(mesh, pillarGeo, isLeader ? 0xccff00 : 0x3b424d, isLeader ? 0.5 : 0.35);
        root.add(mesh);

        const cap = new THREE.Mesh(capGeo, isLeader ? voltGlow : whiteGlow);
        cap.position.set(x, 0, z);
        root.add(cap);

        pillars.push({ mesh, cap, col: c, row: r });
      }
    }

    // 3 Sweeping 3D EMA Light Splines + Moving Pulse Beads
    const curves: THREE.CatmullRomCurve3[] = [];
    const beads: THREE.Mesh[] = [];
    for (let s = 0; s < 3; s++) {
      const zOff = (s - 1) * 0.65;
      const pts = [
        new THREE.Vector3(-2.6, -0.6 + s * 0.15, zOff),
        new THREE.Vector3(-1.2, 0.25 - s * 0.12, zOff + 0.25),
        new THREE.Vector3(0.2, -0.1 + s * 0.2, zOff - 0.2),
        new THREE.Vector3(1.5, 0.85 - s * 0.15, zOff + 0.15),
        new THREE.Vector3(2.6, 0.45 + s * 0.1, zOff),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      curves.push(curve);

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 44, s === 1 ? 0.022 : 0.013, 8, false),
        s === 1 ? voltGlow : midMetal
      );
      root.add(tube);

      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(s === 1 ? 0.07 : 0.05, 14, 14),
        s === 1 ? whiteGlow : voltGlow
      );
      root.add(bead);
      beads.push(bead);
    }

    root.rotation.y = -0.58;

    update = (t) => {
      root.rotation.y = -0.58 + Math.sin(t * 0.35) * 0.12;
      for (const p of pillars) {
        const wave =
          0.55 +
          0.55 * Math.sin(t * 1.45 + p.col * 0.62 - p.row * 0.5) +
          0.25 * Math.cos(t * 0.9 + p.row * 1.1);
        const h = Math.max(0.22, wave);
        p.mesh.scale.y = h;
        p.mesh.position.y = -1.04 + h * 0.5;
        p.cap.position.y = -1.04 + h + 0.02;
      }
      for (let i = 0; i < curves.length; i++) {
        const pt = curves[i]?.getPointAt(unitFrac(t * (0.28 + i * 0.08)));
        if (pt) beads[i]?.position.copy(pt);
      }
    };
  } else if (kind === "archive") {
    // 02: Stepped Frosted Glass Archive Substrates + 3x3x3 Breathing Merkle Voxel Cube inside Wireframe Cage
    const grid = buildGridFloor(5.6, 12);
    grid.position.y = -1.18;
    root.add(grid);

    for (let i = 0; i < 3; i++) {
      const s = 2.8 - i * 0.36;
      const plateGeo = new THREE.BoxGeometry(s, 0.08, s);
      const plate = new THREE.Mesh(plateGeo, i === 2 ? darkMetal : smokedGlass);
      plate.position.y = -1.05 + i * 0.24;
      addEdgeOutline(plate, plateGeo, i === 2 ? 0xccff00 : 0x4b515b, i === 2 ? 0.7 : 0.45);
      root.add(plate);
    }

    // Outer isometric containment cage + corner brackets
    const cageGroup = new THREE.Group();
    cageGroup.position.y = 0.65;
    const cageGeo = new THREE.BoxGeometry(1.72, 1.72, 1.72);
    addEdgeOutline(cageGroup, cageGeo, 0x6c7584, 0.5);
    root.add(cageGroup);

    // 27 Mini Data Voxels (3x3x3) breathing around center
    const voxelCluster = new THREE.Group();
    voxelCluster.position.y = 0.65;
    root.add(voxelCluster);

    const voxelGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const voxels: { mesh: THREE.Mesh; bx: number; by: number; bz: number; hot: boolean }[] = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const isCenter = x === 0 && y === 0 && z === 0;
          const isAccent = isCenter || (Math.abs(x + y + z) === 2 && (x + z) >= 0);
          const mesh = new THREE.Mesh(
            voxelGeo,
            isCenter ? voltGlow : isAccent ? midMetal : smokedGlass
          );
          addEdgeOutline(
            mesh,
            voxelGeo,
            isAccent ? 0xccff00 : 0x4b515b,
            isAccent ? 0.85 : 0.35
          );
          voxelCluster.add(mesh);
          voxels.push({ mesh, bx: x, by: y, bz: z, hot: isCenter });
        }
      }
    }

    // Vertical light stream rails entering cube from bottom plate
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8),
        i % 2 === 0 ? voltGlow : midMetal
      );
      rail.position.set(Math.cos(ang) * 0.9, -0.1, Math.sin(ang) * 0.9);
      root.add(rail);
    }

    update = (t) => {
      root.rotation.y = 0.52 + Math.sin(t * 0.3) * 0.14;
      const breath = 0.38 + (0.5 + 0.5 * Math.sin(t * 1.4)) * 0.14;
      voxelCluster.rotation.y = t * 0.45;
      cageGroup.rotation.y = -t * 0.2;
      for (const v of voxels) {
        v.mesh.position.set(v.bx * breath, v.by * breath, v.bz * breath);
      }
    };
  } else if (kind === "oracle") {
    // 03: Seal-inspired Nested Glass Cube + Laser Scan Plane + Calibrated Azimuth Dial + 3 Validator Tethers
    const grid = buildGridFloor(5.6, 12);
    grid.position.y = -1.15;
    root.add(grid);

    // Flat azimuth ring on floor
    const dialRing = new THREE.Mesh(
      new THREE.RingGeometry(1.75, 1.82, 64),
      new THREE.MeshBasicMaterial({
        color: 0x4b515b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    dialRing.rotation.x = Math.PI / 2;
    dialRing.position.y = -1.13;
    root.add(dialRing);

    const vaultGroup = new THREE.Group();
    vaultGroup.position.y = 0.15;
    root.add(vaultGroup);

    // Outer frosted glass box + inner wireframe cage
    const outerGeo = new THREE.BoxGeometry(1.58, 1.58, 1.58);
    const outerGlass = new THREE.Mesh(outerGeo, smokedGlass);
    vaultGroup.add(outerGlass);
    addEdgeOutline(vaultGroup, outerGeo, 0x89919f, 0.65);

    const innerGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
    addEdgeOutline(vaultGroup, innerGeo, 0xccff00, 0.45);

    const coreCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      voltGlow
    );
    vaultGroup.add(coreCrystal);

    // Horizontal laser scan sheet & frame
    const scanGroup = new THREE.Group();
    const scanSheet = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, 0.02, 1.66),
      new THREE.MeshBasicMaterial({
        color: 0xccff00,
        transparent: true,
        opacity: 0.42,
      })
    );
    const scanBorder = addEdgeOutline(
      scanGroup,
      new THREE.BoxGeometry(1.74, 0.04, 1.74),
      0xccff00,
      0.95
    );
    void scanBorder;
    scanGroup.add(scanSheet);
    vaultGroup.add(scanGroup);

    // 3 Validator Relay Satellites + Tether Beams
    const relays: THREE.Group[] = [];
    const beams: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const signed = i < 2;
      const relay = new THREE.Group();
      const rGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      const rMesh = new THREE.Mesh(rGeo, signed ? darkMetal : smokedGlass);
      addEdgeOutline(relay, rGeo, signed ? 0xccff00 : 0x6c7584, 0.9);
      const rDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        signed ? voltGlow : whiteGlow
      );
      relay.add(rMesh, rDot);
      root.add(relay);
      relays.push(relay);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 1, 6),
        signed ? voltGlow : midMetal
      );
      root.add(beam);
      beams.push(beam);
    }

    const originVec = new THREE.Vector3(0, 0.15, 0);
    const upVec = new THREE.Vector3(0, 1, 0);

    update = (t) => {
      vaultGroup.rotation.y = t * 0.32;
      coreCrystal.rotation.y = -t * 0.9;
      coreCrystal.rotation.x = Math.sin(t * 0.8) * 0.2;
      scanGroup.position.y = Math.sin(t * 1.65) * 0.72;

      for (let i = 0; i < 3; i++) {
        const ang = t * 0.48 + (i * Math.PI * 2) / 3;
        const pos = new THREE.Vector3(
          Math.cos(ang) * 2.15,
          0.15 + Math.sin(t * 1.4 + i * 2.1) * 0.45,
          Math.sin(ang) * 2.15
        );
        relays[i]!.position.copy(pos);
        relays[i]!.rotation.y = -ang;

        const dir = pos.clone().sub(originVec);
        const len = dir.length();
        const beam = beams[i]!;
        beam.position.copy(originVec).addScaledVector(dir, 0.5);
        beam.scale.set(1, len, 1);
        beam.quaternion.setFromUnitVectors(upVec, dir.normalize());
      }
    };
  } else if (kind === "guard") {
    // 04: Precision Clockwork Degree Dial + Triple Gimbal Rings + Armored Wireframe Enclave
    const grid = buildGridFloor(5.6, 12);
    grid.position.y = -1.2;
    root.add(grid);

    // 32 Calibrated 3D Tick Bars on Floor Perimeter
    const tickGeo = new THREE.BoxGeometry(0.04, 0.05, 0.2);
    const ticks: THREE.Mesh[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const tick = new THREE.Mesh(
        tickGeo,
        new THREE.MeshBasicMaterial({ color: 0x3b424d })
      );
      tick.position.set(Math.cos(a) * 2.1, -1.16, Math.sin(a) * 2.1);
      tick.rotation.y = -a + Math.PI / 2;
      root.add(tick);
      ticks.push(tick);
    }

    const coreGroup = new THREE.Group();
    coreGroup.position.y = 0.22;
    root.add(coreGroup);

    const coreGeo = new THREE.IcosahedronGeometry(0.68, 0);
    const coreMesh = new THREE.Mesh(coreGeo, darkMetal);
    coreGroup.add(coreMesh);
    addEdgeOutline(coreGroup, coreGeo, 0xccff00, 0.8);

    const innerSphere = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      voltGlow
    );
    coreGroup.add(innerSphere);

    // 3 Slender Precision Gimbal Rings
    const gimbals: THREE.Group[] = [];
    const radii = [1.18, 1.48, 1.78];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.y = 0.22;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radii[i]!, 0.018, 12, 72),
        i === 1 ? voltGlow : midMetal
      );
      const sub = new THREE.Mesh(
        new THREE.TorusGeometry(radii[i]! + 0.04, 0.006, 8, 72),
        i === 2 ? whiteGlow : midMetal
      );
      g.add(ring, sub);
      root.add(g);
      gimbals.push(g);
    }

    update = (t) => {
      coreGroup.rotation.y = t * 0.45;
      innerSphere.rotation.y = -t * 1.1;
      gimbals[0]!.rotation.set(0.6 + t * 0.4, t * 0.65, 0.2);
      gimbals[1]!.rotation.set(-0.5, -t * 0.55, t * 0.35);
      gimbals[2]!.rotation.set(0.25, t * 0.3, -t * 0.4);

      const sweepIdx = Math.floor((t * 10) % 32);
      for (let i = 0; i < 32; i++) {
        const mat = ticks[i]!.material as THREE.MeshBasicMaterial;
        const dist = (sweepIdx - i + 32) % 32;
        if (dist === 0) mat.color.setHex(0xffffff);
        else if (dist < 6) mat.color.setHex(0xccff00);
        else mat.color.setHex(0x343940);
      }
    };
  } else if (kind === "market") {
    // 05: Fluid Twin Orbital Liquidity Turbines + Braided Figure-8 Spread Streams & Orbiting Orbs
    const grid = buildGridFloor(6.0, 14);
    grid.position.y = -1.25;
    root.add(grid);

    const buildLiquidityNode = (x: number, tiltZ: number, accentMat: THREE.Material, hex: number) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0.08, 0);
      grp.rotation.z = tiltZ;

      // Frosted glass bevel disc
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.84, 0.84, 0.09, 48),
        smokedGlass
      );
      addEdgeOutline(disc, disc.geometry, hex, 0.65);

      // Precision outer & inner counter-rotating gimbal rings
      const outerRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.06, 0.022, 12, 64),
        accentMat
      );
      outerRing.rotation.x = Math.PI / 2;

      const midRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.92, 0.012, 10, 56),
        midMetal
      );
      midRing.rotation.x = Math.PI / 2 + 0.35;

      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        accentMat
      );

      grp.add(disc, outerRing, midRing, core);
      root.add(grp);
      return { grp, outerRing, midRing, core };
    };

    const nodeA = buildLiquidityNode(-1.55, 0.28, voltGlow, 0xccff00);
    const nodeB = buildLiquidityNode(1.55, -0.28, whiteGlow, 0xffffff);

    // Central Spread Equilibrium Gyro Ring
    const spreadRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.018, 12, 56),
      voltGlow
    );
    spreadRing.position.y = 0.08;
    root.add(spreadRing);

    // 3 Intertwined Braided Liquidity Flow Tubes (Figure-8 / Infinity Loop) + 6 Flowing Orbs
    const flowCurves: THREE.CatmullRomCurve3[] = [];
    const flowOrbs: { mesh: THREE.Mesh; curveIdx: number; offset: number; speed: number }[] = [];

    for (let c = 0; c < 3; c++) {
      const phase = (c / 3) * Math.PI * 2;
      const ampZ = 0.72;
      const ampY = 0.52;
      const curve = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-1.55, 0.08, 0),
          new THREE.Vector3(-0.75, 0.08 + Math.sin(phase) * ampY, Math.cos(phase) * ampZ),
          new THREE.Vector3(0, 0.08, 0),
          new THREE.Vector3(0.75, 0.08 - Math.sin(phase) * ampY, -Math.cos(phase) * ampZ),
          new THREE.Vector3(1.55, 0.08, 0),
          new THREE.Vector3(0.75, 0.08 + Math.sin(phase + 1.2) * ampY, Math.cos(phase + 1.2) * ampZ),
          new THREE.Vector3(0, 0.08, 0),
          new THREE.Vector3(-0.75, 0.08 - Math.sin(phase + 1.2) * ampY, -Math.cos(phase + 1.2) * ampZ),
        ],
        true
      );
      flowCurves.push(curve);

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 84, c === 0 ? 0.02 : 0.012, 8, true),
        c === 0 ? voltGlow : midMetal
      );
      root.add(tube);

      for (let k = 0; k < 2; k++) {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(k === 0 ? 0.068 : 0.052, 14, 14),
          k === 0 ? whiteGlow : voltGlow
        );
        root.add(orb);
        flowOrbs.push({
          mesh: orb,
          curveIdx: c,
          offset: (c * 0.33 + k * 0.5) % 1,
          speed: 0.16 + c * 0.03,
        });
      }
    }

    update = (t) => {
      root.rotation.y = Math.sin(t * 0.42) * 0.28;
      root.rotation.x = Math.cos(t * 0.35) * 0.06;

      nodeA.grp.position.y = 0.08 + Math.sin(t * 1.15) * 0.14;
      nodeB.grp.position.y = 0.08 - Math.sin(t * 1.15) * 0.14;
      nodeA.outerRing.rotation.z = t * 0.7;
      nodeA.midRing.rotation.set(Math.PI / 2 + 0.35, t * 0.9, t * 0.4);
      nodeA.core.rotation.y = t * 1.1;

      nodeB.outerRing.rotation.z = -t * 0.7;
      nodeB.midRing.rotation.set(Math.PI / 2 - 0.35, -t * 0.9, -t * 0.4);
      nodeB.core.rotation.y = -t * 1.1;

      spreadRing.rotation.set(0.4 + t * 0.55, t * 0.45, Math.sin(t * 1.15) * 0.3);

      for (const o of flowOrbs) {
        const u = unitFrac(t * o.speed + o.offset);
        const pt = flowCurves[o.curveIdx]?.getPointAt(u);
        if (pt) o.mesh.position.copy(pt);
      }
    };
  } else if (kind === "twap") {
    // 06: 5 Frosted Glass TWAP Vault Cards + Diagonal Execution Rail + Cumulative Spline
    const grid = buildGridFloor(5.8, 12);
    grid.position.y = -1.18;
    root.add(grid);

    const cards: THREE.Group[] = [];
    const strips: THREE.Mesh[] = [];
    const cardGeo = new THREE.BoxGeometry(1.35, 0.92, 0.055);
    const stripGeo = new THREE.BoxGeometry(1.36, 0.045, 0.065);

    for (let i = 0; i < 5; i++) {
      const grp = new THREE.Group();
      const mesh = new THREE.Mesh(cardGeo, i >= 3 ? darkMetal : smokedGlass);
      addEdgeOutline(grp, cardGeo, i >= 2 ? 0xccff00 : 0x556070, i === 4 ? 0.9 : 0.45);

      const strip = new THREE.Mesh(stripGeo, i === 4 ? whiteGlow : voltGlow);
      strip.position.y = 0.45;

      // Internal micro grid bar on card face
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.06, 0.062),
        midMetal
      );
      bar.position.set(-0.18, -0.1, 0);

      grp.add(mesh, strip, bar);
      grp.position.set((i - 2) * 0.62, (i - 2) * 0.18, (i - 2) * 0.22);
      grp.rotation.y = -0.45;
      root.add(grp);
      cards.push(grp);
      strips.push(strip);
    }

    // Diagonal TWAP Cumulative Light Rail
    const railCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.1, -0.75, -0.8),
      new THREE.Vector3(-0.7, -0.22, -0.2),
      new THREE.Vector3(0.7, 0.28, 0.3),
      new THREE.Vector3(2.1, 0.85, 0.85),
    ]);
    const railTube = new THREE.Mesh(
      new THREE.TubeGeometry(railCurve, 44, 0.018, 8, false),
      voltGlow
    );
    root.add(railTube);

    const sliceOrb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), whiteGlow);
    root.add(sliceOrb);

    update = (t) => {
      root.rotation.y = Math.sin(t * 0.35) * 0.14;
      for (let i = 0; i < cards.length; i++) {
        const wave = Math.sin(t * 1.8 - i * 0.7) * 0.1;
        cards[i]!.position.y = (i - 2) * 0.18 + wave;
        strips[i]!.visible = Math.sin(t * 2.2 - i * 0.85) > -0.35;
      }
      const pt = railCurve.getPointAt(unitFrac(t * 0.32));
      if (pt) sliceOrb.position.copy(pt);
    };
  }

  return { scene, camera, update };
}

export function NtiStackVisual({ kind }: { kind: NtiStackKey }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    const renderer = getSharedRenderer();
    if (!ctx2d || !renderer) return;

    const { scene, camera, update } = buildStackScene(kind);

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let rafId: number | null = null;
    const start = performance.now();

    const draw = (now: number) => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const rect = canvas.getBoundingClientRect();
      // Skip rendering only when unmeasured or scrolled far offscreen, keeping RAF alive
      if (
        cssW <= 2 ||
        cssH <= 2 ||
        rect.bottom < -300 ||
        rect.top > window.innerHeight + 300
      ) {
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(cssW * dpr);
      const h = Math.floor(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const elapsed = reducedMotion ? 1.8 : Math.max(0, (now - start) * 0.001);
      update(elapsed);

      camera.aspect = cssW / cssH;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);

      ctx2d.clearRect(0, 0, w, h);
      ctx2d.drawImage(renderer.domElement, 0, 0, w, h);
    };

    const tick = (now: number) => {
      draw(now);
      if (!reducedMotion) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onResize = () => draw(performance.now());
    window.addEventListener("resize", onResize);

    draw(performance.now());
    if (!reducedMotion) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      disposeSceneResources(scene);
    };
  }, [kind]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="w-full h-full block"
      style={{
        maskImage:
          "radial-gradient(ellipse 80% 82% at 50% 50%, black 50%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 82% at 50% 50%, black 50%, transparent 100%)",
      }}
    />
  );
}
