import React, { useRef, useEffect } from "react";

/*
  "The Claw Deploy" — animated claw that grabs and deploys glowing agent orbs.
  Canvas-based, ~24fps, respects reduced motion.
*/

interface Orb {
  x: number;
  y: number;
  vy: number;
  radius: number;
  opacity: number;
  hue: number;
  life: number;
  maxLife: number;
  wobble: number;
}

// Claw arm state machine
type ClawPhase = "idle" | "descending" | "closing" | "lifting" | "releasing";

interface ClawState {
  phase: ClawPhase;
  y: number;         // claw head Y position
  openness: number;  // 0 = closed, 1 = fully open
  timer: number;     // frames in current phase
  holdingOrb: boolean;
}

export default function ClawAnimation() {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0, h = 0;
    let tick = 0;
    const orbs: Orb[] = [];
    const deployedOrbs: Orb[] = [];

    const claw: ClawState = {
      phase: "idle",
      y: 0,
      openness: 1,
      timer: 0,
      holdingOrb: false,
    };

    // Target positions for the claw
    let restY = 0;
    let grabY = 0;
    let spawnY = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      restY = h * 0.12;
      grabY = h * 0.55;
      spawnY = h * 0.55;
      claw.y = restY;
    }

    resize();
    window.addEventListener("resize", resize);

    // Spawn a waiting orb at the grab zone
    function spawnWaitingOrb() {
      orbs.push({
        x: w * 0.5 + (Math.random() - 0.5) * 20,
        y: spawnY + (Math.random() - 0.5) * 10,
        vy: 0,
        radius: 6 + Math.random() * 4,
        opacity: 0,
        hue: 180 + Math.random() * 60, // cyan-to-blue range
        life: 0,
        maxLife: 999,
        wobble: Math.random() * Math.PI * 2,
      });
    }

    // Ensure there's always an orb waiting
    function ensureWaitingOrb() {
      if (orbs.length === 0 && claw.phase === "idle") {
        spawnWaitingOrb();
      }
    }

    function drawClaw(cx: number, cy: number, openness: number, holding: boolean) {
      if (!ctx) return;
      const armWidth = 3;
      const baseX = cx;
      const baseY = 0;

      // Rail/track at top
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, 6);
      ctx.lineTo(w * 0.8, 6);
      ctx.stroke();

      // Vertical arm
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = armWidth;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX, cy - 12);
      ctx.stroke();

      // Claw head housing
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.rect(cx - 10, cy - 14, 20, 10);
      ctx.fill();

      // Claw fingers (3 prongs)
      const spread = 14 + openness * 18; // spread increases with openness
      const fingerLen = 22 + openness * 4;
      const fingers = [-1, 0, 1];

      for (const side of fingers) {
        const tipX = cx + side * spread;
        const tipY = cy + fingerLen;
        const ctrlX = cx + side * (spread * 0.3);
        const ctrlY = cy + fingerLen * 0.4;

        // Finger glow when holding
        if (holding) {
          ctx.strokeStyle = `rgba(120, 220, 255, ${0.15 + 0.05 * Math.sin(tick * 0.1)})`;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(cx + side * 4, cy);
          ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
          ctx.stroke();
        }

        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + side * 4, cy);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();

        // Finger tip
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawOrb(orb: Orb, glow: boolean = false) {
      if (!ctx) return;
      const wobbleX = Math.sin(tick * 0.02 + orb.wobble) * 3;

      if (glow) {
        // Outer glow
        const grad = ctx.createRadialGradient(
          orb.x + wobbleX, orb.y, 0,
          orb.x + wobbleX, orb.y, orb.radius * 3,
        );
        grad.addColorStop(0, `hsla(${orb.hue}, 80%, 70%, ${orb.opacity * 0.3})`);
        grad.addColorStop(1, `hsla(${orb.hue}, 80%, 70%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x + wobbleX, orb.y, orb.radius * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core
      const grad2 = ctx.createRadialGradient(
        orb.x + wobbleX, orb.y, 0,
        orb.x + wobbleX, orb.y, orb.radius,
      );
      grad2.addColorStop(0, `hsla(${orb.hue}, 80%, 80%, ${orb.opacity})`);
      grad2.addColorStop(0.6, `hsla(${orb.hue}, 70%, 60%, ${orb.opacity * 0.7})`);
      grad2.addColorStop(1, `hsla(${orb.hue}, 60%, 40%, 0)`);
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(orb.x + wobbleX, orb.y, orb.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawDeployedOrbs() {
      // Draw connections between nearby deployed orbs
      for (let i = 0; i < deployedOrbs.length; i++) {
        for (let j = i + 1; j < deployedOrbs.length; j++) {
          const a = deployedOrbs[i];
          const b = deployedOrbs[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            const alpha = (1 - dist / 100) * 0.06 * Math.min(a.opacity, b.opacity);
            ctx!.strokeStyle = `rgba(120, 220, 255, ${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      for (const orb of deployedOrbs) {
        drawOrb(orb, true);
      }
    }

    function updateClaw() {
      claw.timer++;

      switch (claw.phase) {
        case "idle": {
          if (claw.timer > 90 && orbs.length > 0) { // ~3.75s wait
            claw.phase = "descending";
            claw.timer = 0;
          }
          // Subtle idle bob
          claw.y = restY + Math.sin(tick * 0.03) * 3;
          claw.openness = 0.8 + Math.sin(tick * 0.02) * 0.1;
          break;
        }
        case "descending": {
          const t = Math.min(claw.timer / 50, 1); // ~2s
          const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          claw.y = restY + (grabY - restY) * ease;
          claw.openness = 1;
          if (t >= 1) {
            claw.phase = "closing";
            claw.timer = 0;
          }
          break;
        }
        case "closing": {
          const t = Math.min(claw.timer / 15, 1); // ~0.6s
          claw.openness = 1 - t * 0.85;
          if (t >= 1) {
            claw.holdingOrb = true;
            if (orbs.length > 0) orbs.pop();
            claw.phase = "lifting";
            claw.timer = 0;
          }
          break;
        }
        case "lifting": {
          const releaseY = h * 0.25;
          const t = Math.min(claw.timer / 55, 1); // ~2.3s
          const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          claw.y = grabY + (releaseY - grabY) * ease;
          claw.openness = 0.15;
          if (t >= 1) {
            claw.phase = "releasing";
            claw.timer = 0;
          }
          break;
        }
        case "releasing": {
          const t = Math.min(claw.timer / 12, 1);
          claw.openness = 0.15 + t * 0.85;
          if (t >= 0.3 && claw.holdingOrb) {
            claw.holdingOrb = false;
            // Deploy the orb — it floats upward and settles
            const targetX = w * 0.2 + Math.random() * w * 0.6;
            const targetY = h * 0.08 + Math.random() * h * 0.15;
            deployedOrbs.push({
              x: w * 0.5,
              y: claw.y + 20,
              vy: -0.8 - Math.random() * 0.4,
              radius: 4 + Math.random() * 3,
              opacity: 0,
              hue: 180 + Math.random() * 60,
              life: 0,
              maxLife: 600 + Math.random() * 300, // ~25-37s before fading
              wobble: Math.random() * Math.PI * 2,
            });
            // Nudge deployed orb toward target
            const last = deployedOrbs[deployedOrbs.length - 1];
            last.vy = (targetY - last.y) * 0.008;
            last.x = targetX;
          }
          if (t >= 1) {
            // Return to rest
            const t2 = Math.min((claw.timer - 12) / 40, 1);
            if (t2 < 1) {
              claw.y = claw.y + (restY - claw.y) * 0.05;
            } else {
              claw.phase = "idle";
              claw.timer = 0;
              ensureWaitingOrb();
            }
          }
          break;
        }
      }
    }

    function updateOrbs() {
      // Waiting orbs fade in with gentle float
      for (const orb of orbs) {
        orb.life++;
        orb.opacity = Math.min(orb.life / 30, 0.8);
        orb.y += Math.sin(tick * 0.015 + orb.wobble) * 0.15;
      }

      // Deployed orbs float to position and pulse
      for (let i = deployedOrbs.length - 1; i >= 0; i--) {
        const orb = deployedOrbs[i];
        orb.life++;
        orb.y += orb.vy;
        orb.vy *= 0.985; // slow down

        // Fade in
        if (orb.life < 40) {
          orb.opacity = (orb.life / 40) * 0.6;
        } else if (orb.life > orb.maxLife - 60) {
          // Fade out near end of life
          orb.opacity = Math.max(0, ((orb.maxLife - orb.life) / 60) * 0.6);
        } else {
          orb.opacity = 0.5 + 0.1 * Math.sin(tick * 0.02 + orb.wobble);
        }

        if (orb.life > orb.maxLife) {
          deployedOrbs.splice(i, 1);
        }
      }

      // Cap deployed orbs
      while (deployedOrbs.length > 8) {
        deployedOrbs.shift();
      }
    }

    // Draw held orb attached to claw
    function drawHeldOrb() {
      if (!claw.holdingOrb) return;
      const fakeOrb: Orb = {
        x: w * 0.5,
        y: claw.y + 22,
        vy: 0,
        radius: 7,
        opacity: 0.9,
        hue: 200,
        life: 0,
        maxLife: 999,
        wobble: tick * 0.05,
      };
      drawOrb(fakeOrb, true);
    }

    // Ambient particles (very subtle)
    const bgParticles: { x: number; y: number; vx: number; vy: number; o: number }[] = [];
    for (let i = 0; i < 20; i++) {
      bgParticles.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        o: 0.03 + Math.random() * 0.06,
      });
    }

    ensureWaitingOrb();

    function frame() {
      tick++;
      ctx!.clearRect(0, 0, w, h);

      // Background particles
      for (const p of bgParticles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx!.fillStyle = `rgba(255, 255, 255, ${p.o})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx!.fill();
      }

      updateClaw();
      updateOrbs();

      // Draw in order: deployed orbs -> waiting orbs -> claw -> held orb
      drawDeployedOrbs();
      for (const orb of orbs) drawOrb(orb, true);
      drawClaw(w * 0.5, claw.y, claw.openness, claw.holdingOrb);
      drawHeldOrb();

      raf.current = requestAnimationFrame(frame);
    }

    raf.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    />
  );
}
