import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, Headphones, Waves, Play } from "lucide-react";
import { useMusicPlayer } from "../providers/musicProvider";
import { cn } from "@/lib/utils";

interface CustomFrequencyDropdownItemProps {
  type: "binaural" | "isochronic";
  className?: string;
  contentClassName?: string;
  parentDropdownOpen?: boolean;
}

const CustomFrequencyDropdownItem: React.FC<
  CustomFrequencyDropdownItemProps
> = ({ type, className, contentClassName, parentDropdownOpen = true }) => {
  const {
    audioState,
    updateCustomBinauralFrequencies,
    updateCustomIsochronicFrequencies,
    playCustomBinauralBeat,
    playCustomIsochronicTone,
  } = useMusicPlayer();

  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState({
    baseFrequency:
      type === "binaural"
        ? audioState.customFrequencies.binaural.baseFrequency
        : audioState.customFrequencies.isochronic.baseFrequency,
    beatFrequency:
      type === "binaural"
        ? audioState.customFrequencies.binaural.beatFrequency
        : audioState.customFrequencies.isochronic.beatFrequency,
    waveform:
      type === "isochronic"
        ? audioState.customFrequencies.isochronic.waveform
        : "sine",
  });

  const handleSave = () => {
    if (type === "binaural") {
      updateCustomBinauralFrequencies(
        localSettings.baseFrequency,
        localSettings.beatFrequency
      );
    } else {
      updateCustomIsochronicFrequencies(
        localSettings.baseFrequency,
        localSettings.beatFrequency,
        localSettings.waveform
      );
    }
    setIsOpen(false);
  };

  const handlePlay = () => {
    if (type === "binaural") {
      playCustomBinauralBeat();
    } else {
      playCustomIsochronicTone();
    }
    setIsOpen(false);
  };

  const isCurrentlyPlaying =
    audioState.audioType === type &&
    audioState.currentAudio?.id === `custom-${type}`;

  const currentSettings =
    type === "binaural"
      ? audioState.customFrequencies.binaural
      : audioState.customFrequencies.isochronic;

  // Close dialog when parent dropdown closes
  useEffect(() => {
    if (!parentDropdownOpen && isOpen) {
      setIsOpen(false);
    }
  }, [parentDropdownOpen, isOpen]);

  // Update DialogOverlay z-index when dialog opens and contentClassName is provided
  useEffect(() => {
    if (isOpen && contentClassName) {
      // Extract z-index from contentClassName (e.g., "z-[100000]" -> "100000")
      const zIndexMatch = contentClassName.match(/z-\[(\d+)\]/);
      if (zIndexMatch) {
        const zIndex = zIndexMatch[1];
        // Find all dialog overlays and update their z-index
        // This ensures the overlay appears above other elements
        const overlays = document.querySelectorAll(
          "[data-radix-dialog-overlay]"
        );
        overlays.forEach((overlay) => {
          (overlay as HTMLElement).style.zIndex = zIndex;
        });
      }
    }
  }, [isOpen, contentClassName]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div
          className={cn(
            "relative flex select-none items-center rounded-md px-3 py-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer text-foreground hover:bg-primary/5 active:bg-primary/10 active:scale-95 data-[state=checked]:bg-primary/30 hover:text-foreground text-xs font-medium",
            className
          )}
        >
          <Settings className="mr-2 h-3 w-3" />
          <div className="flex flex-col flex-1">
            <span className="font-medium">
              Custom {type === "binaural" ? "Binaural Beat" : "Isochronic Tone"}
            </span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className={cn("w-80", contentClassName)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "binaural" ? (
              <Headphones className="h-4 w-4" />
            ) : (
              <Waves className="h-4 w-4" />
            )}
            Custom {type === "binaural" ? "Binaural Beat" : "Isochronic Tone"}
            {isCurrentlyPlaying && (
              <div className="ml-auto w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="baseFrequency">Base Frequency (Hz)</Label>
              <Input
                id="baseFrequency"
                type="number"
                min="20"
                max="20000"
                step="1"
                value={localSettings.baseFrequency}
                onChange={(e) =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    baseFrequency: Number(e.target.value),
                  }))
                }
                placeholder="100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="beatFrequency">Beat Frequency (Hz)</Label>
              <Input
                id="beatFrequency"
                type="number"
                min="0.1"
                max="200"
                step="0.1"
                value={localSettings.beatFrequency}
                onChange={(e) =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    beatFrequency: Number(e.target.value),
                  }))
                }
                placeholder="8"
              />
            </div>

            {type === "isochronic" && (
              <div className="space-y-2">
                <Label htmlFor="waveform">Waveform</Label>
                <Select
                  value={localSettings.waveform}
                  onValueChange={(
                    value: "sine" | "square" | "sawtooth" | "triangle"
                  ) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      waveform: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={contentClassName}>
                    <SelectItem value="sine">Sine</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="sawtooth">Sawtooth</SelectItem>
                    <SelectItem value="triangle">Triangle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              className="flex-1"
            >
              Save
            </Button>
            <Button
              size="sm"
              onClick={handlePlay}
              className="flex-1"
              disabled={isCurrentlyPlaying}
            >
              <Play className="h-4 w-4 mr-1" />
              Play
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomFrequencyDropdownItem;
