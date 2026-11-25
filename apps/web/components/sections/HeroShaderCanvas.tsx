"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SILK_VERTEX_SRC = /* glsl */ `
uniform float u_time;
uniform vec2 u_mouseWorld;
uniform float u_mouseActive;

out vec3 v_worldPos;
out vec3 v_normal;
out float v_height;
out float v_hover;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float evalHeight(vec2 xz, float t, vec2 mouseW, float mouseActive, out float hoverAmt) {
  vec2 p = xz * 0.115;
  float warp = snoise(p * 0.72 + vec2(t * 0.16, -t * 0.12));
  float n1 = snoise(p + vec2(t * 0.22, t * 0.10) + warp * 0.62);
  float n2 = snoise(p * 1.95 - vec2(t * 0.18, -t * 0.14));

  float h = n1 * 1.55 + n2 * 0.42;

  float cursorDist = length(xz - mouseW);
  hoverAmt = exp(-cursorDist * 0.24) * mouseActive;
  h += hoverAmt * 0.85;
  return h;
}

void main() {
  float t = u_time;
  vec3 pos = position;

  float hover = 0.0;
  float hC = evalHeight(pos.xz, t, u_mouseWorld, u_mouseActive, hover);

  float dummy = 0.0;
  float eps = 0.09;
  float hX = evalHeight(pos.xz + vec2(eps, 0.0), t, u_mouseWorld, u_mouseActive, dummy);
  float hZ = evalHeight(pos.xz + vec2(0.0, eps), t, u_mouseWorld, u_mouseActive, dummy);

  pos.y += hC - 0.9;

  vec3 normal = normalize(vec3(hC - hX, eps, hC - hZ));
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);

  v_worldPos = worldPosition.xyz;
  v_normal = normalize(mat3(modelMatrix) * normal);
  v_height = hC;
  v_hover = hover;

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const SILK_FRAGMENT_SRC = /* glsl */ `
precision highp float;

uniform float u_time;
uniform vec2 u_mouseWorld;

in vec3 v_worldPos;
in vec3 v_normal;
in float v_height;
in float v_hover;

out vec4 fragColor;

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(cameraPosition - v_worldPos);

  // Dual studio rim & key lights carving silky 3D obsidian folds
  vec3 L1 = normalize(vec3(0.45, 0.68, 0.58));
  vec3 L2 = normalize(vec3(-0.78, 0.34, -0.52));
  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);

  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);
  float spec1 = pow(max(dot(N, H1), 0.0), 42.0);
  float spec2 = pow(max(dot(N, H2), 0.0), 28.0);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.1);

  // Palette: deep obsidian glass base + #CCFF00 Fresnel rim + crisp white specular highlights
  vec3 obsidian = vec3(0.015, 0.018, 0.022);
  vec3 slateShadow = vec3(0.11, 0.13, 0.16);
  vec3 volt = vec3(0.80, 1.00, 0.00);       // #CCFF00
  vec3 whiteSpec = vec3(0.96, 1.00, 0.90);

  vec3 col = obsidian;
  col += slateShadow * diff1 * 0.55;
  col += volt * diff2 * 0.22;
  col += volt * fresnel * (0.46 + 0.35 * clamp((v_height + 1.0) * 0.5, 0.0, 1.0));
  col += mix(volt, whiteSpec, 0.72) * spec1 * 0.78;
  col += volt * spec2 * 0.45;

  // Anti-aliased topographic index contour isolines tracing wave elevation cleanly
  float isoCoord = v_height * 2.4;
  float isoDist = abs(fract(isoCoord) - 0.5);
  float isoFW = max(fwidth(isoCoord), 0.001);
  float isoLine = 1.0 - smoothstep(0.0, isoFW * 1.45, isoDist);
  float crestMask = smoothstep(-0.35, 1.25, v_height);
  col += mix(slateShadow * 1.4, volt, crestMask) * isoLine * (0.14 + 0.34 * crestMask);

  // Interactive cursor glow accent on the silk ridges
  col += volt * v_hover * (0.18 + 0.45 * fresnel);

  // Smooth horizon & edge vignette into pure #000000 void
  float distCam = length(cameraPosition - v_worldPos);
  float horizonFade = 1.0 - smoothstep(11.0, 25.0, distCam);
  float nearFade = smoothstep(2.5, 5.8, distCam);
  float sideFade = 1.0 - smoothstep(13.0, 19.0, abs(v_worldPos.x));
  col *= horizonFade * nearFade * sideFade;

  fragColor = vec4(col, 1.0);
}
`;

export function HeroShaderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallbackMode, setFallbackMode] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setFallbackMode(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 60);
    const baseCamPos = new THREE.Vector3(0, 2.35, 9.6);
    const lookTarget = new THREE.Vector3(0, 1.45, 0.0);
    camera.position.copy(baseCamPos);
    camera.lookAt(lookTarget);

    // High-contrast studio 4-point lighting so the 3D mascot pops clearly off the dark stage
    const hemiLight = new THREE.HemisphereLight(0xf0f6ff, 0x1a2214, 1.35);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3.5, 6.5, 7.5);
    scene.add(keyLight);

    const frontFill = new THREE.DirectionalLight(0xd8e4ff, 1.45);
    frontFill.position.set(-2.5, 2.5, 8.0);
    scene.add(frontFill);

    const voltRimLight = new THREE.PointLight(0xccff00, 24, 18, 1.4);
    voltRimLight.position.set(-2.6, 3.4, 3.2);
    scene.add(voltRimLight);

    const voltRimRight = new THREE.PointLight(0xccff00, 18, 16, 1.5);
    voltRimRight.position.set(2.8, 2.2, 2.8);
    scene.add(voltRimRight);

    // Sculpted high-subdivision 3D silk plane (solid obsidian surface with #CCFF00 Fresnel & contour lines)
    const planeGeom = new THREE.PlaneGeometry(38, 24, 180, 120);
    planeGeom.rotateX(-Math.PI / 2);
    planeGeom.translate(0, -0.35, -2.2);

    const uniforms = {
      u_time: { value: 0 },
      u_mouseWorld: { value: new THREE.Vector2(0, 0) },
      u_mouseActive: { value: 0 },
    };

    const silkMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SILK_VERTEX_SRC,
      fragmentShader: SILK_FRAGMENT_SRC,
      uniforms,
    });

    const silkMesh = new THREE.Mesh(planeGeom, silkMat);
    scene.add(silkMesh);

    // =========================================================================
    // 3D Autonomous AI Sentinel Mascot ("NTI-01")
    // =========================================================================
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(res: T): T => {
      disposables.push(res);
      return res;
    };

    const armorMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xdce3ec,
        metalness: 0.28,
        roughness: 0.26,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      })
    );
    const trimMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x3b4252,
        metalness: 0.48,
        roughness: 0.3,
      })
    );
    const visorMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x070a0f,
        metalness: 0.15,
        roughness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      })
    );
    const voltGlowMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xccff00,
        emissive: 0xccff00,
        emissiveIntensity: 2.6,
        roughness: 0.12,
        metalness: 0.1,
      })
    );
    const ringMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xccff00,
        emissive: 0xccff00,
        emissiveIntensity: 1.45,
        metalness: 0.4,
        roughness: 0.2,
        transparent: true,
        opacity: 0.88,
      })
    );

    const mascotRoot = new THREE.Group();
    mascotRoot.position.set(0, 2.25, 4.15);
    scene.add(mascotRoot);

    // Head rig (tracks mouse cursor in 3D)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.42, 0);
    mascotRoot.add(headGroup);

    // Sculpted cyber-helmet shell
    const helmetGeom = track(new THREE.SphereGeometry(0.72, 40, 32));
    const helmetMesh = new THREE.Mesh(helmetGeom, armorMat);
    helmetMesh.scale.set(1.12, 0.92, 0.96);
    headGroup.add(helmetMesh);

    // Outer visor bezel frame
    const bezelGeom = track(new THREE.TorusGeometry(0.54, 0.045, 16, 48));
    const bezelMesh = new THREE.Mesh(bezelGeom, trimMat);
    bezelMesh.position.set(0, -0.02, 0.46);
    bezelMesh.scale.set(1.14, 0.68, 1);
    headGroup.add(bezelMesh);

    // Glossy obsidian face visor
    const visorGeom = track(new THREE.SphereGeometry(0.62, 36, 24));
    const visorMesh = new THREE.Mesh(visorGeom, visorMat);
    visorMesh.scale.set(1.06, 0.68, 0.65);
    visorMesh.position.set(0, -0.02, 0.24);
    headGroup.add(visorMesh);

    // Expressive glowing #CCFF00 AI eyes (blink + subtle micro-saccade)
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0, 0.0, 0.66);
    headGroup.add(eyeGroup);

    const eyeGeom = track(new THREE.CapsuleGeometry(0.068, 0.11, 10, 18));
    const leftEye = new THREE.Mesh(eyeGeom, voltGlowMat);
    leftEye.position.set(-0.22, 0, 0);
    const rightEye = new THREE.Mesh(eyeGeom, voltGlowMat);
    rightEye.position.set(0.22, 0, 0);
    eyeGroup.add(leftEye, rightEye);

    // Twin side ear-pods + signal antennas
    const podGeom = track(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 24));
    const leftPod = new THREE.Mesh(podGeom, trimMat);
    leftPod.rotation.z = Math.PI / 2;
    leftPod.position.set(-0.82, 0.02, 0);
    const rightPod = new THREE.Mesh(podGeom, trimMat);
    rightPod.rotation.z = Math.PI / 2;
    rightPod.position.set(0.82, 0.02, 0);
    headGroup.add(leftPod, rightPod);

    const stemGeom = track(new THREE.CylinderGeometry(0.022, 0.032, 0.42, 12));
    const tipGeom = track(new THREE.OctahedronGeometry(0.075, 0));

    const leftAnt = new THREE.Group();
    leftAnt.position.set(-0.56, 0.56, -0.05);
    leftAnt.rotation.z = 0.34;
    const leftStem = new THREE.Mesh(stemGeom, trimMat);
    leftStem.position.y = 0.2;
    const leftTip = new THREE.Mesh(tipGeom, voltGlowMat);
    leftTip.position.y = 0.44;
    leftAnt.add(leftStem, leftTip);

    const rightAnt = new THREE.Group();
    rightAnt.position.set(0.56, 0.56, -0.05);
    rightAnt.rotation.z = -0.34;
    const rightStem = new THREE.Mesh(stemGeom, trimMat);
    rightStem.position.y = 0.2;
    const rightTip = new THREE.Mesh(tipGeom, voltGlowMat);
    rightTip.position.y = 0.44;
    rightAnt.add(rightStem, rightTip);
    headGroup.add(leftAnt, rightAnt);

    // Floating compact armored torso + glowing NTI core
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, -0.58, 0);
    mascotRoot.add(bodyGroup);

    const torsoGeom = track(new THREE.CylinderGeometry(0.42, 0.26, 0.66, 28));
    const torsoMesh = new THREE.Mesh(torsoGeom, armorMat);
    bodyGroup.add(torsoMesh);

    const chestRingGeom = track(new THREE.TorusGeometry(0.15, 0.026, 12, 32));
    const chestRing = new THREE.Mesh(chestRingGeom, voltGlowMat);
    chestRing.position.set(0, 0.04, 0.36);
    bodyGroup.add(chestRing);

    const chestCoreGeom = track(new THREE.OctahedronGeometry(0.08, 0));
    const chestCore = new THREE.Mesh(chestCoreGeom, voltGlowMat);
    chestCore.position.set(0, 0.04, 0.36);
    bodyGroup.add(chestCore);

    // Floating robotic hands / stabilizer pods
    const handGeom = track(new THREE.CapsuleGeometry(0.11, 0.2, 10, 16));
    const leftHand = new THREE.Mesh(handGeom, armorMat);
    leftHand.position.set(-0.78, -0.05, 0.14);
    leftHand.rotation.z = 0.35;
    const rightHand = new THREE.Mesh(handGeom, armorMat);
    rightHand.position.set(0.78, -0.05, 0.14);
    rightHand.rotation.z = -0.35;
    bodyGroup.add(leftHand, rightHand);

    // Twin tilted orbital telemetry rings + orbiting narrative signal nodes
    const orbitGroupA = new THREE.Group();
    orbitGroupA.rotation.set(Math.PI * 0.38, 0.2, 0.24);
    const orbitRingA = new THREE.Mesh(
      track(new THREE.TorusGeometry(1.42, 0.012, 10, 96)),
      ringMat
    );
    orbitGroupA.add(orbitRingA);

    const nodeGeom = track(new THREE.OctahedronGeometry(0.055, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const node = new THREE.Mesh(nodeGeom, voltGlowMat);
      node.position.set(Math.cos(a) * 1.42, Math.sin(a) * 1.42, 0);
      orbitGroupA.add(node);
    }
    mascotRoot.add(orbitGroupA);

    const orbitGroupB = new THREE.Group();
    orbitGroupB.rotation.set(-Math.PI * 0.34, -0.32, -0.45);
    const orbitRingB = new THREE.Mesh(
      track(new THREE.TorusGeometry(1.72, 0.008, 8, 96)),
      ringMat
    );
    orbitGroupB.add(orbitRingB);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6;
      const node = new THREE.Mesh(nodeGeom, voltGlowMat);
      node.position.set(Math.cos(a) * 1.72, Math.sin(a) * 1.72, 0);
      orbitGroupB.add(node);
    }
    mascotRoot.add(orbitGroupB);

    const mascotGlowLight = new THREE.PointLight(0xccff00, 6.5, 6.5, 1.8);
    mascotGlowLight.position.set(0, 0.2, 1.1);
    mascotRoot.add(mascotGlowLight);

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const pointer = {
      ndcX: 0,
      ndcY: 0,
      smoothX: 0,
      smoothY: 0,
      activeTarget: 0,
      active: 0,
    };

    const pulseState = {
      spinVel: 0,
      spinAngle: 0,
      hop: 0,
    };

    const raycaster = new THREE.Raycaster();
    const ndcVec = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.7);
    const hitPoint = new THREE.Vector3();

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(nextDpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Responsive mascot scale & elevation on narrow screens
      const isNarrow = width < 640;
      mascotRoot.scale.setScalar(isNarrow ? 0.88 : 1.18);
      mascotRoot.position.y = isNarrow ? 2.4 : 2.25;
    };

    resize();

    let isVisible = true;
    let rafId: number | null = null;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = reducedMotion ? 2.8 : (now - startTime) * 0.001;
      pointer.smoothX += (pointer.ndcX - pointer.smoothX) * 0.07;
      pointer.smoothY += (pointer.ndcY - pointer.smoothY) * 0.07;
      pointer.active += (pointer.activeTarget - pointer.active) * 0.06;

      // Subtle camera sway responding to pointer
      camera.position.x = baseCamPos.x + pointer.smoothX * 0.85;
      camera.position.y = baseCamPos.y + pointer.smoothY * 0.4;
      camera.lookAt(lookTarget);

      // Animate 3D AI Sentinel mascot (hover, cursor-tracking head/eyes, natural blink, orbits, click hop)
      pulseState.spinAngle += pulseState.spinVel;
      pulseState.spinVel *= 0.91;
      pulseState.hop *= 0.89;

      const baseY = canvas.clientWidth < 640 ? 2.4 : 2.25;
      mascotRoot.position.y =
        baseY + Math.sin(elapsed * 1.9) * 0.14 + pulseState.hop * 0.42;
      mascotRoot.rotation.y =
        Math.sin(elapsed * 0.55) * 0.12 + pulseState.spinAngle;

      // Head tracks cursor smoothly
      const targetHeadY = pointer.smoothX * 0.52;
      const targetHeadX = -pointer.smoothY * 0.28;
      headGroup.rotation.y += (targetHeadY - headGroup.rotation.y) * 0.1;
      headGroup.rotation.x += (targetHeadX - headGroup.rotation.x) * 0.1;
      headGroup.rotation.z = -pointer.smoothX * 0.08;

      // Natural periodic blink (~every 4.2s)
      const blinkCycle = elapsed % 4.2;
      const blinkScaleY =
        blinkCycle > 4.02 ? Math.max(0.08, Math.abs(Math.cos(((blinkCycle - 4.02) / 0.18) * Math.PI))) : 1;
      leftEye.scale.y = blinkScaleY;
      rightEye.scale.y = blinkScaleY;
      eyeGroup.position.x = pointer.smoothX * 0.045;
      eyeGroup.position.y = pointer.smoothY * 0.03;

      // Floating hands & chest core pulse
      leftHand.position.y = -0.05 + Math.sin(elapsed * 2.4 + 0.6) * 0.09;
      rightHand.position.y = -0.05 + Math.sin(elapsed * 2.4 + 2.2) * 0.09;
      chestCore.rotation.y = elapsed * 1.8;
      chestCore.rotation.x = elapsed * 1.1;
      voltGlowMat.emissiveIntensity =
        2.0 + Math.sin(elapsed * 3.2) * 0.35 + pulseState.hop * 2.5;

      // Orbital narrative rings
      orbitGroupA.rotation.z = elapsed * 0.48;
      orbitGroupB.rotation.z = -elapsed * 0.34;

      if (pointer.active > 0.01) {
        ndcVec.set(pointer.smoothX, pointer.smoothY);
        raycaster.setFromCamera(ndcVec, camera);
        if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
          uniforms.u_mouseWorld.value.set(hitPoint.x, hitPoint.z);
        }
      }

      uniforms.u_time.value = elapsed;
      uniforms.u_mouseActive.value = pointer.active;

      renderer.render(scene, camera);
    };

    const tick = (now: number) => {
      if (!isVisible) {
        rafId = null;
        return;
      }
      renderFrame(now);
      if (!reducedMotion) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.activeTarget = 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("a, button")) return;
      if (window.scrollY > window.innerHeight * 0.6) return;
      pulseState.spinVel = 0.24;
      pulseState.hop = 1.0;
    };

    const onPointerLeave = () => {
      pointer.activeTarget = 0;
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setFallbackMode(true);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isVisible = entry.isIntersecting;
        if (isVisible && rafId === null && !reducedMotion) {
          rafId = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(canvas);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("webglcontextlost", onContextLost);

    renderFrame(performance.now());
    if (!reducedMotion) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      planeGeom.dispose();
      silkMat.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
    };
  }, []);

  if (fallbackMode) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1] pointer-events-none bg-black"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 75% 45% at 50% 75%, rgba(204,255,0,0.14), transparent 72%)",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full z-[1] pointer-events-none block opacity-100"
    />
  );
}
