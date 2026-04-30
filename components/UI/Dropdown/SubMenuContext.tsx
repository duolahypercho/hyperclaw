import React, { ReactNode } from "react";
import { useDropdownSubMenu } from "./DropdownSubMenu";
import { cn } from "$/utils";

const SubMenuContext = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const { showStatusDropdown, isRight } = useDropdownSubMenu();
  return (
    <div
      className={cn(
        `HyperchoSubDropdownMenu ${
          showStatusDropdown && "HyperchoSubDropdownMenu_open"
        } ${
          isRight
            ? "HyperchoSubDropdownMenu_right"
            : "HyperchoSubDropdownMenu_left"
        } HyperchoDropdownGrid`,
        className
      )}
    >
      <div className="HyperchoDropdownLinks">
        <div key={"clear"} style={{ width: "100%", textDecoration: "none" }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SubMenuContext;
