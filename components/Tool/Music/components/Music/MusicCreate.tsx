import React, { useState } from "react";
import { UploadForm } from "./UploadForm";

const MusicCreate = () => {
  return (
    <div className="block rounded-lg h-full">
      <div className="flex flex-col gap-4 justify-center items-center ">
        <div className="w-full max-w-full">
          <UploadForm />
        </div>
      </div>
    </div>
  );
};

export default MusicCreate;
