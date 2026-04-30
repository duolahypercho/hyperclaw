"use client";

import React from "react";

interface SectionProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flat?: boolean;
}

export function Section({ title, action, children, className = "", flat = false }: SectionProps) {
  return (
    <div className={`${flat ? "ens-card-flat" : "ens-card"} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <div className="ens-sh">{title}</div>}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
