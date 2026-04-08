"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useProjects } from "./provider/projectsProvider";

const EMOJI_OPTIONS = ["📁", "🚀", "⚡", "🧠", "🎯", "🔬", "💡", "🛠️", "🌐", "🤖", "🔥", "✨"];

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (projectId: string) => void;
}

export function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const { createProject } = useProjects();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const project = await createProject(name.trim(), description.trim(), emoji);
    setSaving(false);
    if (project) {
      onCreated?.(project.id);
      onOpenChange(false);
      setName("");
      setDescription("");
      setEmoji("📁");
    } else {
      setError("Failed to create project. Is the connector running?");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[420px] flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
              {emoji}
            </div>
            <div>
              <SheetTitle>New Project</SheetTitle>
              <SheetDescription className="mt-0.5">
                Group agents around a shared goal
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Emoji picker */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Icon</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                    emoji === e
                      ? "bg-primary/15 ring-1 ring-primary/60 scale-110"
                      : "bg-muted hover:bg-muted/80 hover:scale-105"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name" className="text-xs uppercase tracking-wider text-muted-foreground">
              Name
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleCreate()}
              placeholder="e.g. Q2 Marketing Push"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="project-desc" className="text-xs uppercase tracking-wider text-muted-foreground">
                Description
              </Label>
              <span className="text-xs text-muted-foreground/50">optional</span>
            </div>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this project about? What's the goal?"
              rows={4}
              className="resize-none"
            />
          </div>

          {error && (
            <p className="text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-border flex flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="flex-1"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Project
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
