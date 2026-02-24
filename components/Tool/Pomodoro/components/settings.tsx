import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { isEqual } from "lodash";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Settings, RotateCcw } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useMusicPlayer } from "$/components/Tool/Music/MusicPlayer/providers/musicProvider";
import { usePomodoro } from "../pomoProvider";
import { FOCUS, SHORT_BREAK, PomodoroSettings } from "../types";
import { ZSong } from "$/components/Tool/Music/Provider/types";

interface SettingsPanelContentProps {
  className?: string;
  handleResetSettings: () => void;
  settings: PomodoroSettings;
  session: string;
  isTimerRunning: boolean;
  handleSessionLengthChange: (sessionType: string, minutes: number) => void;
  updateSettings: (newSettings: Partial<PomodoroSettings>) => void;
  openNotificationSettings: () => void;
  showNotification: (title: string, body: string) => void;
}

// Custom comparison function using lodash deep equality
function arePropsEqual(
  prevProps: SettingsPanelContentProps,
  nextProps: SettingsPanelContentProps
) {
  return isEqual(prevProps, nextProps);
}

const SettingsPanelContent = memo(
  ({
    className,
    handleResetSettings,
    settings,
    session,
    isTimerRunning,
    handleSessionLengthChange,
    updateSettings,
    openNotificationSettings,
    showNotification,
  }: SettingsPanelContentProps) => {
    const isInline = className?.includes("relative");
    return (
      <div className={cn(!isInline && "absolute top-2 right-2", className)}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="h-6 w-6 p-0 hover:bg-muted/50"
            >
              <Settings className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 max-h-[400px] overflow-y-auto customScrollbar2"
            align="end"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-semibold leading-none text-sm">
                    Pomodoro Settings
                  </h4>
                  <p className="text-xs text-muted-foreground font-medium">
                    Customize your timer preferences
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="p-1.5 h-fit w-fit rounded-full transition-all duration-200"
                  onClick={handleResetSettings}
                  aria-label="Reset Settings"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Session Durations
                  </Label>

                  <div className="space-y-2">
                    {Object.entries(settings.sessionLengths).map(
                      ([sessionType, duration]) => (
                        <div
                          key={sessionType}
                          className="flex items-center justify-between"
                        >
                          <Label
                            htmlFor={`${sessionType}-duration`}
                            className="text-xs"
                          >
                            {sessionType} (minutes)
                          </Label>
                          <Input
                            id={`${sessionType}-duration`}
                            type="number"
                            min="1"
                            max={
                              sessionType === FOCUS
                                ? 120
                                : sessionType === SHORT_BREAK
                                ? 30
                                : 60
                            }
                            value={Math.floor((duration as number) / 60)}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 1;
                              const max =
                                sessionType === FOCUS
                                  ? 120
                                  : sessionType === SHORT_BREAK
                                  ? 30
                                  : 60;
                              handleSessionLengthChange(
                                sessionType,
                                Math.min(value, max)
                              );
                            }}
                            className="w-20 h-8 text-xs"
                          />
                        </div>
                      )
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Auto-start</Label>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-start-breaks" className="text-xs">
                      Auto-start breaks
                    </Label>
                    <Switch
                      id="auto-start-breaks"
                      checked={settings.autoStartBreaks}
                      onCheckedChange={(checked) =>
                        updateSettings({ autoStartBreaks: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-start-pomodoros" className="text-xs">
                      Auto-start pomodoros
                    </Label>
                    <Switch
                      id="auto-start-pomodoros"
                      checked={settings.autoStartPomodoros}
                      onCheckedChange={(checked) =>
                        updateSettings({ autoStartPomodoros: checked })
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Sound & Notifications
                  </Label>

                  {/* Alarm Volume Control */}
                  <div className="space-y-2">
                    <Label htmlFor="alarm-volume" className="text-xs">
                      Alarm Volume: {Math.round(settings.alarmVolume * 100)}%
                    </Label>
                    <Slider
                      id="alarm-volume"
                      min={0}
                      max={1}
                      step={0.1}
                      value={[settings.alarmVolume]}
                      onValueChange={(value) =>
                        updateSettings({ alarmVolume: value[0] })
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Notification Status:{" "}
                    {Notification.permission === "granted"
                      ? "✅ Allowed"
                      : Notification.permission === "denied"
                      ? "❌ Denied"
                      : "⏳ Not set"}
                  </div>

                  {["soundEnabled", "showNotifications"].map((setting) => (
                    <div
                      key={setting}
                      className="flex items-center justify-between"
                    >
                      <Label htmlFor={setting} className="text-xs">
                        {setting === "soundEnabled"
                          ? "Sound notifications"
                          : "Show notifications"}
                      </Label>
                      <Switch
                        id={setting}
                        checked={
                          settings[setting as keyof typeof settings] as boolean
                        }
                        onCheckedChange={(checked) =>
                          updateSettings({ [setting]: checked })
                        }
                      />
                    </div>
                  ))}

                  {Notification.permission === "default" && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => Notification.requestPermission()}
                    >
                      Enable Notifications
                    </Button>
                  )}

                  {Notification.permission === "denied" && (
                    <div className="space-y-2">
                      <div className="text-xs text-destructive">
                        Notifications are blocked. Please enable them in your
                        browser settings.
                      </div>
                      <Button
                        variant="outline"
                        className="h-fit w-fit p-1.5"
                        size="xs"
                        onClick={openNotificationSettings}
                      >
                        How to Enable Notifications
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        // Test alarm sound with current volume
                        const testAudio = new Audio("/sounds/alarm.mp3");
                        testAudio.volume = settings.alarmVolume;
                        testAudio.play().catch((error) => {
                          console.warn("Failed to play test alarm:", error);
                        });
                      }}
                    >
                      🔊 Test Alarm
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={Notification.permission !== "granted"}
                      onClick={() => {
                        if (
                          "Notification" in window &&
                          Notification.permission === "granted"
                        ) {
                          showNotification(
                            "Test Notification",
                            "This is a test notification from Pomodoro"
                          );
                        } else if (Notification.permission === "denied") {
                          openNotificationSettings();
                        }
                      }}
                    >
                      📱 Test Notification
                    </Button>
                  </div>
                </div>

              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
  arePropsEqual
);

SettingsPanelContent.displayName = "SettingsPanelContent";

export const SettingsPanel = ({ className = "" }: { className?: string }) => {
  const {
    settings,
    handleResetSettings,
    updateSettings,
    session,
    isTimerRunning,
    handleSessionLengthChange,
    openNotificationSettings,
    showNotification,
  } = usePomodoro();

  return (
    <SettingsPanelContent
      className={className}
      handleResetSettings={handleResetSettings}
      settings={settings}
      session={session}
      isTimerRunning={isTimerRunning}
      handleSessionLengthChange={handleSessionLengthChange}
      updateSettings={updateSettings}
      openNotificationSettings={openNotificationSettings}
      showNotification={showNotification}
    />
  );
};
