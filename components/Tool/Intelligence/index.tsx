"use client";

import React from "react";
import { InteractApp } from "@OS/InteractApp";
import { useIntel } from "./provider/intelligenceProvider";
import { IntelligenceView } from "./IntelligenceView";

export function Intelligence() {
  const { appSchema } = useIntel();

  return (
    <InteractApp appSchema={appSchema} className="p-0">
      <IntelligenceView />
    </InteractApp>
  );
}

export default Intelligence;
