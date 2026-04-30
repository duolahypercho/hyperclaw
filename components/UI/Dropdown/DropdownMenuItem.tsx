import React, { ReactNode } from "react";
import { useDropdownMenu } from "./DropdownMenu";
import { cn } from "$/utils";

interface dropdownItemType {
  children: ReactNode;
  active: boolean;
  onClick?: React.MouseEventHandler<HTMLLIElement>;
  title?: string;
  className?: string;
}

const HyperchoDropdownMenuItem = (props: dropdownItemType) => {
  const { children, active, onClick, title, className } = props;
  const { showStatusDropdown, setShowStatusDropdown } = useDropdownMenu();
  return (
    <li
      className={cn(`link nonselect ${active && "linkActive"}`, className)}
      onClick={(e) => {
        setShowStatusDropdown(!showStatusDropdown);
        if (onClick) {
          onClick(e);
        }
      }}
      title={title}
    >
      {children}
    </li>
  );
};

export default HyperchoDropdownMenuItem;
