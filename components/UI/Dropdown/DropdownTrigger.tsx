import React, { ReactNode } from "react";
import { useDropdownMenu } from "./DropdownMenu";

const HyperchoDropdownTrigger = ({ children }: { children: ReactNode }) => {
  const {
    dropdownStatusRef,
    showStatusDropdown,
    setShowStatusDropdown,
    curStatus,
  } = useDropdownMenu();

  return (
    <div className="dropdownTriggerBox">
      <div className="hyperchoDropdownTrigger">
        {/*container to show dropdown container*/}
        <div className="hyperchoDropdownTriggerContainer">
          {/*button when click it will show dropdown box*/}
          <div
            className="hyperchoDropdownButton"
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HyperchoDropdownTrigger;
