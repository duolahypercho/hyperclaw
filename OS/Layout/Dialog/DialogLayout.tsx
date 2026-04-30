import React from "react";
import { Dialog } from ".";
import { DialogSchema } from "./DialogSchema";

interface DialogLayoutProps {
  dialogs: DialogSchema[];
}

export function DialogLayout({ dialogs }: DialogLayoutProps) {
  return (
    <>
      {dialogs.map((dialog) => (
        <Dialog key={dialog.id} {...dialog} />
      ))}
    </>
  );
}
