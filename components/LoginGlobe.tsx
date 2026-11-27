"use client";

import { useEffect, useRef } from "react";

interface Point3D {
  x: number;
  y: number;
  z: number;
  isBeacon: boolean;
}

/**
 * Full-bleed 3D wireframe and node globe rendered on canvas behind the login view.
 */
export function LoginGlobe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Generate Fibonacci sphere points for even surface distribution
    const numPoints = 240;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const points: Point3D[] = [];
    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      points.push({
        x: Math.cos(theta) * radiusAtY,
        y,
        z: Math.sin(theta) * radiusAtY,
        isBeacon: i % 19 === 0,
      });
    }

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let rotY = 0.4;
    let targetTiltX = 0.22;
    let tiltX = 0.22;
    let rafId = 0;

    const onPointerMove = (e: PointerEvent) => {
      const ny = e.clientY / Math.max(1, height) - 0.5;
      targetTiltX = 0.22 + ny * 0.16;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const project = (
      px: number,
      py: number,
      pz: number,
      ry: number,
      rx: number,
      cx: number,
      cy: number,
      r: number
    ) => {
      // Rotate around Y
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = px * cosY - pz * sinY;
      const z1 = px * sinY + pz * cosY;

      // Rotate around X
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y2 = py * cosX - z1 * sinX;
      const z2 = py * sinX + z1 * cosX;

      return {
        sx: cx + x1 * r,
        sy: cy + y2 * r,
        z: z2,
      };
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.52;
      const radius = Math.min(width * 0.44, height * 0.58);

      // Subtle atmospheric rim around globe
      const rimGrad = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.72,
        cx,
        cy,
        radius * 1.28
      );
      rimGrad.addColorStop(0, "rgba(37, 99, 235, 0.04)");
      rimGrad.addColorStop(0.6, "rgba(56, 189, 248, 0.09)");
      rimGrad.addColorStop(1, "rgba(7, 25, 71, 0)");
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.28, 0, Math.PI * 2);
      ctx.fill();

      // Outer silhouette circle
      ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Wide orbital rings extending toward viewport edges
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.24);
      ctx.strokeStyle = "rgba(147, 197, 253, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.48, radius * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(0.48);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.10)";
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.32, radius * 0.31, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Longitude meridians
      const meridians = 12;
      for (let m = 0; m < meridians; m++) {
        const lon = (m / meridians) * Math.PI * 2;
        ctx.beginPath();
        let started = false;
        for (let step = 0; step <= 48; step++) {
          const lat = (step / 48) * Math.PI - Math.PI / 2;
          const px = Math.cos(lat) * Math.cos(lon);
          const py = Math.sin(lat);
          const pz = Math.cos(lat) * Math.sin(lon);
          const p = project(px, py, pz, rotY, tiltX, cx, cy, radius);
          if (p.z > -0.15) {
            if (!started) {
              ctx.moveTo(p.sx, p.sy);
              started = true;
            } else {
              ctx.lineTo(p.sx, p.sy);
            }
          } else {
            started = false;
          }
        }
        ctx.strokeStyle = "rgba(147, 197, 253, 0.11)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Latitude parallels
      const parallels = [-0.65, -0.35, 0, 0.35, 0.65];
      for (const latSin of parallels) {
        const lat = Math.asin(latSin);
        const rLat = Math.cos(lat);
        ctx.beginPath();
        let started = false;
        for (let step = 0; step <= 64; step++) {
          const lon = (step / 64) * Math.PI * 2;
          const px = rLat * Math.cos(lon);
          const py = latSin;
          const pz = rLat * Math.sin(lon);
          const p = project(px, py, pz, rotY, tiltX, cx, cy, radius);
          if (p.z > -0.15) {
            if (!started) {
              ctx.moveTo(p.sx, p.sy);
              started = true;
            } else {
              ctx.lineTo(p.sx, p.sy);
            }
          } else {
            started = false;
          }
        }
        ctx.strokeStyle =
          latSin === 0
            ? "rgba(56, 189, 248, 0.2)"
            : "rgba(147, 197, 253, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Surface nodes & beacon arcs
      const frontBeacons: { sx: number; sy: number; z: number }[] = [];
      for (const pt of points) {
        const p = project(pt.x, pt.y, pt.z, rotY, tiltX, cx, cy, radius);
        if (p.z < -0.25) continue;

        const depthAlpha = Math.max(0.08, (p.z + 0.3) * 0.45);
        if (pt.isBeacon && p.z > 0.05) {
          frontBeacons.push(p);
          ctx.fillStyle = `rgba(56, 189, 248, ${Math.min(0.85, depthAlpha + 0.25)})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 2.6, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 6.5, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(147, 197, 253, ${depthAlpha * 0.65})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Subtle links between visible beacon nodes
      ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
      ctx.lineWidth = 1;
      for (let i = 0; i < frontBeacons.length - 1; i++) {
        const a = frontBeacons[i];
        const b = frontBeacons[i + 1];
        const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        if (dist < radius * 0.85) {
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.quadraticCurveTo(
            (a.sx + b.sx) / 2,
            (a.sy + b.sy) / 2 - 22,
            b.sx,
            b.sy
          );
          ctx.stroke();
        }
      }
    };

    const tick = () => {
      rotY += 0.0018;
      tiltX += (targetTiltX - tiltX) * 0.05;
      drawFrame();
      rafId = window.requestAnimationFrame(tick);
    };

    if (reducedMotion) {
      drawFrame();
    } else {
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
