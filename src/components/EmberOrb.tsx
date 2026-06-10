"use client";

import { useEffect, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────

const ORB_CONFIG = {
  // Spring physics — lower = more lag, higher = snappier
  stiffness:  0.055,
  // Orb size as fraction of the larger viewport dimension
  sizeRatio:  1.4,
  // Colors
  coreColor:  "rgba(240, 125, 8,  0.92)",
  midColor:   "rgba(185,  62, 5,  0.52)",
  outerColor: "rgba(110,  28, 3,  0.20)",
  edgeColor:  "rgba( 50,  10, 1,  0.06)",
  // Static fallback position (percentage) when no cursor data yet
  defaultX: 52,
  defaultY: 44,
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function EmberOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Current rendered position (spring target)
    let renderX = (window.innerWidth  * ORB_CONFIG.defaultX) / 100;
    let renderY = (window.innerHeight * ORB_CONFIG.defaultY) / 100;

    // Mouse target position
    let targetX = renderX;
    let targetY = renderY;

    let rafId = 0;
    let hasMoved = false;

    // ── Resize handler ───────────────────────────────────────────────────────
    function resize() {
      canvas!.width  = window.innerWidth;
      canvas!.height = window.innerHeight;
      if (!hasMoved) {
        renderX = (window.innerWidth  * ORB_CONFIG.defaultX) / 100;
        renderY = (window.innerHeight * ORB_CONFIG.defaultY) / 100;
        targetX = renderX;
        targetY = renderY;
      }
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // ── Mouse tracking ───────────────────────────────────────────────────────
    function onMouseMove(e: MouseEvent) {
      targetX = e.clientX;
      targetY = e.clientY;
      hasMoved = true;
    }
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    // Touch support
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      targetX = t.clientX;
      targetY = t.clientY;
      hasMoved = true;
    }
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    // ── Draw ─────────────────────────────────────────────────────────────────
    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      const size = Math.max(w, h) * ORB_CONFIG.sizeRatio;
      const r    = size / 2;

      // Spring step — lerp toward target each frame
      renderX += (targetX - renderX) * ORB_CONFIG.stiffness;
      renderY += (targetY - renderY) * ORB_CONFIG.stiffness;

      ctx!.clearRect(0, 0, w, h);

      // Radial gradient — four stops: core → mid → outer → edge → transparent
      const grad = ctx!.createRadialGradient(
        renderX, renderY, 0,
        renderX, renderY, r
      );
      grad.addColorStop(0.00, ORB_CONFIG.coreColor);
      grad.addColorStop(0.18, ORB_CONFIG.midColor);
      grad.addColorStop(0.42, ORB_CONFIG.outerColor);
      grad.addColorStop(0.68, ORB_CONFIG.edgeColor);
      grad.addColorStop(1.00, "rgba(0,0,0,0)");

      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, h);

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        0,
        pointerEvents: "none",
        display:       "block",
      }}
    />
  );
}