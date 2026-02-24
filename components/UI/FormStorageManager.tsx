import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Database,
  Clock,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { FormPersistenceUtils } from "$/hooks/useFormPersistence";
import { useToast } from "@/components/ui/use-toast";

interface FormStorageManagerProps {
  className?: string;
  showDebugInfo?: boolean;
}

const FormStorageManager: React.FC<FormStorageManagerProps> = ({
  className,
  showDebugInfo = false,
}) => {
  const { toast } = useToast();
  const [storageData, setStorageData] = useState<any>({});
  const [storageSize, setStorageSize] = useState(0);
  const [formCount, setFormCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = () => {
    setIsRefreshing(true);
    const data = FormPersistenceUtils.getAllFormData();
    const size = FormPersistenceUtils.getStorageSize();
    const count = FormPersistenceUtils.getFormCount();

    setStorageData(data);
    setStorageSize(size);
    setFormCount(count);
    setIsRefreshing(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleClearAll = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all saved form data? This action cannot be undone."
      )
    ) {
      FormPersistenceUtils.clearAllFormData();
      refreshData();
      toast({
        title: "Cleared",
        description: "All form data has been cleared",
      });
    }
  };

  const handleClearOld = () => {
    FormPersistenceUtils.cleanupOldData();
    refreshData();
    toast({
      title: "Cleaned up",
      description: "Old form data has been removed",
    });
  };

  const handleExport = () => {
    const data = FormPersistenceUtils.exportFormData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hypercho-form-data-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Form data has been exported",
    });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const success = FormPersistenceUtils.importFormData(content);

      if (success) {
        refreshData();
        toast({
          title: "Imported",
          description: "Form data has been imported successfully",
        });
      } else {
        toast({
          title: "Import failed",
          description:
            "Failed to import form data. Please check the file format.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getTimeAgo = (timestamp: number): string => {
    const timeAgo = Date.now() - timestamp;
    const minutesAgo = Math.floor(timeAgo / 60000);
    const hoursAgo = Math.floor(timeAgo / 3600000);
    const daysAgo = Math.floor(timeAgo / 86400000);

    if (minutesAgo < 1) return "Just now";
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    if (hoursAgo < 24) return `${hoursAgo}h ago`;
    return `${daysAgo}d ago`;
  };

  const isOldData = (timestamp: number): boolean => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return timestamp < thirtyDaysAgo;
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Form Storage Manager
          </CardTitle>
          <CardDescription>
            Manage and monitor saved form data across the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Storage Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
              <div>
                <p className="text-sm font-medium">Total Forms</p>
                <p className="text-2xl font-semibold">{formCount}</p>
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
              <div>
                <p className="text-sm font-medium">Storage Size</p>
                <p className="text-2xl font-semibold">
                  {formatBytes(storageSize)}
                </p>
              </div>
              <Database className="w-8 h-8 text-muted-foreground" />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
              <div>
                <p className="text-sm font-medium">Last Updated</p>
                <p className="text-2xl font-semibold">
                  {formCount > 0 ? "Active" : "None"}
                </p>
              </div>
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>

            <Button variant="outline" size="sm" onClick={handleClearOld}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Old Data
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={formCount === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("import-file")?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              disabled={formCount === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>

          <input
            id="import-file"
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          {/* Form Data List */}
          {formCount > 0 && (
            <div className="space-y-4">
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-3">Saved Forms</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {Object.entries(storageData).map(
                    ([formId, formData]: [string, any]) => (
                      <div
                        key={formId}
                        className={`p-3 rounded-lg border ${
                          isOldData(formData.timestamp)
                            ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800"
                            : "bg-muted/20 border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {formId}
                              </span>
                              {isOldData(formData.timestamp) && (
                                <Badge variant="secondary" className="text-xs">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Old
                                </Badge>
                              )}
                              {formData.version && (
                                <Badge variant="outline" className="text-xs">
                                  v{formData.version}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Saved: {formatTimestamp(formData.timestamp)} (
                              {getTimeAgo(formData.timestamp)})
                            </p>
                            {showDebugInfo && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Data size:{" "}
                                {formatBytes(
                                  new Blob([JSON.stringify(formData.data)]).size
                                )}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              FormPersistenceUtils.clearAllFormData();
                              refreshData();
                              toast({
                                title: "Cleared",
                                description: `Form "${formId}" data has been cleared`,
                              });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {formCount === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No saved form data found</p>
              <p className="text-sm">
                Start filling out forms to see saved data here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FormStorageManager;
