import React from "react";
import NoteEditor from "./component/NoteEditor";
import { InteractApp } from "@OS/InteractApp";
import { useNote } from "./provider/noteProvider";
export const Note = () => {
  const { appSchema } = useNote();

  return (
    <InteractApp appSchema={appSchema}>
      <NoteEditor />
    </InteractApp>
  );
};

export default Note;
