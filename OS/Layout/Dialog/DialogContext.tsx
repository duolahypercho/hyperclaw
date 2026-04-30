import React, { createContext, useContext, useState } from "react";
import { DialogSchema } from "./DialogSchema";

interface DialogState {
  open: boolean;
  data?: Record<string, any>;
}

export interface DialogContextType {
  dialogs: Record<string, DialogState>;
  openDialog: (id: string, data?: Record<string, any>) => void;
  closeDialog: (id: string) => void;
  isDialogOpen: (id: string) => boolean;
  getDialogData: (id: string) => Record<string, any> | undefined;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({
  children,
  dialogs: dialogSchemas,
}: {
  children: React.ReactNode;
  dialogs?: DialogSchema[];
}) {
  const [dialogs, setDialogs] = useState<Record<string, DialogState>>(
    dialogSchemas
      ? {
          ...dialogSchemas.reduce((acc, dialog) => {
            acc[dialog.id] = { open: false };
            return acc;
          }, {} as Record<string, DialogState>),
        }
      : {}
  );

  const openDialog = (id: string, data?: Record<string, any>) => {
    setDialogs((prev) => ({ ...prev, [id]: { open: true, data } }));
  };

  const closeDialog = (id: string) => {
    setDialogs((prev) => ({ ...prev, [id]: { open: false } }));
  };

  const isDialogOpen = (id: string) => {
    return dialogs[id]?.open || false;
  };

  const getDialogData = (id: string) => {
    return dialogs[id]?.data;
  };

  return (
    <DialogContext.Provider
      value={{
        dialogs,
        openDialog,
        closeDialog,
        isDialogOpen,
        getDialogData,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}
