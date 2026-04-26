"use client";

import React from "react";
import { InteractApp } from "@OS/InteractApp";
import { IntelligenceView } from "./IntelligenceView";
import { useIntel } from "./provider/intelligenceProvider";

export function Intelligence() {
  const { appSchema } = useIntel();
  // Sidebar lives inside IntelligenceView as a custom left rail — exclude OS-level sidebar
  const schema = { ...appSchema, sidebar: undefined };
  return (
    <InteractApp appSchema={schema} className="h-full w-full p-0 min-h-0 overflow-hidden">
      <IntelligenceView />
    </InteractApp>
  );
}

export default Intelligence;
