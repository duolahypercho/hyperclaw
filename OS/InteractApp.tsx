import { AppSchema } from "@OS/Layout/types";
import {
  InteractAppProvider,
  useInteractApp,
} from "@OS/Provider/InteractAppProv";
import { DialogProvider } from "@OS/Layout/Dialog/DialogContext";
import ToolLayout from "@OS/Layout/index";
import { Loader2 } from "lucide-react";

export interface InteractAppProps {
  children: React.ReactNode;
  appSchema: AppSchema;
  className?: string;
}

const InteractAppContent = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { loading } = useInteractApp();

  // Show loading state if loading is active
  if (loading.isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-full w-full">
        <div className="flex items-center gap-3 mb-4">
          {loading.icon || (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          )}
          <h2 className="text-lg font-semibold text-foreground/80">
            {loading.message || "Loading..."}
          </h2>
        </div>
      </div>
    );
  }

  return <ToolLayout className={className}>{children}</ToolLayout>;
};

export const InteractApp = ({
  children,
  appSchema,
  className,
}: InteractAppProps) => {
  return (
    <DialogProvider dialogs={appSchema.dialogs}>
      <InteractAppProvider appSchema={appSchema}>
        <InteractAppContent className={className}>
          {children}
        </InteractAppContent>
      </InteractAppProvider>
    </DialogProvider>
  );
};

export default InteractApp;
