import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOS } from "@OS/Provider/OSProv";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import { dashboardState } from "$/lib/dashboard-state";
import { useUser } from "$/Providers/UserProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import Userdropdown from "$/components/Navigation/Userdropdown";
import {
  ChevronsLeft,
  LayoutDashboard,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
import { LAYOUT_PRESETS, type LayoutPresetId } from "$/components/Home/index";
import { OPEN_AGENT_CHAT_EVENT, setPendingOpenAgent } from "$/components/Home/widgets/StatusWidget";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import { AgentGlyph, StatusDot, normalizeAgentState } from "$/components/ensemble/primitives";
import { useAgentStatus } from "$/components/ensemble/hooks";
import { normalizeRuntimeKind, type EnsembleAgent } from "$/components/ensemble/agents";
import { useConnectorStatus } from "$/hooks/useConnectorStatus";

export const NAV_COLLAPSED_W = 48;   // px
export const NAV_EXPANDED_W  = 220;  // px

/* ── Agent status ring — canonical primitive + live streaming overlay ─── */

/* ── Tooltip wrapper ─────────────────────────────────────── */

const NavTooltip: React.FC<{
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}> = ({ label, collapsed, children }) => {
  if (!collapsed) return <>{children}</>;
  return (
    <HyperchoTooltip value={label} side="right">
      {children as React.ReactElement}
    </HyperchoTooltip>
  );
};

/* ── Nav item types ──────────────────────────────────────── */

interface NavItemDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  onClick?: () => void;
  isActive?: boolean;
  kind?: "agent";
  /** Full glyph-compatible agent record — same shape Team/Chat render with. */
  glyphAgent?: Pick<EnsembleAgent, "id" | "kind" | "emoji" | "name"> & { real?: boolean };
  avatarData?: string;
  agentStatus?: string;
  isDisabled?: boolean;
}

interface NavSectionDef {
  id: string;
  title: string;
  items: NavItemDef[];
}

function NavItemButton({ item }: { item: NavItemDef }) {
  if (item.kind === "agent" && item.glyphAgent) {
    return <AgentNavItemButton item={item} />;
  }

  return (
    <button
      onClick={item.onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] rounded-md transition-colors text-left",
        item.isActive
          ? "text-foreground font-medium bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
      )}
    >
      <span className="w-[14px] h-[14px] flex items-center justify-center shrink-0 opacity-60">
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  );
}

function AgentNavItemButton({ item }: { item: NavItemDef }) {
  const { state } = useAgentStatus(item.id, { status: item.agentStatus });
  const isDisabled = item.isDisabled || state === "deleting";
  const isHiring = state === "hiring";
  if (!item.glyphAgent) return null;

  return (
    <button
      onClick={() => {
        if (isDisabled) return;
        item.onClick?.();
      }}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      title={isDisabled ? "Agent is firing - chat is locked" : isHiring ? "Agent is still hiring - opens profile page" : undefined}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] rounded-md transition-colors text-left",
        isDisabled
          ? "text-muted-foreground/40 cursor-not-allowed opacity-70"
          : item.isActive
          ? "text-foreground font-medium bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
      )}
    >
      <span className="relative shrink-0 inline-flex w-[20px] h-[20px]">
        <AgentGlyph agent={item.glyphAgent} size={20} avatar={item.avatarData} />
        <StatusDot state={state} size="sm" corner ringClassName="bg-secondary" />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {isDisabled && (
        <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none">
          Firing
        </span>
      )}
      {isHiring && !isDisabled && (
        <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none">
          Hiring
        </span>
      )}
    </button>
  );
}

/* ── Layout preset switcher (exported for use in header) ─── */

const LayoutPresetSwitcher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<LayoutPresetId>(() => {
    if (typeof window === "undefined") return "default";
    return (dashboardState.get("dashboard-active-preset") as LayoutPresetId) || "default";
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setDropPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleApply = (presetId: LayoutPresetId) => {
    setActiveId(presetId);
    window.dispatchEvent(new CustomEvent("dashboard-preset-switch", { detail: { presetId } }));
    setOpen(false);
  };

  const activeName = LAYOUT_PRESETS.find((p) => p.id === activeId)?.name || "Default";

  const dropdown = open && dropPos ? createPortal(
    <AnimatePresence>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className="fixed w-[220px] rounded-lg border border-border bg-card shadow-xl"
        style={{ zIndex: 99999, top: dropPos.top, right: dropPos.right }}
      >
        <div className="px-3 py-2 border-b border-border/50">
          <div className="text-[11px] font-semibold text-foreground">Layouts</div>
          <div className="text-[9px] text-muted-foreground">Switch dashboard layout</div>
        </div>
        <div className="py-1">
          {LAYOUT_PRESETS.map((preset) => {
            const isActive = activeId === preset.id;
            return (
              <div
                key={preset.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
                  isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                onClick={() => handleApply(preset.id)}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {isActive && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium">{preset.name}</div>
                  <div className="text-[9px] text-muted-foreground">{preset.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center gap-1.5 h-8 pl-2 pr-1.5 rounded-md border text-[11px] transition-colors",
          open
            ? "border-primary bg-primary/5 text-foreground"
            : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-foreground/20"
        )}
      >
        <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[80px] truncate font-medium">{activeName}</span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {dropdown}
    </>
  );
};

export { LayoutPresetSwitcher };

/* ── Navbar ──────────────────────────────────────────────── */

const Navbar = () => {
  const Router = useRouter();
  const { tools, activeTool } = useOS();
  const { userInfo, membership } = useUser();
  const { agents } = useHyperclawContext();
  const { status: connectorStatus } = useConnectorStatus();
  const { pathname } = Router;

  const [expanded, setExpanded] = useState(false);

  const [activeChatAgentId, setActiveChatAgentId] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);

  const existingAgentsForDialog = useMemo(
    () => agents.map((a) => ({ id: a.id, name: a.name, runtime: a.runtime })),
    [agents]
  );

  // Broadcast expanded state for DesktopLayout padding
  useEffect(() => {
    dashboardState.set("nav-expanded", String(expanded));
    window.dispatchEvent(new CustomEvent("nav-expanded-change", { detail: { expanded } }));
  }, [expanded]);

  // Track which agent is active in chat
  useEffect(() => {
    const handler = (e: Event) => {
      const agentId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (agentId) setActiveChatAgentId(agentId);
    };
    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handler);
  }, []);

  // Clear highlight when leaving Chat
  useEffect(() => {
    if (pathname !== "/Tool/Chat") setActiveChatAgentId(null);
  }, [pathname]);

  const visibleTools = useMemo(() => tools.filter((tool) => !tool.hidden), [tools]);

  // Build the sidebar navigation schema from the same tools used by the icon rail.
  const navSections: NavSectionDef[] = useMemo(() => {
    // Sub-route → parent-tool aliasing. Lets a deep route (an agent profile,
    // mission-control canvas, template browser) keep its parent entry lit up
    // in the sidebar even though the visited path doesn't match the tool href.
    const PARENT_TOOL_ALIASES: Record<string, string> = {
      agent: "team",
      missioncontrol: "workflows",
      "workflows-templates": "workflows",
    };
    const aliasedActiveToolId = activeTool?.id
      ? PARENT_TOOL_ALIASES[activeTool.id] ?? activeTool.id
      : null;

    const toolNavItems = visibleTools.map((tool) => ({
      id: tool.id,
      label: tool.name,
      icon: tool.icon,
      onClick: tool.onClick,
      isActive:
        (tool.id === "home" && pathname === tool.href) ||
        activeTool?.id === tool.id ||
        aliasedActiveToolId === tool.id,
    }));

    return [
      {
        id: "overview",
        title: "Overview",
        items: toolNavItems.filter((item) => item.id === "home"),
      },
      {
        id: "workspace",
        title: "Workspace",
        items: toolNavItems.filter((item) => item.id !== "home"),
      },
      {
        id: "agents",
        title: `Agents · ${agents.length}`,
        items: agents.map((agent) => {
          const agentState = normalizeAgentState(agent.status);
          const isFiring = agentState === "deleting";
          const isHiring = agentState === "hiring";
          return {
            id: agent.id,
            label: agent.name,
            kind: "agent" as const,
            glyphAgent: {
              id: agent.id,
              name: agent.name,
              kind: normalizeRuntimeKind(agent.runtime),
              emoji: agent.emoji ?? "",
              real: true,
            },
            avatarData: agent.avatarData,
            agentStatus: agent.status,
            isDisabled: isFiring,
            onClick: () => {
              if (isFiring) return;
              const targetAgentId = agent.id;
              const targetRuntime = agent.runtime;
              if (isHiring) {
                Router.push(`/Tool/Agent/${targetAgentId}`);
                return;
              }
              const dispatchOpen = () =>
                window.dispatchEvent(
                  new CustomEvent(OPEN_AGENT_CHAT_EVENT, {
                    detail: { agentId: targetAgentId, runtime: targetRuntime },
                  })
                );

              if (pathname === "/Tool/Chat") {
                dispatchOpen();
                return;
              }

              // Store pending agent so EnsembleChat reads it on first mount
              setPendingOpenAgent(targetAgentId, targetRuntime);

              // Also dispatch after route settles (covers cached/keep-alive mount)
              let dispatched = false;
              const onComplete = () => {
                Router.events.off("routeChangeComplete", onComplete);
                if (!dispatched) {
                  dispatched = true;
                  // 200ms > VirtualRouter's 100ms loading-clear delay
                  setTimeout(dispatchOpen, 200);
                }
              };
              Router.events.on("routeChangeComplete", onComplete);
              // Safety fallback
              setTimeout(() => {
                if (!dispatched) { dispatched = true; dispatchOpen(); }
              }, 800);

              Router.push("/Tool/Chat");
            },
            isActive: activeChatAgentId === agent.id,
          };
        }),
      },
    ];
  }, [Router, activeTool, pathname, agents, activeChatAgentId, visibleTools]);

  const planLabel = membership?.isFreePlan === false ? "Pro" : "Free";

  return (
    <motion.div
      className="fixed left-0 top-8 bottom-0 z-50 border-r border-l-0 border-t-0 border-b-0 border-solid border-border bg-secondary backdrop-blur-xl cursor-default overflow-hidden"
      animate={{ width: expanded ? NAV_EXPANDED_W : NAV_COLLAPSED_W }}
      initial={false}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
    >
      {expanded ? (
        /* ── EXPANDED: ensemble sidebar ─────────────────────── */
        <div className="absolute inset-0 flex flex-col">
            {/* Logo header */}
            <div className="shrink-0 flex items-center gap-2 h-12 px-3 border-b border-border border-solid border-t-0 border-l-0 border-r-0">
              <HyperchoIcon className="h-6 w-6 shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground truncate" style={{ letterSpacing: "-0.015em" }}>Hypercho</span>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors shrink-0"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Scrollable nav sections */}
            <div className="flex-1 overflow-y-auto customScrollbar2 py-1 min-h-0 px-2">
              {navSections.map((section) => (
                <div key={section.id} className="mb-0.5">
                  {/* Section label */}
                  <div className="flex items-center justify-between px-3 pt-3.5 pb-0.5 select-none">
                    <span className="font-mono uppercase text-[9.5px] text-muted-foreground/55" style={{ letterSpacing: "0.08em" }}>
                      {section.title}
                    </span>
                    {section.id === "agents" && (
                      <button
                        onClick={() => setShowAddAgent(true)}
                        className="text-muted-foreground/50 hover:text-foreground transition-colors rounded p-0.5 hover:bg-primary/5"
                        title="Hire agent"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
             

                  {/* Section items */}
                  {section.items.map((item) => (
                    <NavItemButton key={item.id} item={item} />
                  ))}
                </div>
              ))}
            </div>

            {/* User footer */}
            <div className="shrink-0 px-3 py-3 border-t border-border flex items-center gap-2.5">
              <Userdropdown connectorStatus={connectorStatus} />
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] font-medium text-foreground truncate leading-tight">
                  {userInfo.username || userInfo.Firstname || "User"}
                </span>
                <span className="text-[10px] text-muted-foreground truncate leading-tight">
                  {planLabel}
                </span>
              </div>
            </div>
        </div>
      ) : (
        /* ── COLLAPSED: icon rail ──────────────────────────── */
        <div className="absolute inset-0 flex flex-col justify-start">
          {/* Top: logo (expand) + home + tool icons */}
          <NavTooltip label="Expand sidebar" collapsed={true}>
            <Button
              data-guidance="navbar-home"
              onClick={() => setExpanded(true)}
              variant="ghost"
              className="w-full h-12 transition-all duration-200 group rounded-none hover:bg-transparent justify-center border-solid border-border border-b border-l-0 border-t-0 border-r-0"
            >
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <HyperchoIcon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
              </div>
            </Button>
            </NavTooltip>
          <div className="flex flex-col px-2 gap-1 w-full flex-1 mt-3" data-guidance="navbar-tools">
            {visibleTools.map((item) => {
              // Same parent-tool aliasing the expanded sidebar uses, so the
              // collapsed rail keeps the parent icon lit on deep sub-routes.
              const isActive =
                activeTool?.id === item.id ||
                (item.id === "team" && activeTool?.id === "agent") ||
                (item.id === "workflows" &&
                  (activeTool?.id === "missioncontrol" ||
                    activeTool?.id === "workflows-templates"));

              return (
                <div key={item.id} className="relative flex items-center w-full">
                  <NavTooltip label={item.name} collapsed={true}>
                    <Button
                      onClick={() => item.onClick?.()}
                      variant="ghost"
                      className={cn(
                        "h-fit px-2 py-2 rounded-md transition-all duration-200 w-full justify-center overflow-hidden",
                        isActive && "bg-primary/10 text-primary"
                      )}
                    >
                      <span className="w-4 h-4 flex items-center justify-center shrink-0">
                        {item.icon}
                      </span>
                    </Button>
                  </NavTooltip>
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute -left-2 w-1 h-8 bg-accent rounded-r-full pointer-events-none"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </div>
              );
            })}
          </div>

            {/* Bottom: user avatar */}
            <div className="flex flex-col items-center gap-1 p-1 pb-2" data-guidance="navbar-user">
              <Userdropdown connectorStatus={connectorStatus} />
            </div>
        </div>
      )}

      <AddAgentDialog
        open={showAddAgent}
        onOpenChange={setShowAddAgent}
        existingAgents={existingAgentsForDialog}
        onSuccess={(agentId) => Router.push(`/Tool/Agent/${agentId}`)}
      />
    </motion.div>
  );
};

export default Navbar;
