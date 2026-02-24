import React, { useState, createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import RightContentLayout from "./RightContentLayout";
import { SiteHeader } from "./SiteHeader";
import Sidebar from "./Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import { DialogLayout } from "./Dialog/DialogLayout";
import { useInteractApp } from "@OS/Provider/InteractAppProv";

interface ToolLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const ToolLayout = ({ children, className }: ToolLayoutProps) => {
  const { appSchema, sidebar, bodyRef } = useInteractApp();

  // Check if sidebar has content (sections with items, or custom content like a dropdown)
  const hasSidebarContent = React.useMemo(() => {
    if (!appSchema.sidebar) return false;

    if (appSchema.sidebar.sections && appSchema.sidebar.sections.length > 0) {
      const hasContent = appSchema.sidebar.sections.some(
        (section) =>
          section.type === "custom" ||
          (section.items && section.items.length > 0)
      );
      if (hasContent) return true;
    }

    if (appSchema.sidebar.footer && appSchema.sidebar.footer.length > 0) {
      const hasItems = appSchema.sidebar.footer.some(
        (section) =>
          "items" in section && section.items && section.items.length > 0
      );
      if (hasItems) return true;
    }

    return false;
  }, [appSchema.sidebar]);

  return (
    <motion.div
      className={
        "flex-1 h-full relative flex flex-col p-0 bg-transparent max-h-screen"
      }
      initial={false}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        duration: 0.3,
      }}
    >
      <div className="flex-1 flex flex-col border border-solid border-primary/10 bg-secondary overflow-hidden relative">
        <SiteHeader />
        <div className="flex-1 flex flex-row w-full h-full overflow-hidden">
          <AnimatePresence>
            {hasSidebarContent && appSchema.sidebar && (
              <motion.div
                initial={{ width: 0, opacity: 0, x: -100 }}
                animate={{
                  width: sidebar ? "16rem" : 0,
                  opacity: sidebar ? 1 : 0,
                  x: sidebar ? 0 : -100,
                }}
                exit={{ width: 0, opacity: 0, x: -100 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                  duration: 0.3,
                }}
                className="h-full overflow-hidden"
              >
                <Sidebar schema={appSchema.sidebar} />
              </motion.div>
            )}
          </AnimatePresence>
          <div
            className={cn(
              "flex-1 h-full bg-background overflow-y-auto customScrollbar2 transition-all duration-150 ease-out",
              className
            )}
            ref={bodyRef}
            style={{
              // Prevent layout shift when detail panel appears
              transition: "margin-right 0.15s ease-out",
            }}
          >
            {children}
          </div>
          {appSchema.detail && (
            <RightContentLayout rightContent={appSchema.detail} />
          )}
        </div>
        {appSchema.dialogs && <DialogLayout dialogs={appSchema.dialogs} />}
      </div>
    </motion.div>
  );
};

export default ToolLayout;
