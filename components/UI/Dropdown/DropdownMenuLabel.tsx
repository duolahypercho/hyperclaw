import React, { ReactNode } from "react";
import { cn } from "$/utils";

const HyperchoDropdownMenuLabel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn(`DropdownMenuLabel`, className)}>
      <span>{children}</span>
    </div>
  );
};

export default HyperchoDropdownMenuLabel;
