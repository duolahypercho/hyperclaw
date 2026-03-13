import React, { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  Crown,
  User,
  Loader2,
  CheckCircle,
  Clock,
  Circle,
  Shield,
  Plus,
  Trash2,
  GripVertical,
  ImagePlus,
} from "lucide-react";
import { InteractApp } from "@OS/InteractApp";
import {
  useOrgChart,
  OrgNode,
  OrgTask,
  OrgDepartment,
} from "./provider/orgChartProvider";
import { AddAgentToOrgDialog } from "./AddAgentToOrgDialog";
import { cn } from "$/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AgentIdentity, useAgentIdentities, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";
import { syncToIdentityMd } from "$/lib/identity-md";
import {
  useAgentIdentityEditor,
  EMOJI_OPTIONS,
} from "$/hooks/useAgentIdentityEditor";

// ─── Node type icon helper ────────────────────────────────────────────────────

function NodeIcon({ type, className }: { type: OrgNode["type"]; className?: string }) {
  if (type === "orchestrator") return <Crown className={cn("h-4 w-4", className)} />;
  if (type === "lead") return <Shield className={cn("h-4 w-4", className)} />;
  return <User className={cn("h-4 w-4", className)} />;
}

function nodeIconBg(type: OrgNode["type"]) {
  if (type === "orchestrator") return "bg-amber-500/15 text-amber-500";
  if (type === "lead") return "bg-violet-500/15 text-violet-500";
  return "bg-primary/10 text-primary";
}

/** Renders agent avatar from identity, falling back to type-based icon. */
function AgentAvatar({
  identity,
  type,
  size = "sm",
}: {
  identity?: AgentIdentity;
  type: OrgNode["type"];
  size?: "sm" | "lg";
}) {
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const iconSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const avatarSize = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const textSize = size === "lg" ? "text-xs" : "text-[10px]";

  if (avatarUrl) {
    return (
      <Avatar className={cn(avatarSize, "shrink-0")}>
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className={cn(textSize, "bg-primary/10")}>
          {identity?.emoji || avatarText || <NodeIcon type={type} className={iconSize} />}
        </AvatarFallback>
      </Avatar>
    );
  }

  if (identity?.emoji) {
    return <span className={cn("shrink-0", size === "lg" ? "text-lg" : "text-sm")}>{identity.emoji}</span>;
  }

  return <NodeIcon type={type} className={iconSize} />;
}

// ─── Small node card used inside department sections ─────────────────────────

function AgentCard({
  node,
  tasks,
  isSelected,
  onSelect,
  accentColor,
  identity,
}: {
  node: OrgNode;
  tasks: OrgTask[];
  isSelected: boolean;
  onSelect: () => void;
  accentColor?: string;
  identity?: AgentIdentity;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const draggable = node.type !== "orchestrator";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015 }}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e: any) => {
              e.dataTransfer.setData("text/plain", node.id);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onClick={onSelect}
      className={cn(
        "relative cursor-pointer rounded-xl border p-3 transition-all",
        "bg-card hover:shadow-md",
        draggable && "cursor-grab active:cursor-grabbing",
        isSelected
          ? "border-primary shadow-sm ring-1 ring-primary/30"
          : "border-border/50 hover:border-border"
      )}
    >
      {/* Accent stripe on the left when selected */}
      {isSelected && accentColor && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      )}

      <div className="flex items-center gap-2.5">
        {/* Drag handle in edit mode */}
        {draggable && (
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        )}

        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            nodeIconBg(node.type)
          )}
        >
          <AgentAvatar identity={identity} type={node.type} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-foreground truncate">
              {identity?.name || node.name}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{node.role}</p>
        </div>

        {activeTasks.length > 0 && (
          <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 leading-none">
            {activeTasks.length}
          </span>
        )}
      </div>

      {activeTasks.length > 0 && (
        <div className="mt-2 space-y-1 pl-[42px]">
          {activeTasks.slice(0, 2).map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              {task.status === "in-progress" ? (
                <Circle className="h-2.5 w-2.5 shrink-0 text-blue-400 fill-blue-400/30" />
              ) : (
                <Clock className="h-2.5 w-2.5 shrink-0" />
              )}
              <span className="truncate">{task.title}</span>
            </div>
          ))}
          {activeTasks.length > 2 && (
            <p className="text-[10px] text-muted-foreground/50">
              +{activeTasks.length - 2} more
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Orchestrator node (top-center, larger) ───────────────────────────────────

function OrchestratorCard({
  node,
  tasks,
  isSelected,
  onSelect,
  identity,
}: {
  node: OrgNode;
  tasks: OrgTask[];
  isSelected: boolean;
  onSelect: () => void;
  identity?: AgentIdentity;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "done");

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={onSelect}
      className={cn(
        "relative cursor-pointer rounded-2xl border px-6 py-4 transition-all min-w-[220px]",
        "bg-card hover:shadow-xl",
        isSelected
          ? "border-amber-400/60 shadow-lg ring-2 ring-amber-400/20"
          : "border-amber-400/30 hover:border-amber-400/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <AgentAvatar identity={identity} type={node.type} size="lg" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-foreground truncate">
              {identity?.name || node.name}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{node.role}</p>
        </div>
      </div>

      {activeTasks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activeTasks.slice(0, 3).map((task) => (
            <span
              key={task.id}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground max-w-[160px]"
            >
              {task.status === "in-progress" ? (
                <Circle className="h-2.5 w-2.5 shrink-0 text-blue-400 fill-blue-400/30" />
              ) : (
                <Clock className="h-2.5 w-2.5 shrink-0" />
              )}
              <span className="truncate">{task.title}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Department card ──────────────────────────────────────────────────────────

function DepartmentCard({
  department,
  nodes,
  allTasks,
  selectedNodeId,
  onSelectNode,
  onDrop,
  onRemove,
  identities,
}: {
  department: OrgDepartment;
  nodes: OrgNode[];
  allTasks: OrgTask[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onDrop?: (nodeId: string) => void;
  onRemove?: () => void;
  identities: Map<string, AgentIdentity>;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const leads = nodes.filter((n) => n.type === "lead");
  const specialists = nodes.filter((n) => n.type !== "lead");

  const totalActive = allTasks.filter(
    (t) => nodes.some((n) => n.id === t.assignedTo) && t.status !== "done"
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      onDragOver={(e: any) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e: any) => {
        e.preventDefault();
        setIsDragOver(false);
        const nodeId = e.dataTransfer.getData("text/plain");
        if (nodeId && onDrop) onDrop(nodeId);
      }}
      className={cn(
        "flex-1 min-w-[260px] max-w-[400px] rounded-2xl border bg-muted/20 overflow-hidden transition-all",
        isDragOver
          ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20 scale-[1.01]"
          : "border-border/50"
      )}
    >
      {/* Colored top border accent */}
      <div className="h-1 w-full" style={{ backgroundColor: department.color }} />

      {/* Department header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: department.color }}
          />
          <span className="text-sm font-semibold text-foreground">
            {department.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalActive > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {totalActive} task{totalActive !== 1 ? "s" : ""}
            </span>
          )}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remove department"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2">
        {/* Lead nodes */}
        {leads.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">
              {leads.length === 1 ? "Lead" : "Leads"}
            </p>
            <div className="space-y-1.5">
              {leads.map((lead) => (
                <AgentCard
                  key={lead.id}
                  node={lead}
                  tasks={allTasks.filter((t) => t.assignedTo === lead.id)}
                  isSelected={selectedNodeId === lead.id}
                  onSelect={() => onSelectNode(lead.id)}
                  accentColor={department.color}

                  identity={identities.get(lead.agentId)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Specialists grid */}
        {specialists.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">
              Team
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {specialists.map((node) => (
                <AgentCard
                  key={node.id}
                  node={node}
                  tasks={allTasks.filter((t) => t.assignedTo === node.id)}
                  isSelected={selectedNodeId === node.id}
                  onSelect={() => onSelectNode(node.id)}
                  accentColor={department.color}

                  identity={identities.get(node.agentId)}
                />
              ))}
            </div>
          </div>
        )}

        {nodes.length === 0 && (
          <p className="text-xs text-muted-foreground/50 italic px-1 py-4 text-center">
            Drop agents here
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Add Department card ──────────────────────────────────────────────────────

const COLOR_SWATCHES = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

function AddDepartmentCard({
  onAdd,
}: {
  onAdd: (dept: OrgDepartment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  const handleAdd = () => {
    if (!name.trim()) return;
    const id = name.trim().toLowerCase().replace(/\s+/g, "-");
    onAdd({ id, name: name.trim(), color });
    setName("");
    setColor("#6366f1");
    setOpen(false);
  };

  if (!open) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => setOpen(true)}
        className={cn(
          "flex-1 min-w-[260px] max-w-[400px] rounded-2xl border-2 border-dashed",
          "border-border/40 hover:border-border/70",
          "flex items-center justify-center gap-2 p-8 cursor-pointer transition-colors",
          "text-muted-foreground hover:text-foreground"
        )}
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm font-medium">Add Department</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 min-w-[260px] max-w-[400px] rounded-2xl border border-border/50 bg-muted/20 p-4"
    >
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Department name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={cn(
            "w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground",
            "focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
          )}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Color
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full transition-all",
                  color === c
                    ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                    : "hover:scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setName("");
            }}
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Node detail panel ────────────────────────────────────────────────────────

function NodeDetailPanel({
  node,
  tasks,
  departments,
  onUpdateNode,
  identity,
}: {
  node: OrgNode;
  tasks: OrgTask[];
  departments: OrgDepartment[];
  onUpdateNode: (id: string, patch: Record<string, unknown>) => Promise<void>;
  identity?: AgentIdentity;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const completedTasks = tasks.filter((t) => t.status === "done");

  const ed = useAgentIdentityEditor(node.agentId, {
    identityName: identity?.name || node.name,
    identityEmoji: identity?.emoji,
    identityAvatarUrl: resolveAvatarUrl(identity?.avatar),
  });

  // Keep name/role in sync with OrgChart node data when switching nodes
  const [localName, setLocalName] = useState(identity?.name || node.name);
  const [localRole, setLocalRole] = useState(node.role);

  // Re-sync when loaded from IDENTITY.md
  const prevAgentId = React.useRef(node.agentId);
  if (prevAgentId.current !== node.agentId) {
    prevAgentId.current = node.agentId;
    setLocalName(identity?.name || node.name);
    setLocalRole(node.role);
  }
  // Also sync once loading finishes
  React.useEffect(() => {
    if (!ed.loading) {
      setLocalName(ed.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed.loading, node.agentId]);

  /* ── Auto-save-on-blur handlers ── */
  const handleNameBlur = () => {
    const origName = identity?.name || node.name;
    if (localName !== origName) {
      onUpdateNode(node.id, { name: localName });
    }
  };

  const handleRoleBlur = () => {
    if (localRole !== node.role) {
      onUpdateNode(node.id, { role: localRole });
    }
  };

  const handleDescBlur = useCallback(() => {
    syncToIdentityMd(node.agentId, { description: ed.description }).catch(() => {});
  }, [node.agentId, ed.description]);

  const handleEmojiChange = useCallback(
    (emoji: string) => {
      ed.setEmoji(emoji);
      ed.patchCacheNow({ emoji });
      ed.saveFieldNow("Emoji", emoji);
    },
    [ed],
  );

  const handleAvatarBlur = useCallback(() => {
    const value = ed.avatarPreview || ed.avatarPath;
    ed.patchCacheNow({ avatar: value });
    ed.saveFieldNow("Avatar", value);
  }, [ed]);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Delegate the validated file read to the shared handler
      // but intercept onload to also do immediate save
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > 512_000) {
        alert("Image must be under 500KB. Please resize or compress it first.");
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUri = reader.result as string;
        ed.setAvatarPreview(dataUri);
        ed.patchCacheNow({ avatar: dataUri });
        // Save to workspace file, then update IDENTITY.md with filename
        const { saveAvatarImage } = await import("$/lib/identity-md");
        const savedName = await saveAvatarImage(node.agentId, dataUri);
        if (savedName) {
          ed.setAvatarPath(savedName);
          ed.saveFieldNow("Avatar", savedName);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [node.agentId, ed],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      ed.saveModelNow(value);
    },
    [ed],
  );

  const handleDeptChange = (deptId: string) => {
    onUpdateNode(node.id, { department: deptId || undefined });
  };

  const handleTypeChange = (type: string) => {
    onUpdateNode(node.id, { type });
  };

  const currentDept = departments.find((d) => d.id === node.department);

  return (
    <motion.div
      key={node.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="border-l border-border/50 flex flex-col overflow-hidden bg-muted/5"
    >
      {currentDept && (
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: currentDept.color }} />
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {/* Node header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
              nodeIconBg(node.type)
            )}
          >
            <AgentAvatar
              identity={{
                ...identity,
                agentId: node.agentId,
                emoji: ed.emoji,
                avatar: ed.avatarPreview || ed.avatarPath || identity?.avatar,
              }}
              type={node.type}
              size="lg"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold truncate">{localName}</h3>
            <p className="text-xs text-muted-foreground truncate">{localRole}</p>
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-1 text-xs mb-5">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Agent ID</span>
            <span className="font-mono text-foreground text-[11px] truncate ml-2">
              {node.agentId}
            </span>
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-3 mb-5">
          {/* ── Avatar ─────────────────── */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
              Avatar
            </label>
            <div className="flex items-start gap-3 mb-2">
              <div className="relative group shrink-0">
                <Avatar className="h-12 w-12">
                  {ed.displayAvatarSrc && (
                    <AvatarImage src={ed.displayAvatarSrc} alt={localName} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {ed.emoji || "🤖"}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => ed.fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ImagePlus className="h-4 w-4 text-white" />
                </button>
                <input
                  ref={ed.fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <Input
                  value={ed.avatarPreview ? "(uploaded image)" : ed.avatarPath}
                  onChange={(e) => {
                    ed.setAvatarPath(e.target.value);
                    ed.setAvatarPreview(null);
                  }}
                  onBlur={handleAvatarBlur}
                  disabled={!!ed.avatarPreview}
                  placeholder="Image URL or filename"
                  className="h-7 text-xs"
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => ed.fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-3 w-3" />
                    Upload
                  </Button>
                  {ed.avatarPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-muted-foreground px-2"
                      onClick={() => {
                        ed.setAvatarPreview(null);
                        ed.patchCacheNow({ avatar: ed.avatarPath || undefined });
                        ed.saveFieldNow("Avatar", ed.avatarPath);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {/* Emoji picker */}
            <div className="flex flex-wrap gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => handleEmojiChange(e)}
                  className={cn(
                    "text-base p-1 rounded-md hover:bg-primary/10 transition-colors",
                    ed.emoji === e && "bg-primary/15 ring-1 ring-primary/50"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
              Name
            </label>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Agent name"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
              Role
            </label>
            <Input
              value={localRole}
              onChange={(e) => setLocalRole(e.target.value)}
              onBlur={handleRoleBlur}
              placeholder="e.g., CEO"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
              Description
            </label>
            <Textarea
              value={ed.description}
              onChange={(e) => ed.setDescription(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
                }
              }}
              onBlur={handleDescBlur}
              disabled={ed.loading}
              placeholder={!ed.loading ? "Agent description (saved to IDENTITY.md)" : "Loading..."}
              className="min-h-[60px] max-h-[300px] resize-y overflow-auto text-xs"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
              Model
            </label>
            <Select
              value={ed.model || "__default__"}
              onValueChange={handleModelChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Use OpenClaw default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">-- Use Default --</SelectItem>
                {ed.availableModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {node.type !== "orchestrator" && (
            <>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Type
                </label>
                <Select
                  value={node.type}
                  onValueChange={(v) => handleTypeChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="specialist">Specialist</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Department
                </label>
                <Select
                  value={node.department || "__none__"}
                  onValueChange={(v) => handleDeptChange(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="-- None --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {/* Active tasks */}
        {activeTasks.length > 0 && (
          <div className="mb-5">
            <h4 className="text-[10px] font-semibold text-foreground mb-2 uppercase tracking-wider">
              Active Tasks ({activeTasks.length})
            </h4>
            <div className="space-y-2">
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-2.5 rounded-lg border border-border/50 bg-card"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {task.status === "in-progress" ? (
                      <Circle className="h-3 w-3 text-blue-400 fill-blue-400/30 shrink-0" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate">{task.title}</span>
                  </div>
                  {task.description && (
                    <p className="text-[11px] text-muted-foreground ml-5 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Completed ({completedTasks.length})
            </h4>
            <div className="space-y-1.5">
              {completedTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground"
                >
                  <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="truncate line-through">{task.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground/50 italic">No tasks assigned</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main tree view ───────────────────────────────────────────────────────────

function OrgChartTree() {
  const {
    activeData,
    selectedNodeId,
    setSelectedNodeId,
    updateNode,
    moveNodeToDepartment,
    addDepartment,
    removeDepartment,
    addAgentOpen,
    setAddAgentOpen,
    refresh,
  } = useOrgChart();

  const [unassignedDragOver, setUnassignedDragOver] = useState(false);

  const allAgentIds = useMemo(
    () => (activeData?.nodes ?? []).map((n) => n.agentId).filter(Boolean),
    [activeData]
  );
  const identities = useAgentIdentities(allAgentIds);

  const orchestrator = useMemo(
    () => activeData?.nodes.find((n) => n.type === "orchestrator") ?? null,
    [activeData]
  );

  const departments = useMemo(() => activeData?.departments ?? [], [activeData]);

  const deptNodeMap = useMemo(() => {
    if (!activeData) return new Map<string, OrgNode[]>();
    const map = new Map<string, OrgNode[]>();
    for (const dept of departments) {
      const nodes = activeData.nodes.filter(
        (n) => n.department === dept.id && n.type !== "orchestrator"
      );
      nodes.sort((a, b) => {
        if (a.type === "lead" && b.type !== "lead") return -1;
        if (b.type === "lead" && a.type !== "lead") return 1;
        return 0;
      });
      map.set(dept.id, nodes);
    }
    return map;
  }, [activeData, departments]);

  const undepartmentedNodes = useMemo(() => {
    if (!activeData) return [];
    return activeData.nodes.filter(
      (n) => n.type !== "orchestrator" && !n.department
    );
  }, [activeData]);

  const selectedNode = useMemo(
    () => activeData?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [activeData, selectedNodeId]
  );

  const selectedTasks = useMemo(
    () =>
      selectedNodeId
        ? (activeData?.tasks ?? []).filter((t) => t.assignedTo === selectedNodeId)
        : [],
    [activeData, selectedNodeId]
  );

  if (!activeData || !orchestrator) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Network className="h-12 w-12 opacity-30" />
      </div>
    );
  }

  const allTasks = activeData.tasks ?? [];

  return (
    <div className="flex h-full min-h-0">
      {/* Scrollable chart area */}
      <div className="flex-1 overflow-auto p-8">
        <div className="flex flex-col items-center gap-0 min-w-fit">
          {/* Orchestrator at top center */}
          <OrchestratorCard
            node={orchestrator}
            tasks={allTasks.filter((t) => t.assignedTo === orchestrator.id)}
            isSelected={selectedNodeId === orchestrator.id}
            onSelect={() => setSelectedNodeId(orchestrator.id)}
            identity={identities.get(orchestrator.agentId)}
          />

          {/* Connector line */}
          {(departments.length > 0 || undepartmentedNodes.length > 0) && (
            <div className="w-px h-8 bg-border/60 shrink-0" />
          )}

          {/* Department cards */}
          {departments.length > 0 && (
            <div className="flex flex-wrap gap-4 justify-center">
              {departments.map((dept) => {
                const deptNodes = deptNodeMap.get(dept.id) ?? [];
                return (
                  <DepartmentCard
                    key={dept.id}
                    department={dept}
                    nodes={deptNodes}
                    allTasks={allTasks}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}

                    onDrop={(nodeId) => moveNodeToDepartment(nodeId, dept.id)}
                    onRemove={() => removeDepartment(dept.id)}
                    identities={identities}
                  />
                );
              })}
              <AddDepartmentCard onAdd={addDepartment} />
            </div>
          )}

          {/* Unassigned section */}
          <div
            className={cn(
              "mt-6 flex flex-col items-center gap-2 w-full max-w-[900px] rounded-2xl p-4 transition-all border-2 border-dashed",
              unassignedDragOver
                ? "border-primary/60 bg-primary/5"
                : "border-border/30"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setUnassignedDragOver(true);
            }}
            onDragLeave={() => setUnassignedDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUnassignedDragOver(false);
              const nodeId = e.dataTransfer.getData("text/plain");
              if (nodeId) moveNodeToDepartment(nodeId, null);
            }}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">
              Unassigned
            </p>
            {undepartmentedNodes.length > 0 ? (
              <div className="flex flex-wrap gap-3 justify-center">
                {undepartmentedNodes.map((node) => (
                  <div key={node.id} className="w-[220px]">
                    <AgentCard
                      node={node}
                      tasks={allTasks.filter((t) => t.assignedTo === node.id)}
                      isSelected={selectedNodeId === node.id}
                      onSelect={() => setSelectedNodeId(node.id)}

                      identity={identities.get(node.agentId)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/40 italic py-2">
                Drop agents here to unassign
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={selectedNode.id}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="w-[300px] h-full">
              <NodeDetailPanel
                node={selectedNode}
                tasks={selectedTasks}
                departments={departments}
                onUpdateNode={updateNode}
                identity={identities.get(selectedNode.agentId)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Agent dialog */}
      <AddAgentToOrgDialog
        open={addAgentOpen}
        onOpenChange={setAddAgentOpen}
        departments={departments}
        onSuccess={() => refresh()}
      />
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function OrgChart() {
  const { appSchema, loading, error } = useOrgChart();

  if (error) {
    return (
      <InteractApp appSchema={appSchema} className="p-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full min-h-[200px] text-destructive"
        >
          <p className="text-sm font-medium">{error}</p>
        </motion.div>
      </InteractApp>
    );
  }

  if (loading) {
    return (
      <InteractApp appSchema={appSchema} className="p-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground"
        >
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm">Loading org chart...</p>
        </motion.div>
      </InteractApp>
    );
  }

  return (
    <InteractApp appSchema={appSchema} className="p-0">
      <OrgChartTree />
    </InteractApp>
  );
}

export default OrgChart;
