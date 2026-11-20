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
    const baseCamPos = new THREE.Vector3(0, 2.75, 10.4);
    const lookTarget = new THREE.Vector3(0, 0.72, -3.0);
    camera.position.copy(baseCamPos);
    camera.lookAt(lookTarget);

    // Sculpted high-subdivision 3D silk plane (solid obsidian surface with #CCFF00 Fresnel & contour lines)
    const planeGeom = new THREE.PlaneGeometry(38, 24, 180, 120);
    planeGeom.rotateX(-Math.PI / 2);
    planeGeom.translate(0, 0, -2.2);

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
    };

    resize();

    let isVisible = true;
    let rafId: number | null = null;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = reducedMotion ? 2.8 : (now - startTime) * 0.001;
      pointer.smoothX += (pointer.ndcX - pointer.smoothX) * 0.05;
      pointer.smoothY += (pointer.ndcY - pointer.smoothY) * 0.05;
      pointer.active += (pointer.activeTarget - pointer.active) * 0.05;

      // Subtle camera sway responding to pointer
      camera.position.x = baseCamPos.x + pointer.smoothX * 1.1;
      camera.position.y = baseCamPos.y + pointer.smoothY * 0.55;
      camera.lookAt(lookTarget);

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
      window.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      planeGeom.dispose();
      silkMat.dispose();
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
      className="absolute inset-0 w-full h-full z-[1] pointer-events-none block opacity-[0.65]"
    />
  );
}
