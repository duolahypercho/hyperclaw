import React, { useRef, useEffect } from "react";

/*
  Per-step onboarding animations — one canvas, five scenes mapped to six steps.
  Step 1 (Device)      → scene 4 (Circuit Flow)
  Step 2 (Runtimes)    → scene 4 (Circuit Flow)
  Step 3 (Permissions) → scene 2 (Shield Lock)
  Step 4 (Company)     → scene 1 (Claw Deploy)
  Step 5 (Agent)       → scene 3 (Agent Eye)
  Step 6 (Launch)      → scene 5 (Liftoff)
*/

const STEP_TO_SCENE: Record<number, number> = {
  1: 4, 2: 4, 3: 2, 4: 1, 5: 3, 6: 5,
};

interface StepAnimationsProps {
  step: number; // 1-6
}

// ─── shared types ───────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  radius: number; opacity: number; hue: number;
  life: number; maxLife: number; wobble: number;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export default function StepAnimations({ step }: StepAnimationsProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);
  const stepRef = useRef(step);
  stepRef.current = STEP_TO_SCENE[step] ?? step;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0, h = 0, tick = 0;
    // Crossfade: each scene draws at its own alpha
    let activeScene = step;
    let fadeAlpha = 1;      // current scene opacity
    let prevScene = step;
    let prevAlpha = 0;      // outgoing scene opacity
    let transitioning = false;

    // Light/dark-aware white: on dark bg use white, on light bg use dark navy
    let isDark = true;
    function wc(a: number | string) {
      return isDark ? `rgba(255,255,255,${a})` : `rgba(20,30,70,${a})`;
    }

    // ─── background particles (shared) ─────────────────────
    const bgP: { x: number; y: number; vx: number; vy: number; o: number }[] = [];
    for (let i = 0; i < 20; i++) {
      bgP.push({
        x: Math.random() * 2000, y: Math.random() * 2000,
        vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08,
        o: 0.03 + Math.random() * 0.06,
      });
    }

    // ─── Scene 1: Claw Deploy ──────────────────────────────
    type ClawPhase = "idle" | "descending" | "closing" | "lifting" | "releasing";
    const claw = { phase: "idle" as ClawPhase, y: 0, openness: 1, timer: 0, holdingOrb: false };
    let restY = 0, grabY = 0;
    const waitOrbs: Particle[] = [];
    const deployedOrbs: Particle[] = [];

    function spawnWaitOrb() {
      waitOrbs.push({
        x: w * 0.5 + (Math.random() - 0.5) * 20, y: grabY + (Math.random() - 0.5) * 10,
        vx: 0, vy: 0, radius: 6 + Math.random() * 4, opacity: 0,
        hue: 180 + Math.random() * 60, life: 0, maxLife: 999, wobble: Math.random() * Math.PI * 2,
      });
    }

    function updateClaw() {
      claw.timer++;
      switch (claw.phase) {
        case "idle":
          if (claw.timer > 90 && waitOrbs.length > 0) { claw.phase = "descending"; claw.timer = 0; }
          claw.y = restY + Math.sin(tick * 0.03) * 3;
          claw.openness = 0.8 + Math.sin(tick * 0.02) * 0.1;
          break;
        case "descending": {
          const t = Math.min(claw.timer / 50, 1);
          claw.y = restY + (grabY - restY) * easeInOut(t);
          claw.openness = 1;
          if (t >= 1) { claw.phase = "closing"; claw.timer = 0; }
          break;
        }
        case "closing": {
          const t = Math.min(claw.timer / 15, 1);
          claw.openness = 1 - t * 0.85;
          if (t >= 1) { claw.holdingOrb = true; waitOrbs.pop(); claw.phase = "lifting"; claw.timer = 0; }
          break;
        }
        case "lifting": {
          const t = Math.min(claw.timer / 55, 1);
          claw.y = grabY + (h * 0.25 - grabY) * easeInOut(t);
          claw.openness = 0.15;
          if (t >= 1) { claw.phase = "releasing"; claw.timer = 0; }
          break;
        }
        case "releasing": {
          const t = Math.min(claw.timer / 12, 1);
          claw.openness = 0.15 + t * 0.85;
          if (t >= 0.3 && claw.holdingOrb) {
            claw.holdingOrb = false;
            const tx = w * 0.2 + Math.random() * w * 0.6;
            const ty = h * 0.08 + Math.random() * h * 0.15;
            deployedOrbs.push({
              x: tx, y: claw.y + 20, vx: 0, vy: (ty - (claw.y + 20)) * 0.008,
              radius: 4 + Math.random() * 3, opacity: 0,
              hue: 180 + Math.random() * 60, life: 0, maxLife: 600 + Math.random() * 300,
              wobble: Math.random() * Math.PI * 2,
            });
          }
          if (t >= 1) {
            const t2 = Math.min((claw.timer - 12) / 40, 1);
            if (t2 < 1) { claw.y += (restY - claw.y) * 0.05; }
            else { claw.phase = "idle"; claw.timer = 0; if (waitOrbs.length === 0) spawnWaitOrb(); }
          }
          break;
        }
      }
      for (const o of waitOrbs) { o.life++; o.opacity = Math.min(o.life / 30, 0.8); o.y += Math.sin(tick * 0.015 + o.wobble) * 0.15; }
      for (let i = deployedOrbs.length - 1; i >= 0; i--) {
        const o = deployedOrbs[i]; o.life++; o.y += o.vy; o.vy *= 0.985;
        if (o.life < 40) o.opacity = (o.life / 40) * 0.6;
        else if (o.life > o.maxLife - 60) o.opacity = Math.max(0, ((o.maxLife - o.life) / 60) * 0.6);
        else o.opacity = 0.5 + 0.1 * Math.sin(tick * 0.02 + o.wobble);
        if (o.life > o.maxLife) deployedOrbs.splice(i, 1);
      }
      while (deployedOrbs.length > 8) deployedOrbs.shift();
    }

    function drawOrb(o: Particle, glow: boolean) {
      const wx = Math.sin(tick * 0.02 + o.wobble) * 3;
      if (glow) {
        const g = ctx!.createRadialGradient(o.x + wx, o.y, 0, o.x + wx, o.y, o.radius * 3);
        g.addColorStop(0, `hsla(${o.hue},80%,70%,${o.opacity * 0.3})`);
        g.addColorStop(1, `hsla(${o.hue},80%,70%,0)`);
        ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(o.x + wx, o.y, o.radius * 3, 0, Math.PI * 2); ctx!.fill();
      }
      const g2 = ctx!.createRadialGradient(o.x + wx, o.y, 0, o.x + wx, o.y, o.radius);
      g2.addColorStop(0, `hsla(${o.hue},80%,80%,${o.opacity})`);
      g2.addColorStop(0.6, `hsla(${o.hue},70%,60%,${o.opacity * 0.7})`);
      g2.addColorStop(1, `hsla(${o.hue},60%,40%,0)`);
      ctx!.fillStyle = g2; ctx!.beginPath(); ctx!.arc(o.x + wx, o.y, o.radius, 0, Math.PI * 2); ctx!.fill();
    }

    function drawScene1() {
      // Deployed orb connections
      for (let i = 0; i < deployedOrbs.length; i++) {
        for (let j = i + 1; j < deployedOrbs.length; j++) {
          const a = deployedOrbs[i], b = deployedOrbs[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 100) {
            ctx!.strokeStyle = `rgba(120,220,255,${(1 - d / 100) * 0.06 * Math.min(a.opacity, b.opacity)})`;
            ctx!.lineWidth = 0.5; ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); ctx!.stroke();
          }
        }
      }
      for (const o of deployedOrbs) drawOrb(o, true);
      for (const o of waitOrbs) drawOrb(o, true);

      // Claw
      const cx = w * 0.5, cy = claw.y;
      ctx!.strokeStyle = wc(0.08); ctx!.lineWidth = 2;
      ctx!.beginPath(); ctx!.moveTo(w * 0.2, 6); ctx!.lineTo(w * 0.8, 6); ctx!.stroke();
      ctx!.strokeStyle = wc(0.15); ctx!.lineWidth = 3;
      ctx!.beginPath(); ctx!.moveTo(cx, 0); ctx!.lineTo(cx, cy - 12); ctx!.stroke();
      ctx!.fillStyle = wc(0.12); ctx!.fillRect(cx - 10, cy - 14, 20, 10);

      for (const side of [-1, 0, 1]) {
        const spread = 14 + claw.openness * 18, fLen = 22 + claw.openness * 4;
        const tipX = cx + side * spread, tipY = cy + fLen;
        const ctrlX = cx + side * (spread * 0.3), ctrlY = cy + fLen * 0.4;
        if (claw.holdingOrb) {
          ctx!.strokeStyle = `rgba(120,220,255,${0.15 + 0.05 * Math.sin(tick * 0.1)})`;
          ctx!.lineWidth = 5; ctx!.beginPath(); ctx!.moveTo(cx + side * 4, cy); ctx!.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY); ctx!.stroke();
        }
        ctx!.strokeStyle = wc(0.25); ctx!.lineWidth = 2.5; ctx!.lineCap = "round";
        ctx!.beginPath(); ctx!.moveTo(cx + side * 4, cy); ctx!.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY); ctx!.stroke();
        ctx!.fillStyle = wc(0.35); ctx!.beginPath(); ctx!.arc(tipX, tipY, 2, 0, Math.PI * 2); ctx!.fill();
      }

      if (claw.holdingOrb) {
        drawOrb({ x: w * 0.5, y: claw.y + 22, vx: 0, vy: 0, radius: 7, opacity: 0.9, hue: 200, life: 0, maxLife: 999, wobble: tick * 0.05 }, true);
      }
    }

    // ─── Scene 2: Shield Lock ──────────────────────────────
    interface HexPiece { angle: number; dist: number; targetDist: number; opacity: number; size: number; delay: number; }
    const hexPieces: HexPiece[] = [];
    for (let ring = 0; ring < 3; ring++) {
      const count = ring === 0 ? 6 : ring === 1 ? 12 : 18;
      const targetDist = (ring + 1) * 36;
      for (let i = 0; i < count; i++) {
        hexPieces.push({
          angle: (i / count) * Math.PI * 2 + ring * 0.15,
          dist: targetDist + 80 + Math.random() * 60,
          targetDist,
          opacity: 0,
          size: 14 - ring * 2,
          delay: ring * 20 + i * 3,
        });
      }
    }
    let shieldTimer = 0;
    let lockPulse = 0;
    const checkmarks: { x: number; y: number; opacity: number; life: number; angle: number }[] = [];

    function drawHex(x: number, y: number, r: number, alpha: number) {
      ctx!.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        i === 0 ? ctx!.moveTo(px, py) : ctx!.lineTo(px, py);
      }
      ctx!.closePath();
      ctx!.strokeStyle = `rgba(100,200,160,${alpha * 0.4})`;
      ctx!.lineWidth = 1;
      ctx!.stroke();
      ctx!.fillStyle = `rgba(100,200,160,${alpha * 0.08})`;
      ctx!.fill();
    }

    function drawScene2() {
      shieldTimer++;
      const cx = w * 0.5, cy = h * 0.45;

      // Hex pieces assemble
      for (const p of hexPieces) {
        const t = Math.max(0, Math.min((shieldTimer - p.delay) / 40, 1));
        p.dist = p.targetDist + (1 - easeInOut(t)) * (80 + p.targetDist * 0.5);
        p.opacity = easeInOut(t);
        const px = cx + Math.cos(p.angle + tick * 0.002) * p.dist;
        const py = cy + Math.sin(p.angle + tick * 0.002) * p.dist;
        drawHex(px, py, p.size, p.opacity);
      }

      // Central shield outline
      const assembled = Math.min(shieldTimer / 80, 1);
      if (assembled > 0.3) {
        const sa = (assembled - 0.3) / 0.7;
        // Shield shape (pointed bottom)
        ctx!.beginPath();
        ctx!.moveTo(cx, cy - 50 * sa);
        ctx!.lineTo(cx + 40 * sa, cy - 30 * sa);
        ctx!.lineTo(cx + 40 * sa, cy + 15 * sa);
        ctx!.lineTo(cx, cy + 50 * sa);
        ctx!.lineTo(cx - 40 * sa, cy + 15 * sa);
        ctx!.lineTo(cx - 40 * sa, cy - 30 * sa);
        ctx!.closePath();
        ctx!.strokeStyle = `rgba(100,220,170,${sa * 0.35})`;
        ctx!.lineWidth = 2;
        ctx!.stroke();
        ctx!.fillStyle = `rgba(100,220,170,${sa * 0.04})`;
        ctx!.fill();
      }

      // Lock icon in center
      lockPulse = 0.7 + 0.3 * Math.sin(tick * 0.04);
      if (assembled > 0.6) {
        const la = (assembled - 0.6) / 0.4 * lockPulse;
        // Lock body
        ctx!.fillStyle = `rgba(100,220,170,${la * 0.2})`;
        ctx!.fillRect(cx - 10, cy - 2, 20, 16);
        ctx!.strokeStyle = `rgba(100,220,170,${la * 0.5})`;
        ctx!.lineWidth = 1.5;
        ctx!.strokeRect(cx - 10, cy - 2, 20, 16);
        // Lock shackle
        ctx!.beginPath();
        ctx!.arc(cx, cy - 2, 8, Math.PI, 0);
        ctx!.stroke();
        // Keyhole
        ctx!.fillStyle = `rgba(100,220,170,${la * 0.6})`;
        ctx!.beginPath();
        ctx!.arc(cx, cy + 5, 2.5, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Periodic checkmarks flying in
      if (shieldTimer > 100 && shieldTimer % 80 === 0) {
        const a = Math.random() * Math.PI * 2;
        checkmarks.push({ x: cx + Math.cos(a) * 150, y: cy + Math.sin(a) * 150, opacity: 1, life: 0, angle: a });
      }
      for (let i = checkmarks.length - 1; i >= 0; i--) {
        const c = checkmarks[i];
        c.life++;
        const t = Math.min(c.life / 30, 1);
        const px = c.x + (cx - c.x) * easeInOut(t);
        const py = c.y + (cy - c.y) * easeInOut(t);
        c.opacity = t < 0.8 ? 1 : (1 - t) / 0.2;
        // Draw checkmark
        ctx!.strokeStyle = `rgba(100,220,170,${c.opacity * 0.6})`;
        ctx!.lineWidth = 2; ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(px - 5, py);
        ctx!.lineTo(px - 1, py + 4);
        ctx!.lineTo(px + 5, py - 4);
        ctx!.stroke();
        if (c.life > 40) checkmarks.splice(i, 1);
      }
    }

    // ─── Scene 3: Agent Eye ────────────────────────────────
    interface DataNode { angle: number; dist: number; speed: number; size: number; hue: number; pulseOff: number; }
    const dataNodes: DataNode[] = [];
    for (let i = 0; i < 8; i++) {
      dataNodes.push({
        angle: (i / 8) * Math.PI * 2,
        dist: 60 + Math.random() * 50,
        speed: 0.003 + Math.random() * 0.004,
        size: 3 + Math.random() * 3,
        hue: 200 + Math.random() * 40,
        pulseOff: Math.random() * Math.PI * 2,
      });
    }
    let scanAngle = 0;

    function drawScene3() {
      const cx = w * 0.5, cy = h * 0.45;
      scanAngle += 0.015;

      // Orbital rings (faint)
      for (const r of [60, 85, 115]) {
        ctx!.strokeStyle = `rgba(150,180,255,${0.04 + 0.02 * Math.sin(tick * 0.01 + r)})`;
        ctx!.lineWidth = 0.5;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // Data nodes orbiting
      for (const n of dataNodes) {
        n.angle += n.speed;
        const nx = cx + Math.cos(n.angle) * n.dist;
        const ny = cy + Math.sin(n.angle) * n.dist;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.03 + n.pulseOff);

        // Connection to center
        ctx!.strokeStyle = `rgba(150,180,255,${0.06 * pulse})`;
        ctx!.lineWidth = 0.5;
        ctx!.beginPath(); ctx!.moveTo(cx, cy); ctx!.lineTo(nx, ny); ctx!.stroke();

        // Node glow
        const g = ctx!.createRadialGradient(nx, ny, 0, nx, ny, n.size * 3);
        g.addColorStop(0, `hsla(${n.hue},70%,70%,${0.3 * pulse})`);
        g.addColorStop(1, `hsla(${n.hue},70%,70%,0)`);
        ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(nx, ny, n.size * 3, 0, Math.PI * 2); ctx!.fill();

        // Node core
        ctx!.fillStyle = `hsla(${n.hue},70%,80%,${0.6 * pulse})`;
        ctx!.beginPath(); ctx!.arc(nx, ny, n.size, 0, Math.PI * 2); ctx!.fill();
      }

      // Central eye
      const eyeW = 28, eyeH = 16;
      const blink = Math.abs(Math.sin(tick * 0.008)) < 0.05 ? 0.1 : 1; // occasional blink

      // Eye shape (almond)
      ctx!.beginPath();
      ctx!.ellipse(cx, cy, eyeW, eyeH * blink, 0, 0, Math.PI * 2);
      ctx!.strokeStyle = `rgba(150,200,255,0.3)`;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();
      ctx!.fillStyle = `rgba(150,200,255,0.03)`;
      ctx!.fill();

      // Iris
      if (blink > 0.5) {
        const irisR = 10;
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, irisR);
        g.addColorStop(0, `rgba(100,180,255,0.5)`);
        g.addColorStop(0.5, `rgba(80,150,255,0.2)`);
        g.addColorStop(1, `rgba(80,150,255,0)`);
        ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(cx, cy, irisR, 0, Math.PI * 2); ctx!.fill();

        // Pupil
        ctx!.fillStyle = `rgba(200,230,255,0.7)`;
        ctx!.beginPath(); ctx!.arc(cx, cy, 3, 0, Math.PI * 2); ctx!.fill();
      }

      // Scanning beam
      const beamX1 = cx + Math.cos(scanAngle) * 120;
      const beamY1 = cy + Math.sin(scanAngle) * 120;
      const beamX2 = cx + Math.cos(scanAngle + 0.3) * 120;
      const beamY2 = cy + Math.sin(scanAngle + 0.3) * 120;
      ctx!.fillStyle = `rgba(100,180,255,0.03)`;
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.lineTo(beamX1, beamY1);
      ctx!.lineTo(beamX2, beamY2);
      ctx!.closePath();
      ctx!.fill();
    }

    // ─── Scene 4: Circuit Flow ─────────────────────────────
    interface Circuit {
      points: { x: number; y: number }[];
      packetPos: number; // 0-1 along the path
      speed: number;
      hue: number;
    }
    const circuits: Circuit[] = [];

    function buildCircuits() {
      circuits.length = 0;
      const cx = w * 0.5, cy = h * 0.5;
      // Generate circuit traces radiating from center
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + 0.2;
        const pts: { x: number; y: number }[] = [{ x: cx, y: cy }];
        let px = cx, py = cy;
        const segments = 3 + Math.floor(Math.random() * 3);
        for (let s = 0; s < segments; s++) {
          const len = 30 + Math.random() * 50;
          // Alternate horizontal and vertical moves with some angle drift
          if (s % 2 === 0) {
            px += Math.cos(angle + (Math.random() - 0.5) * 0.5) * len;
            py += Math.sin(angle + (Math.random() - 0.5) * 0.5) * len;
          } else {
            // Right angle turn
            const perpAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
            px += Math.cos(perpAngle) * len * 0.6;
            py += Math.sin(perpAngle) * len * 0.6;
          }
          pts.push({ x: px, y: py });
        }
        circuits.push({
          points: pts,
          packetPos: Math.random(),
          speed: 0.003 + Math.random() * 0.004,
          hue: 180 + Math.random() * 50,
        });
      }
    }

    function drawScene4() {
      // Central hub
      const cx = w * 0.5, cy = h * 0.5;
      const hubPulse = 0.6 + 0.4 * Math.sin(tick * 0.03);

      // Hub glow
      const hg = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 25);
      hg.addColorStop(0, `rgba(100,220,200,${0.15 * hubPulse})`);
      hg.addColorStop(1, `rgba(100,220,200,0)`);
      ctx!.fillStyle = hg; ctx!.beginPath(); ctx!.arc(cx, cy, 25, 0, Math.PI * 2); ctx!.fill();

      // Hub core
      ctx!.fillStyle = `rgba(100,220,200,${0.3 * hubPulse})`;
      ctx!.beginPath(); ctx!.arc(cx, cy, 6, 0, Math.PI * 2); ctx!.fill();
      ctx!.strokeStyle = `rgba(100,220,200,${0.2 * hubPulse})`;
      ctx!.lineWidth = 1; ctx!.beginPath(); ctx!.arc(cx, cy, 12, 0, Math.PI * 2); ctx!.stroke();

      for (const c of circuits) {
        c.packetPos = (c.packetPos + c.speed) % 1;

        // Draw trace
        ctx!.strokeStyle = `rgba(100,220,200,0.1)`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(c.points[0].x, c.points[0].y);
        for (let i = 1; i < c.points.length; i++) {
          ctx!.lineTo(c.points[i].x, c.points[i].y);
        }
        ctx!.stroke();

        // Junction nodes
        for (let i = 1; i < c.points.length; i++) {
          const p = c.points[i];
          ctx!.fillStyle = `rgba(100,220,200,0.15)`;
          ctx!.beginPath(); ctx!.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx!.fill();
        }

        // Data packet traveling along the trace
        const totalLen = c.points.reduce((acc, p, i) => {
          if (i === 0) return 0;
          return acc + Math.hypot(p.x - c.points[i - 1].x, p.y - c.points[i - 1].y);
        }, 0);
        const targetLen = c.packetPos * totalLen;
        let traveled = 0;
        let px = c.points[0].x, py = c.points[0].y;
        for (let i = 1; i < c.points.length; i++) {
          const segLen = Math.hypot(c.points[i].x - c.points[i - 1].x, c.points[i].y - c.points[i - 1].y);
          if (traveled + segLen >= targetLen) {
            const frac = (targetLen - traveled) / segLen;
            px = c.points[i - 1].x + (c.points[i].x - c.points[i - 1].x) * frac;
            py = c.points[i - 1].y + (c.points[i].y - c.points[i - 1].y) * frac;
            break;
          }
          traveled += segLen;
        }

        // Packet glow
        const pg = ctx!.createRadialGradient(px, py, 0, px, py, 12);
        pg.addColorStop(0, `hsla(${c.hue},70%,70%,0.5)`);
        pg.addColorStop(1, `hsla(${c.hue},70%,70%,0)`);
        ctx!.fillStyle = pg; ctx!.beginPath(); ctx!.arc(px, py, 12, 0, Math.PI * 2); ctx!.fill();
        ctx!.fillStyle = `hsla(${c.hue},70%,80%,0.8)`;
        ctx!.beginPath(); ctx!.arc(px, py, 2.5, 0, Math.PI * 2); ctx!.fill();
      }
    }

    // ─── Scene 5: Liftoff ──────────────────────────────────
    interface Spark { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; hue: number; size: number; }
    const sparks: Spark[] = [];
    let launchTimer = 0;
    let launched = false;
    let rocketY = 0;

    function drawScene5() {
      launchTimer++;
      const cx = w * 0.5;
      const groundY = h * 0.7;

      // Countdown phase: energy builds
      const countdownDone = launchTimer > 120; // 5s countdown
      if (!countdownDone) {
        launched = false;
        rocketY = groundY;
        const progress = launchTimer / 120;

        // Growing energy ring
        const ringR = 20 + progress * 30;
        const ringA = progress * 0.4;
        ctx!.strokeStyle = `rgba(255,180,80,${ringA})`;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath(); ctx!.arc(cx, groundY - 30, ringR, 0, Math.PI * 2); ctx!.stroke();

        // Energy particles converging
        if (launchTimer % 4 === 0) {
          const a = Math.random() * Math.PI * 2;
          sparks.push({
            x: cx + Math.cos(a) * (100 + Math.random() * 60),
            y: groundY - 30 + Math.sin(a) * (100 + Math.random() * 60),
            vx: 0, vy: 0, life: 0, maxLife: 30, hue: 30 + Math.random() * 30, size: 1.5,
          });
          const last = sparks[sparks.length - 1];
          last.vx = (cx - last.x) * 0.04;
          last.vy = (groundY - 30 - last.y) * 0.04;
        }

        // Countdown numbers
        const num = 3 - Math.floor(progress * 3);
        if (num > 0 && progress < 1) {
          ctx!.fillStyle = `rgba(255,200,100,${0.15 + 0.1 * Math.sin(tick * 0.1)})`;
          ctx!.font = `${60 + progress * 20}px monospace`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText(String(num), cx, h * 0.3);
        }
      } else {
        // Launch!
        if (!launched) { launched = true; rocketY = groundY; }
        const lt = launchTimer - 120;
        const accel = Math.min(lt / 60, 1);
        rocketY -= 1.5 * accel + 0.02 * lt * accel;

        // Exhaust particles
        if (lt % 2 === 0) {
          for (let i = 0; i < 3; i++) {
            sparks.push({
              x: cx + (Math.random() - 0.5) * 8,
              y: rocketY + 15,
              vx: (Math.random() - 0.5) * 2,
              vy: 2 + Math.random() * 3,
              life: 0, maxLife: 25 + Math.random() * 15,
              hue: 20 + Math.random() * 30,
              size: 2 + Math.random() * 2,
            });
          }
        }

        // Rocket body (simple)
        if (rocketY > -40) {
          // Flame
          const flameH = 12 + Math.random() * 8;
          const fg = ctx!.createLinearGradient(cx, rocketY + 10, cx, rocketY + 10 + flameH);
          fg.addColorStop(0, `rgba(255,200,80,0.6)`);
          fg.addColorStop(1, `rgba(255,100,30,0)`);
          ctx!.fillStyle = fg;
          ctx!.beginPath();
          ctx!.moveTo(cx - 6, rocketY + 10);
          ctx!.lineTo(cx + 6, rocketY + 10);
          ctx!.lineTo(cx, rocketY + 10 + flameH);
          ctx!.closePath();
          ctx!.fill();

          // Body
          ctx!.fillStyle = wc(0.25);
          ctx!.beginPath();
          ctx!.moveTo(cx, rocketY - 16); // nose
          ctx!.lineTo(cx + 8, rocketY + 10);
          ctx!.lineTo(cx - 8, rocketY + 10);
          ctx!.closePath();
          ctx!.fill();
          ctx!.strokeStyle = wc(0.4);
          ctx!.lineWidth = 1;
          ctx!.stroke();

          // Window
          ctx!.fillStyle = `rgba(100,200,255,0.4)`;
          ctx!.beginPath(); ctx!.arc(cx, rocketY - 2, 3, 0, Math.PI * 2); ctx!.fill();
        }

        // Reset cycle
        if (rocketY < -60) {
          launchTimer = 0;
          launched = false;
        }
      }

      // Update sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life++; s.x += s.vx; s.y += s.vy; s.vx *= 0.97; s.vy *= 0.97;
        const alpha = Math.max(0, 1 - s.life / s.maxLife);
        const g = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2);
        g.addColorStop(0, `hsla(${s.hue},80%,70%,${alpha * 0.5})`);
        g.addColorStop(1, `hsla(${s.hue},80%,70%,0)`);
        ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(s.x, s.y, s.size * 2, 0, Math.PI * 2); ctx!.fill();
        if (s.life > s.maxLife) sparks.splice(i, 1);
      }
      while (sparks.length > 100) sparks.shift();
    }

    // ─── resize + init ─────────────────────────────────────
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      restY = h * 0.12;
      grabY = h * 0.55;
      claw.y = restY;
      buildCircuits();
    }

    resize();
    window.addEventListener("resize", resize);
    spawnWaitOrb();

    // ─── main loop ─────────────────────────────────────────
    function frame() {
      tick++;
      isDark = document.documentElement.classList.contains("dark");
      const newStep = stepRef.current;

      // Handle step transitions with crossfade
      if (newStep !== activeScene && !transitioning) {
        transitioning = true;
        prevScene = activeScene;
        prevAlpha = fadeAlpha;
        activeScene = newStep;
        fadeAlpha = 0;
        // Reset scene-specific timers
        if (newStep === 2) { shieldTimer = 0; checkmarks.length = 0; }
        if (newStep === 5) { launchTimer = 0; sparks.length = 0; launched = false; }
      }

      if (transitioning) {
        fadeAlpha = Math.min(fadeAlpha + 0.03, 1);
        prevAlpha = Math.max(prevAlpha - 0.03, 0);
        if (fadeAlpha >= 1 && prevAlpha <= 0) transitioning = false;
      }

      ctx!.clearRect(0, 0, w, h);

      // Background particles (always)
      for (const p of bgP) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx!.fillStyle = wc(p.o);
        ctx!.beginPath(); ctx!.arc(p.x, p.y, 1, 0, Math.PI * 2); ctx!.fill();
      }

      // Draw scenes with alpha
      const drawSceneByNumber = (n: number) => {
        if (n === 1) { updateClaw(); drawScene1(); }
        else if (n === 2) drawScene2();
        else if (n === 3) drawScene3();
        else if (n === 4) drawScene4();
        else if (n === 5) drawScene5();
      };

      if (transitioning && prevAlpha > 0) {
        ctx!.globalAlpha = prevAlpha;
        drawSceneByNumber(prevScene);
      }

      ctx!.globalAlpha = fadeAlpha;
      drawSceneByNumber(activeScene);
      ctx!.globalAlpha = 1;

      raf.current = requestAnimationFrame(frame);
    }

    raf.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    />
  );
}
