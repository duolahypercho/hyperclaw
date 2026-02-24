import React from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Eye,
  Trash2,
  Upload,
  Undo2,
  Calendar,
  XCircle,
} from "lucide-react";
import { postStatus } from "../types";

type EditorStatusProps = {
  status: postStatus;
  loading?: boolean;
  onPublish?: () => void;
  onSchedule?: () => void;
  onRetry?: () => void;
  onView?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
};

const EditorStatus: React.FC<EditorStatusProps> = ({
  status,
  loading = false,
  onPublish,
  onSchedule,
  onRetry,
  onView,
  onRestore,
  onDelete,
}) => {
  switch (status) {
    case "draft":
      return (
        <div className="ml-auto flex gap-2">
          <Button
            variant="accent"
            className="h-8 text-xs"
            onClick={onPublish}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-3 w-3 mr-2" />
            )}
            Publish
          </Button>
          <Button
            variant="outline"
            className="h-8 text-xs"
            onClick={onSchedule}
            disabled={loading}
          >
            <Calendar className="h-3 w-3 mr-2" />
            Schedule
          </Button>
        </div>
      );
    case "scheduled":
      return (
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" className="h-8 text-xs" disabled>
            <Clock className="h-3 w-3 mr-2" /> Scheduled
          </Button>
        </div>
      );
    case "inprogress":
      return (
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" className="h-8 text-xs" disabled>
            <Loader2 className="h-3 w-3 animate-spin mr-2" /> Publishing...
          </Button>
        </div>
      );
    case "failed":
      return (
        <div className="ml-auto flex gap-2">
          <Button variant="destructive" className="h-8 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 mr-2" /> Retry
          </Button>
          <Button variant="outline" className="h-8 text-xs" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-2" /> Delete
          </Button>
        </div>
      );
    case "active":
      return (
        <div className="ml-auto flex gap-2">
          <Button variant="success" className="h-8 text-xs" onClick={onView}>
            <CheckCircle2 className="h-3 w-3 mr-2" /> View Live
          </Button>
        </div>
      );
    case "deleted":
      return (
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="h-8 text-xs" onClick={onRestore}>
            <Undo2 className="h-3 w-3 mr-2" /> Restore
          </Button>
        </div>
      );
    default:
      return (
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="h-8 text-xs" disabled>
            <XCircle className="h-3 w-3 mr-2" /> Unknown Status
          </Button>
        </div>
      );
  }
};

export default EditorStatus;
