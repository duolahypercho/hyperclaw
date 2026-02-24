import React, { ReactNode } from "react";
import { useDropdownSubMenu } from "./DropdownSubMenu";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

const SubMenuTrigger = ({ children }: { children: ReactNode }) => {
  return (
    <div className={`link nonselect`}>
      {children}
      <ChevronRightIcon className="ml-auto h-4 w-4" />
    </div>
  );
};

export default SubMenuTrigger;
