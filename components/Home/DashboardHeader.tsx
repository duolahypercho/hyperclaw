import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Sparkles,
  Eye,
  EyeOff,
  RotateCcw,
  Grid3x3,
  LayoutGrid,
  Edit3,
  Lock,
  X,
  Plus,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { WidgetType } from "./Dashboard";

interface DashboardHeaderProps {
  visibleWidgets: string[];
  onToggleWidget: (widgetId: string) => void;
  onResetLayout: () => void;
  availableWidgets: Array<{
    id: string;
    type: WidgetType;
    title: string;
  }>;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onCancelEdit?: () => void;
  onAddChatWidget?: () => void; // Simple callback to add a new chat widget
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  visibleWidgets,
  onToggleWidget,
  onResetLayout,
  availableWidgets,
  isEditMode,
  onToggleEditMode,
  onCancelEdit,
  onAddChatWidget,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -48, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
        className="fixed top-0 left-0 right-0 z-[60] h-12 flex shrink-0 items-center gap-2 border-b border-t-0 border-border/50 border-solid border-l-0 border-r-0 bg-background/70 backdrop-blur-xl shadow-lg"
      >
        <div className="relative flex w-full h-full items-center px-3">
          {/* Center - Title or Edit Mode Text */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 font-medium text-muted-foreground text-sm">
            {isEditMode ? (
              <span>Drag and resize to customize</span>
            ) : (
              <span>Dashboard</span>
            )}
          </div>

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Customize Settings or Cancel Button */}
            {isEditMode && (
              <>
                <Button
                  variant="destructive"
                  onClick={onCancelEdit}
                  className="gap-2 text-xs h-fit"
                >
                  <X className="w-3 h-3" />
                  <span className="font-medium">Cancel</span>
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2 text-xs h-fit">
                      <Settings className="w-3 h-3" />
                      <span className="font-medium">Customize</span>
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-xl">
                        <Settings className="w-5 h-5 text-primary" />
                        Dashboard Settings
                      </DialogTitle>
                      <DialogDescription>
                        Customize your dashboard layout and visible widgets
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4 flex-1 overflow-y-auto customScrollbar2">
                      {/* Widget Visibility Section */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <LayoutGrid className="w-4 h-4 text-primary" />
                          <Label className="text-base font-semibold">
                            Visible Widgets
                          </Label>
                        </div>
                        <div className="space-y-3 pl-1">
                          {availableWidgets.map((widget) => {
                            const isVisible = visibleWidgets.includes(
                              widget.id
                            );
                            return (
                              <div
                                key={widget.id}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-lg border",
                                  isVisible
                                    ? "bg-primary/5 border-primary/20"
                                    : "bg-muted/30 border-border/30"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  {isVisible ? (
                                    <Eye className="w-4 h-4 text-primary" />
                                  ) : (
                                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <Label
                                    htmlFor={`widget-${widget.id}`}
                                    className={cn(
                                      "text-sm font-medium cursor-pointer",
                                      isVisible
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {widget.title}
                                  </Label>
                                </div>
                                <Switch
                                  id={`widget-${widget.id}`}
                                  checked={isVisible}
                                  onCheckedChange={() =>
                                    onToggleWidget(widget.id)
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <Separator />

                      {/* Layout Actions Section */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Grid3x3 className="w-4 h-4 text-primary" />
                          <Label className="text-base font-semibold">
                            Layout
                          </Label>
                        </div>

                        <div className="space-y-3">
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={() => {
                              onResetLayout();
                              setOpen(false);
                            }}
                          >
                            <RotateCcw className="w-4 h-4" />
                            Reset to Default Layout
                          </Button>

                          <p className="text-xs text-muted-foreground px-1">
                            This will restore the original widget positions and
                            sizes
                          </p>
                        </div>
                      </div>

                      <Separator />

                      {/* Add Chat Widget Section - Simple one-click add */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-primary" />
                          <Label className="text-base font-semibold">
                            Add Chat Widget
                          </Label>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Add another AI Assistant chat widget. Each widget maintains its own conversation and settings.
                          </p>

                          <Button
                            variant="outline"
                            onClick={() => {
                              onAddChatWidget?.();
                              setOpen(false);
                            }}
                            className="w-full justify-start gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Add New Chat Widget
                          </Button>
                        </div>
                      </div>

                      <Separator />

                      {/* Tips Section */}
                      <div className="space-y-3 bg-primary/5 border border-primary/10 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <Label className="text-sm font-semibold">
                            Quick Tips
                          </Label>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-2 pl-1">
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>
                              Drag widgets by the grip icon to rearrange
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>
                              Resize widgets from the bottom-right corner
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>
                              Click maximize to focus on a single widget
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>Your layout is automatically saved</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {/* Edit Layout Toggle */}
            <Button
              variant={isEditMode ? "default" : "outline"}
              onClick={onToggleEditMode}
              className={cn(
                "gap-2 text-xs h-fit",
                isEditMode
                  ? "bg-primary text-primary-foreground"
                  : "border-primary/20 hover:border-primary/40 bg-background/50 hover:bg-primary/5"
              )}
            >
              {isEditMode ? (
                <>
                  <Lock className="w-3 h-3" />
                  <span className="font-medium">Lock Layout</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3 h-3" />
                  <span className="font-medium">Edit Layout</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
