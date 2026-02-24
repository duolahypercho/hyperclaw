import React, { ReactNode } from "react";
import { useDropdownMenu } from "./DropdownMenu";
import { cn } from "$/utils";

const DropdownMenuContainer = ({
  children,
  classname,
}: {
  children: ReactNode;
  classname?: string;
}) => {
  const { showStatusDropdown, dropdownMenuRef, isRight } = useDropdownMenu();

  return (
    <div className="HyperchoDropdownContainer">
      <div
        className={cn(
          `HyperchoDropdownMenu ${
            showStatusDropdown && "HyperchoDropdownMenu_open"
          } HyperchoDropdownGrid ${isRight && "HyperchoDropdownMenu_right"}`,
          classname
        )}
        ref={dropdownMenuRef}
      >
        <div className="HyperchoDropdownLinks" key={"clear"} style={{ width: "100%", textDecoration: "none" }}>
            {children}
        </div>
      </div>
    </div>
  );
};

export default DropdownMenuContainer;
