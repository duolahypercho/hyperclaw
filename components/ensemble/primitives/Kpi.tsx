"use client";

import React from "react";

interface KpiProps {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}

export function Kpi({ label, value, detail }: KpiProps) {
  return (
    <div className="ens-kpi">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {detail && <div className="d">{detail}</div>}
    </div>
  );
}
