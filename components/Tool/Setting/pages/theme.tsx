import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Moon, Sun } from "lucide-react";
import { useOS } from "@OS/Provider/OSProv";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ThemeSettings = () => {
  const { updateOSSettings, osSettings } = useOS();
  
  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground flex items-center gap-2">
        Theme Settings
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Choose your preferred appearance mode.
      </p>
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-card rounded-lg p-4 border border-border shadow-sm transition-colors">
          <div>
            <div className="flex flex-row items-center gap-2">
              <Label htmlFor="theme-switch" className="text-base font-medium">
                Dark Mode
              </Label>
              {osSettings.theme === "dark" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Switch between light and dark appearance.
            </p>
          </div>
          <Select
            value={osSettings.theme}
            onValueChange={(value) =>
              updateOSSettings({ theme: value as "light" | "dark" })
            }
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Select a theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
};

export default ThemeSettings;
