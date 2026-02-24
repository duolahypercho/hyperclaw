"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Library, Loader2 } from "lucide-react";
import { useHistory } from "../provider/HistoryProv";
import { formatDistanceToNow } from "date-fns";
import { usePromptLibrary } from "../provider/PromptProv";

// Helper function to get badge variant based on status
const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "active":
      return "default";
    case "draft":
      return "secondary";
    case "archived":
      return "outline";
    case "pending":
      return "destructive";
    default:
      return "secondary";
  }
};

// Helper function to get status display text
const getStatusDisplayText = (status: string) => {
  switch (status) {
    case "active":
      return "Active";
    case "draft":
      return "Draft";
    case "archived":
      return "Archived";
    case "pending":
      return "Pending";
    default:
      return status;
  }
};

export default function PromptLibrary() {
  const { history, loading, hasMore, ref } = useHistory();
  const { handlePromptChange } = usePromptLibrary();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="w-5 h-5" />
            Your Prompt Library
          </CardTitle>
          <CardDescription>
            Browse through your saved and optimized prompts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 && !loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Library className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Your saved prompts will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => (
                <Card
                  key={item._id}
                  className="hover:bg-primary/10 transition-all cursor-pointer active:scale-[98%]"
                  onClick={() => {
                    handlePromptChange(item._id);
                  }}
                >
                  <CardContent className="p-4 space-y-2 select-none">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">
                          {item.promptName || "Click to edit"}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.promptDescription}
                        </p>
                      </div>
                      <div className="ml-3 shrink-0 flex flex-col gap-1.5 items-end">
                        {/* Owner Badge */}
                        {item.owner && <Badge variant="success">Owner</Badge>}

                        {/* Status Badge */}
                        <Badge
                          variant={getStatusBadgeVariant(item.status)}
                          className="flex items-center gap-1.5 whitespace-nowrap"
                        >
                          {getStatusDisplayText(item.status)}
                          <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                          {formatDistanceToNow(new Date(item.updatedAt), {
                            addSuffix: true,
                          })}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Infinite scroll trigger */}
              {hasMore && <div ref={ref} className="h-4" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
