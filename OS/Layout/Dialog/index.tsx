import { DialogSchema } from "./DialogSchema";
import { DialogConfirmation } from "./DialogConfirmation";
import { DialogForm } from "./DialogForm";
import { DialogAlert } from "./DialogAlert";

export function Dialog(schema: DialogSchema) {
  const { type } = schema;

  switch (type) {
    case "form":
      return <DialogForm {...schema} />;
    case "alert":
      return <DialogAlert {...schema} />;
    default:
      return <DialogConfirmation {...schema} />;
  }
}
