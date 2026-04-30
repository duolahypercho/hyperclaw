
import { useState } from "react";
import { useInterim } from "../../../Providers/InterimProv";
import Sidebarelements from "./DocumentSidebarElement";

const DocumentSidebar = () => {
  //sidebar open and close state
  return (
    <>
      <div className={`documentsidebar translate-x-[-100%]`}>
        {/* main menu  */}
        <div className="main">
          <Sidebarelements />
        </div>
      </div>
    </>
  );
};

export default DocumentSidebar;
