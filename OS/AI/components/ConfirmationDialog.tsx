import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationDialogProps {
  args: any;
  respond?: (result: any) => void;
  status: string;
  result?: any;
  handler?: (result: any) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  rejectLabel?: string;
  onConfirm?: (args: any) => void;
  onReject?: string;
  showDetails?: boolean;
  customContent?: React.ReactNode;
}

export function ConfirmationDialog({
  args,
  respond,
  status,
  result,
  handler,
  title,
  description,
  confirmLabel = "Confirm",
  rejectLabel = "Cancel",
  onConfirm,
  onReject = "",
  showDetails = true,
  customContent,
}: ConfirmationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(
    new Set()
  );

  const paramCount = useMemo(() => Object.keys(args || {}).length, [args]);
  const shouldCollapse = paramCount > 0;

  const formatValue = (
    value: any,
    key: string,
    parentKey?: string
  ): React.ReactNode => {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;

    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }

    if (typeof value === "boolean") {
      return (
        <Badge variant={value ? "default" : "outline"}>
          {value ? "Yes" : "No"}
        </Badge>
      );
    }

    if (typeof value === "object") {
      const isExpanded = expandedObjects.has(fullKey);
      const isArray = Array.isArray(value);
      const itemCount = isArray ? value.length : Object.keys(value).length;
      const itemLabel = isArray ? "item" : "key";

      return (
        <div className="w-full">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedObjects((prev) => {
                const next = new Set(prev);
                if (isExpanded) {
                  next.delete(fullKey);
                } else {
                  next.add(fullKey);
                }
                return next;
              });
            }}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            </motion.div>
            <Badge variant="outline" className="text-xs">
              {isArray ? "Array" : "Object"} ({itemCount}{" "}
              {itemCount === 1 ? itemLabel : `${itemLabel}s`})
            </Badge>
          </div>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-2 ml-4 pl-3 border-l-2 border-primary/20 rounded-sm">
                  <div className="pt-2 space-y-2">
                    {isArray
                      ? value.map((item: any, index: number) => (
                          <div
                            key={index}
                            className="p-2 rounded-md border border-primary/10 bg-primary/5"
                          >
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              [{index}]
                            </div>
                            <div className="text-xs">
                              {formatValue(item, String(index), fullKey)}
                            </div>
                          </div>
                        ))
                      : Object.entries(value).map(
                          ([nestedKey, nestedValue]) => (
                            <div
                              key={nestedKey}
                              className="p-2 rounded-md border border-primary/10 bg-primary/5"
                            >
                              <div className="text-xs font-semibold capitalize text-foreground/90 mb-1">
                                {nestedKey}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatValue(nestedValue, nestedKey, fullKey)}
                              </div>
                            </div>
                          )
                        )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    const stringValue = String(value);
    const isLong = stringValue.length > 100;
    const isExpanded = expandedValues.has(fullKey);
    const displayValue =
      isLong && !isExpanded
        ? `${stringValue.substring(0, 100)}...`
        : stringValue;

    return (
      <div className="flex items-start gap-2">
        <span className="break-words text-xs">{displayValue}</span>
        {isLong && (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 px-1 text-xs shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedValues((prev) => {
                const next = new Set(prev);
                if (isExpanded) {
                  next.delete(fullKey);
                } else {
                  next.add(fullKey);
                }
                return next;
              });
            }}
          >
            {isExpanded ? "Less" : "More"}
          </Button>
        )}
      </div>
    );
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      if (onConfirm) {
        const result = await onConfirm(args);
        if (respond) {
          respond({
            action: "confirm",
            success: true,
            data: `Tool usage completed.\nOutput:\n${JSON.stringify(result)}`,
          });
        }
      } else if (respond) {
        respond({ action: "confirm", data: args });
      }
    } catch (error: any) {
      console.error(error);
      if (respond) {
        respond({ action: "confirm", success: false, error: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = () => {
    if (isLoading) return;

    let result = "The user denied this operation.";
    if (onReject) {
      result += ` ${onReject}`;
    }
    if (respond) {
      respond({ action: "reject", success: true, data: result });
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <Badge variant="secondary">{status}</Badge>
        </CardTitle>
        {description && (
          <CardDescription className="text-xs !mt-0">
            {description}
          </CardDescription>
        )}
      </CardHeader>

      {customContent ||
        (showDetails && (
          <CardContent className="p-0 mb-2">
            {shouldCollapse ? (
              <div className="w-full">
                <button
                  onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-sm"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {paramCount} {paramCount === 1 ? "parameter" : "parameters"}
                  </span>
                  <motion.div
                    animate={{ rotate: isDetailsOpen ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {isDetailsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.3,
                        ease: [0.4, 0, 0.2, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <ScrollArea className="max-h-[300px] px-3">
                        <div className="px-3 py-1.5 border-solid border-1 border-primary/10 rounded-md space-y-2.5 shadow-sm">
                          {Object.entries(args).map(([key, value], index) => (
                            <motion.div
                              key={key}
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{
                                duration: 0.2,
                                delay: index * 0.03,
                              }}
                              className="flex flex-col gap-1 py-1.5 border-solid border-b border-t-0 border-l-0 border-r-0 border-primary/10 last:border-0"
                            >
                              <span className="text-xs font-semibold capitalize text-foreground/90">
                                {key}
                              </span>
                              <div className="text-xs text-muted-foreground">
                                {formatValue(value, key)}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <ScrollArea className="max-h-[200px]">
                <div className="px-3 py-2 space-y-2.5">
                  {Object.entries(args).map(([key, value], index) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      className="flex flex-col gap-1 py-1.5 border-b border-border/50 last:border-0"
                    >
                      <span className="text-xs font-semibold capitalize text-foreground/90">
                        {key}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {formatValue(value, key)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        ))}

      <CardFooter className="flex gap-2 justify-end">
        <Button
          onClick={handleReject}
          variant="outline"
          className="w-fit text-xs h-fit p-1.5"
          disabled={isLoading}
        >
          {rejectLabel}
        </Button>
        <Button
          onClick={handleConfirm}
          className="w-fit text-xs h-fit p-1.5"
          disabled={isLoading}
        >
          {isLoading ? "Thinking" : confirmLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
