"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  ROOM,
  BOSS_SEAT,
  getCubicleCenterDynamic,
  getOfficeLayout,
  WANDER_POINTS,
  type AgentConfig,
  type AgentState,
  type OfficeLayout,
} from "./types";
import {
  drawFloor,
  drawZoneFloors,
  drawConferenceRoom,
  drawBossOffice,
  drawKitchen,
  drawCubicle,
  drawLounge,
  drawGymAndBathroom,
  drawHallways,
  drawCharacter,
} from "./draw";
import { loadCharacterSprites } from "./pixelArtSprites";

const SPEED = 3.2;
const ANIM_TICK = 6;
const WAIT_MS = 0.5;
const MIN_WALK_DIST = 40;

function initialAgentState(agent: AgentConfig, layout: OfficeLayout): AgentState {
  const isBoss = agent.isBoss;
  if (isBoss) {
    return {
      x: BOSS_SEAT.x,
      y: BOSS_SEAT.y,
      targetX: BOSS_SEAT.x,
      targetY: BOSS_SEAT.y,
      status: "idle",
      animFrame: 0,
      facingRight: true,
      isSitting: false,
      waitUntil: 0,
    };
  }
  const row = Math.floor(agent.deskIndex / layout.cubicleCols);
  const col = agent.deskIndex % layout.cubicleCols;
  const seat = getCubicleCenterDynamic(layout, row, col);
  return {
    x: seat.x,
    y: seat.y,
    targetX: seat.x,
    targetY: seat.y,
    status: "idle",
    animFrame: 0,
    facingRight: true,
    isSitting: false,
    waitUntil: 0,
  };
}

function getDeskPosition(agent: AgentConfig, layout: OfficeLayout): { x: number; y: number } {
  if (agent.isBoss) return BOSS_SEAT;
  const row = Math.floor(agent.deskIndex / layout.cubicleCols);
  const col = agent.deskIndex % layout.cubicleCols;
  return getCubicleCenterDynamic(layout, row, col);
}

import type { RoomLabels } from "./types";

interface PixelOfficeCanvasProps {
  agents: AgentConfig[];
  statuses: Record<string, "working" | "idle">;
  currentTasks?: Record<string, string>;
  /** Office name = main agent's name (dynamic); used for campus title and main building */
  officeName?: string;
  /** Lead/boss room label — falls back to officeName when not provided */
  bossLabel?: string;
  roomLabels?: RoomLabels;
}

export function PixelOfficeCanvas({ agents, statuses, currentTasks, officeName, bossLabel, roomLabels = {} }: PixelOfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statesRef = useRef<Map<string, AgentState>>(new Map());
  const animRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const [mounted, setMounted] = useState(false);
  const [pixelSpritesReady, setPixelSpritesReady] = useState(false);

  const cubicleCount = agents.filter((a) => !a.isBoss).length;
  const layout = getOfficeLayout(cubicleCount);
  const { canvasW, canvasH } = layout;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadCharacterSprites()
      .then(() => setPixelSpritesReady(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    agents.forEach((a) => {
      if (!statesRef.current.has(a.id)) {
        statesRef.current.set(a.id, initialAgentState(a, layout));
      }
    });
    const ids = new Set(agents.map((a) => a.id));
    ids.forEach((id) => {
      if (!agents.some((a) => a.id === id)) statesRef.current.delete(id);
    });
  }, [agents, layout.cubicleRows, layout.cubicleCols]);

  useEffect(() => {
    if (!mounted || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    (ctx as CanvasRenderingContext2D).imageSmoothingEnabled = false;

    let last = performance.now();
    const loop = () => {
      animRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      frameRef.current += 1;

      agents.forEach((agent) => {
        const state = statesRef.current.get(agent.id);
        if (!state) return;
        const status = statuses[agent.id] ?? "idle";
        state.status = status;

        if (status === "working") {
          const desk = getDeskPosition(agent, layout);
          const timeSec = now / 1000;
          const atDesk = () => Math.abs(state.targetX - desk.x) < 5 && Math.abs(state.targetY - desk.y) < 5;

          if (state.onBreak) {
            if (state.breakEndsAt != null && timeSec >= state.breakEndsAt) {
              state.targetX = desk.x;
              state.targetY = desk.y;
              state.breakEndsAt = undefined;
            }
            const dx = state.targetX - state.x;
            const dy = state.targetY - state.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 4) {
              if (atDesk()) {
                state.isSitting = true;
                state.onBreak = false;
                state.x = desk.x;
                state.y = desk.y;
                state.nextBreakAt = timeSec + 8 + Math.random() * 10;
              } else if (state.breakEndsAt == null) {
                state.breakEndsAt = timeSec + 1.5 + Math.random() * 2.5;
              }
            } else {
              state.facingRight = dx >= 0;
              state.x += (dx / dist) * SPEED * 60 * dt;
              state.y += (dy / dist) * SPEED * 60 * dt;
              if (frameRef.current % ANIM_TICK === 0) state.animFrame += 1;
            }
          } else if (state.isSitting && (state.nextBreakAt ?? 0) > 0 && timeSec >= (state.nextBreakAt ?? 0)) {
            state.isSitting = false;
            state.onBreak = true;
            state.nextBreakAt = undefined;
            state.breakEndsAt = undefined;
            let pt = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
            let d = Math.hypot(pt.x - state.x, pt.y - state.y);
            for (let t = 0; t < 8 && d < MIN_WALK_DIST; t++) {
              pt = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
              d = Math.hypot(pt.x - state.x, pt.y - state.y);
            }
            state.targetX = pt.x;
            state.targetY = Math.min(pt.y, canvasH - 80);
          } else if (!state.isSitting) {
            state.targetX = desk.x;
            state.targetY = desk.y;
            const dx = state.targetX - state.x;
            const dy = state.targetY - state.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 4) {
              state.isSitting = true;
              state.x = desk.x;
              state.y = desk.y;
              state.nextBreakAt = timeSec + 8 + Math.random() * 10;
            } else {
              state.facingRight = dx >= 0;
              state.x += (dx / dist) * SPEED * 60 * dt;
              state.y += (dy / dist) * SPEED * 60 * dt;
              if (frameRef.current % ANIM_TICK === 0) state.animFrame += 1;
            }
          }
        } else {
          state.isSitting = false;
          const timeSec = now / 1000;
          if (timeSec >= state.waitUntil) {
            let pt = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
            let distToPt = Math.hypot(pt.x - state.x, pt.y - state.y);
            for (let tries = 0; tries < 8 && distToPt < MIN_WALK_DIST; tries++) {
              pt = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
              distToPt = Math.hypot(pt.x - state.x, pt.y - state.y);
            }
            state.targetX = pt.x;
            state.targetY = Math.min(pt.y, canvasH - 80);
            state.waitUntil = timeSec + WAIT_MS + Math.random() * 2.5;
          }
          const dx = state.targetX - state.x;
          const dy = state.targetY - state.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= 2) {
            state.facingRight = dx >= 0;
            state.x += (dx / dist) * SPEED * 60 * dt;
            state.y += (dy / dist) * SPEED * 60 * dt;
            if (frameRef.current % ANIM_TICK === 0) state.animFrame += 1;
          }
        }

        statesRef.current.set(agent.id, state);
      });

      drawFloor(ctx, canvasW, canvasH);
      drawZoneFloors(ctx, canvasW, canvasH, layout);
      drawHallways(ctx, canvasW, canvasH, layout);
      drawConferenceRoom(ctx, roomLabels.meetingRoom ?? roomLabels.conference);
      drawBossOffice(ctx, officeName ? `${officeName} Office` : (bossLabel ?? roomLabels.boss));
      drawKitchen(ctx, roomLabels.kitchen);
      for (let row = 0; row < layout.cubicleRows; row++) {
        for (let col = 0; col < layout.cubicleCols; col++) {
          const deskIndex = row * layout.cubicleCols + col;
          const agent = agents.find((a) => !a.isBoss && a.deskIndex === deskIndex);
          if (agent) {
            const state = statesRef.current.get(agent.id);
            drawCubicle(ctx, layout, row, col, agent.name, state?.status ?? "idle", agent.deskItem);
          }
        }
      }
      drawLounge(ctx, roomLabels.lounge, roomLabels.whiteboard);
      drawGymAndBathroom(ctx, roomLabels.gym, roomLabels.bathroom);

      const withState = agents.map((config) => ({
        config,
        state: statesRef.current.get(config.id) ?? initialAgentState(config, layout),
      }));
      withState.sort((a, b) => a.state.y - b.state.y);
      withState.forEach(({ config, state }, idx) =>
        drawCharacter(ctx, config, state, idx % 6)
      );
    };

    loop();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [mounted, pixelSpritesReady, agents, statuses, currentTasks, cubicleCount, canvasW, canvasH, officeName, bossLabel, roomLabels]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 1400, h: 900 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setViewportSize((prev) => (prev.w !== w || prev.h !== h ? { w, h } : prev));
    });
    ro.observe(el);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) setViewportSize({ w, h });
    return () => ro.disconnect();
  }, []);

  const viewportW = viewportSize.w;
  const viewportH = viewportSize.h;
  const maxPanX = Math.max(0, canvasW - viewportW);
  const maxPanY = Math.max(0, canvasH - viewportH);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (viewportW >= canvasW && viewportH >= canvasH) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, startPanX: pan.x, startPanY: pan.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setPan({
      x: Math.max(0, Math.min(maxPanX, dragRef.current.startPanX - dx)),
      y: Math.max(0, Math.min(maxPanY, dragRef.current.startPanY - dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setIsDragging(false);
  };

  const canPan = viewportW < canvasW || viewportH < canvasH;

  if (agents.length === 0) {
    return (
      <div className="flex h-full w-full min-h-0 flex-1 items-center justify-center bg-black-100 text-muted-foreground">
        <p className="font-mono text-sm">No team data. Connect OpenClaw or check the bridge.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full w-full min-h-0 overflow-hidden border-0 border-border bg-black-100 select-none rounded-none"
      style={{
        cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        className="absolute"
        style={{
          width: canvasW,
          height: canvasH,
          transform: `translate(${-Math.min(pan.x, maxPanX)}px, ${-Math.min(pan.y, maxPanY)}px)`,
          willChange: canPan ? "transform" : undefined,
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          className="block"
          style={{ imageRendering: "pixelated", touchAction: "none" }}
        />
      </div>
      {canPan && (
        <p className="absolute bottom-2 left-2 font-mono text-[10px] text-muted-foreground/80 pointer-events-none">
          Drag to pan
        </p>
      )}
    </div>
  );
}
