import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { ChatError } from "@OS/AI/components/Chat";

// Simplified error display component
export const ErrorDisplay = ({
  error,
  onDismiss,
  onRetry,
}: {
  error: ChatError;
  onDismiss: () => void;
  onRetry?: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
  >
    <div className="flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-destructive font-medium">Error</p>
        <p className="text-xs text-destructive/80 mt-1">{error.message}</p>
        {error.operation && (
          <p className="text-xs text-muted-foreground mt-1">
            Operation: {error.operation}
          </p>
        )}
      </div>
      <div className="flex gap-1">
        {onRetry && (
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onRetry}
            className="text-destructive hover:text-destructive"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onDismiss}
          className="text-destructive hover:text-destructive"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  </motion.div>
);
