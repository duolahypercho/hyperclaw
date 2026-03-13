import React from "react";
import { Image, Headphones, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { InputAttachment } from "@OS/AI/components/Chat";

export const AttachmentPreview = ({
  attachment,
  onRemove,
  onClick,
}: {
  attachment: InputAttachment;
  onRemove: (id: string) => void;
  onClick?: () => void;
}) => {
  const getIcon = () => {
    switch (attachment.type) {
      case "image":
        return <Image className="w-3 h-3" />;
      case "mp3":
      case "wav":
        return <Headphones className="w-3 h-3" />;
      default:
        return <File className="w-3 h-3" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-1.5 bg-muted rounded-md border border-solid border-border relative max-w-[150px] hover:bg-muted/70",
        onClick && "cursor-pointer"
      )}
    >
      {attachment.uploading && (
        <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg z-10">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
      {(attachment.type === "image" || attachment.type.startsWith("image/")) && attachment.preview ? (
        <img
          src={attachment.preview}
          alt={attachment.name}
          className="w-10 h-10 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {getIcon()}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ellipsis overflow-hidden whitespace-nowrap">
          {attachment.name}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="p-0 h-fit w-fit"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(attachment.id);
        }}
      >
        <X className="w-3 h-3" />
      </Button>
    </motion.div>
  );
};
