"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function TimeInput({
  value = "",
  onChange,
  className,
  placeholder = "Select time",
  disabled = false,
}: TimeInputProps) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [open, setOpen] = useState(false);

  // Update internal state when prop changes
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":");
      setHours(h);
      setMinutes(m);
    } else {
      setHours("");
      setMinutes("");
    }
  }, [value]);

  // Handle hour input change
  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHour = e.target.value.replace(/\D/g, "").slice(0, 2);
    setHours(newHour);
    if (newHour.length === 2 && minutes.length === 2) {
      onChange?.(`${newHour}:${minutes}`);
    }
  };

  // Handle minute input change
  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMinute = e.target.value.replace(/\D/g, "").slice(0, 2);
    setMinutes(newMinute);
    if (hours.length === 2 && newMinute.length === 2) {
      onChange?.(`${hours}:${newMinute}`);
    }
  };

  // Handle time selection from picker
  const handleTimeSelect = (selectedHours: number, selectedMinutes: number) => {
    const formattedHours = selectedHours.toString().padStart(2, "0");
    const formattedMinutes = selectedMinutes.toString().padStart(2, "0");
    setHours(formattedHours);
    setMinutes(formattedMinutes);
    onChange?.(`${formattedHours}:${formattedMinutes}`);
    setOpen(false);
  };

  return (
    <div className={cn("relative flex items-center gap-1", className)}>
      <div className="flex items-center gap-1">
        <Input
          type="text"
          value={hours}
          onChange={handleHourChange}
          placeholder="HH"
          className="w-full text-center"
          disabled={disabled}
          aria-label="Hours"
          maxLength={2}
        />
        <span className="text-muted-foreground">:</span>
        <Input
          type="text"
          value={minutes}
          onChange={handleMinuteChange}
          placeholder="MM"
          className="w-full text-center"
          disabled={disabled}
          aria-label="Minutes"
          maxLength={2}
        />
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 h-full rounded-l-none"
            disabled={disabled}
            aria-label="Open time picker"
          >
            <Clock className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <TimePicker
            onSelect={handleTimeSelect}
            currentTime={`${hours}:${minutes}`}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface TimePickerProps {
  onSelect: (hours: number, minutes: number) => void;
  currentTime?: string;
}

function TimePicker({ onSelect, currentTime = "" }: TimePickerProps) {
  // Parse current time if available
  const [currentHour, currentMinute] = currentTime
    ? currentTime.split(":").map(Number)
    : [new Date().getHours(), new Date().getMinutes()];

  const [selectedHour, setSelectedHour] = useState(currentHour);
  const [selectedMinute, setSelectedMinute] = useState(
    Math.floor(currentMinute / 5) * 5
  );

  // Generate hours (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Generate minutes (0, 5, 10, ..., 55)
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-primary-foreground">Hours</div>
        <div className="text-sm font-medium text-primary-foreground">
          Minutes
        </div>
      </div>
      <div className="flex gap-2">
        <div className="grid grid-cols-6 gap-1 max-h-[200px] overflow-y-auto">
          {hours.map((hour) => (
            <Button
              key={hour}
              variant={selectedHour === hour ? "default" : "outline"}
              size="sm"
              className="h-8 w-8"
              onClick={() => setSelectedHour(hour)}
            >
              {hour.toString().padStart(2, "0")}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {minutes.map((minute) => (
            <Button
              key={minute}
              variant={selectedMinute === minute ? "default" : "outline"}
              size="sm"
              className="h-8 w-8"
              onClick={() => setSelectedMinute(minute)}
            >
              {minute.toString().padStart(2, "0")}
            </Button>
          ))}
        </div>
      </div>
      <Button
        className="w-full mt-3"
        onClick={() => onSelect(selectedHour, selectedMinute)}
      >
        Select {selectedHour.toString().padStart(2, "0")}:
        {selectedMinute.toString().padStart(2, "0")}
      </Button>
    </div>
  );
}
