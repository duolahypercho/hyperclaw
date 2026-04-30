"use client";

import React from "react";
import { InteractApp } from "@OS/InteractApp";
import { useDocs } from "./provider/docsProvider";
import { DocViewer } from "./DocViewer";

export function Docs() {
  const { appSchema } = useDocs();

  return (
    <InteractApp appSchema={appSchema} className="p-0">
      <DocViewer />
    </InteractApp>
  );
}

export default Docs;
