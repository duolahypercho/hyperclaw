"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Search,
  Filter,
  Eye,
  EyeOff,
  Code,
  Table,
  Grid3X3,
  Download,
  RefreshCw,
  List,
  Hash,
  Type,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface JSONViewerProps {
  data: any;
  title?: string;
  defaultExpanded?: boolean;
  showControls?: boolean;
  className?: string;
  fullHeight?: boolean;
}

type ViewMode = "tree" | "table" | "cards";
type DataType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined";

interface JSONNode {
  key: string;
  value: any;
  type: DataType;
  path: string;
  level: number;
  isExpanded?: boolean;
  children?: JSONNode[];
}

const JSONViewer: React.FC<JSONViewerProps> = ({
  data,
  title = "JSON Data",
  defaultExpanded = false,
  showControls = true,
  className = "",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    defaultExpanded ? new Set([""]) : new Set()
  );
  const [showNullValues, setShowNullValues] = useState(true);
  const [showEmptyArrays, setShowEmptyArrays] = useState(true);

  // Helper function to get data type
  const getDataType = (value: any): DataType => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    return typeof value as DataType;
  };

  // Parse JSON data into tree structure
  const jsonTree = useMemo(() => {
    const parseValue = (
      value: any,
      key: string,
      path: string,
      level: number
    ): JSONNode => {
      const node: JSONNode = {
        key,
        value,
        type: getDataType(value),
        path,
        level,
        isExpanded: expandedPaths.has(path),
      };

      if (node.type === "object" && value !== null) {
        node.children = Object.entries(value)
          .sort(([a], [b]) => {
            // Sort to prioritize "Todo lists" and "Tasks of todo lists" to the top
            const priorityKeys = ["Todo lists", "Tasks of todo lists"];
            const aPriority = priorityKeys.includes(a) ? 1 : 0;
            const bPriority = priorityKeys.includes(b) ? 1 : 0;
            if (aPriority !== bPriority) {
              return bPriority - aPriority;
            }
            return a.localeCompare(b);
          })
          .map(([childKey, childValue]) =>
            parseValue(childValue, childKey, `${path}.${childKey}`, level + 1)
          );
      } else if (node.type === "array") {
        node.children = value.map((item: any, index: number) =>
          parseValue(item, index.toString(), `${path}[${index}]`, level + 1)
        );
      }

      return node;
    };

    return parseValue(data, "root", "", 0);
  }, [data, expandedPaths]);

  // Filter tree based on search term
  const filteredTree = useMemo(() => {
    if (!searchTerm) return jsonTree;

    const filterNode = (node: JSONNode): JSONNode | null => {
      const matchesSearch =
        node.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (typeof node.value === "string" &&
          node.value.toLowerCase().includes(searchTerm.toLowerCase()));

      if (matchesSearch) {
        return { ...node, isExpanded: true };
      }

      if (node.children) {
        const filteredChildren = node.children
          .map(filterNode)
          .filter((child): child is JSONNode => child !== null);

        if (filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
            isExpanded: true,
          };
        }
      }

      return null;
    };

    return filterNode(jsonTree);
  }, [jsonTree, searchTerm]);

  const getTypeColor = (type: DataType): string => {
    const colors = {
      string: "bg-green-100 text-green-800",
      number: "bg-blue-100 text-blue-800",
      boolean: "bg-purple-100 text-purple-800",
      null: "bg-gray-100 text-gray-800",
      undefined: "bg-gray-100 text-gray-800",
      object: "bg-orange-100 text-orange-800",
      array: "bg-pink-100 text-pink-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const formatValue = (value: any, type: DataType): string => {
    if (type === "string") return `"${value}"`;
    if (type === "null") return "null";
    if (type === "undefined") return "undefined";
    if (type === "object" && value === null) return "null";
    if (type === "array") return `Array(${value.length})`;
    if (type === "object") return `Object(${Object.keys(value).length})`;
    return String(value);
  };

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const exportJSON = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getTypeIcon = (type: DataType) => {
    switch (type) {
      case "array":
        return <List className="w-4 h-4" />;
      case "object":
        return <Hash className="w-4 h-4" />;
      case "string":
        return <Type className="w-4 h-4" />;
      case "number":
        return <Hash className="w-4 h-4" />;
      case "boolean":
        return <CheckCircle className="w-4 h-4" />;
      case "null":
        return <XCircle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const renderArrayChildren = (children: JSONNode[], parentPath: string) => {
    if (children.length === 0) {
      return (
        <div className="text-sm text-gray-500 italic ml-8">Empty array</div>
      );
    }

    return (
      <div className="ml-4 space-y-1">
        {children.map((child, index) => (
          <motion.div
            key={child.path}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group"
          >
            <div
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border hover:bg-blue-50 transition-colors cursor-pointer"
              onClick={() => {
                if (child.children && child.children.length > 0) {
                  toggleExpanded(child.path);
                }
              }}
            >
              <Badge variant="outline" className="text-xs min-w-fit">
                [{index}]
              </Badge>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getTypeIcon(child.type)}
                <Badge className={`text-xs ${getTypeColor(child.type)}`}>
                  {child.type}
                </Badge>
                <span className="text-gray-700 font-mono text-sm truncate max-w-xs">
                  {formatValue(child.value, child.type)}
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(JSON.stringify(child.value, null, 2));
                  }}
                  className="h-6 w-6 p-0 hover:bg-blue-100"
                  title="Copy value"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                {child.children && child.children.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {expandedPaths.has(child.path)
                      ? "Expanded"
                      : "Click to expand"}
                  </Badge>
                )}
              </div>
            </div>

            <AnimatePresence>
              {child.children &&
                child.children.length > 0 &&
                expandedPaths.has(child.path) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {child.type === "array"
                      ? renderArrayChildren(child.children, child.path)
                      : child.type === "object"
                      ? renderObjectChildren(child.children, child.path)
                      : null}
                  </motion.div>
                )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    );
  };

  const renderObjectChildren = (children: JSONNode[], parentPath: string) => {
    if (children.length === 0) {
      return (
        <div className="text-sm text-gray-500 italic ml-8">Empty object</div>
      );
    }

    return (
      <div className="ml-4 space-y-1">
        {children.map((child, index) => (
          <motion.div
            key={child.path}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group"
          >
            <div
              className={`flex items-center gap-2 p-2 rounded-md transition-all duration-200 ${
                child.children && child.children.length > 0
                  ? "hover:bg-blue-50 cursor-pointer hover:border-blue-200 border border-transparent"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => {
                if (child.children && child.children.length > 0) {
                  toggleExpanded(child.path);
                }
              }}
            >
              {child.children && child.children.length > 0 && (
                <motion.div
                  animate={{ rotate: expandedPaths.has(child.path) ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-blue-600"
                >
                  <ChevronRight className="w-4 h-4" />
                </motion.div>
              )}

              {(!child.children || child.children.length === 0) && (
                <div className="w-4" />
              )}

              <span className="font-medium text-gray-700 truncate">
                {child.key}:
              </span>
              <div className="flex items-center gap-2">
                {getTypeIcon(child.type)}
                <Badge className={`text-xs ${getTypeColor(child.type)}`}>
                  {child.type}
                </Badge>
              </div>
              <span className="text-gray-600 font-mono text-sm truncate max-w-xs flex-1">
                {formatValue(child.value, child.type)}
              </span>

              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(JSON.stringify(child.value, null, 2));
                  }}
                  className="h-6 w-6 p-0 hover:bg-blue-100"
                  title="Copy value"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                {child.children && child.children.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {expandedPaths.has(child.path)
                      ? "Expanded"
                      : "Click to expand"}
                  </Badge>
                )}
              </div>
            </div>

            <AnimatePresence>
              {child.children &&
                child.children.length > 0 &&
                expandedPaths.has(child.path) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {child.type === "array"
                      ? renderArrayChildren(child.children, child.path)
                      : child.type === "object"
                      ? renderObjectChildren(child.children, child.path)
                      : null}
                  </motion.div>
                )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    );
  };

  const renderTreeNode = (node: JSONNode): React.ReactNode => {
    if (!node) return null;

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedPaths.has(node.path);

    return (
      <motion.div
        key={node.path}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="select-none"
      >
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded-md group border-l-2 border-transparent transition-all duration-200 ${
            hasChildren
              ? "hover:bg-blue-50 cursor-pointer hover:border-blue-300"
              : "hover:bg-gray-50"
          }`}
          style={{ paddingLeft: `${node.level * 20 + 12}px` }}
          onClick={() => hasChildren && toggleExpanded(node.path)}
        >
          {hasChildren && (
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-blue-600"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          )}

          {!hasChildren && <div className="w-4" />}

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-medium text-gray-700 truncate">
              {node.key}:
            </span>
            {getTypeIcon(node.type)}
            <Badge className={`text-xs ${getTypeColor(node.type)}`}>
              {node.type}
            </Badge>
            <span className="text-gray-600 font-mono text-sm truncate max-w-xs">
              {formatValue(node.value, node.type)}
            </span>
          </div>

          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(JSON.stringify(node.value, null, 2));
              }}
              className="h-6 w-6 p-0 hover:bg-blue-100"
              title="Copy value"
            >
              <Copy className="w-3 h-3" />
            </Button>
            {hasChildren && (
              <Badge variant="outline" className="text-xs">
                {isExpanded ? "Expanded" : "Click to expand"}
              </Badge>
            )}
          </div>
        </div>

        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {node.type === "array"
                ? renderArrayChildren(node.children!, node.path)
                : node.type === "object"
                ? renderObjectChildren(node.children!, node.path)
                : null}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const renderTableView = () => {
    const flattenObject = (
      obj: any,
      prefix = "",
      level = 0
    ): Array<{
      key: string;
      value: any;
      type: DataType;
      level: number;
      hasChildren: boolean;
      childrenCount?: number;
    }> => {
      const result: Array<{
        key: string;
        value: any;
        type: DataType;
        level: number;
        hasChildren: boolean;
        childrenCount?: number;
      }> = [];

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const type = getDataType(value);
        const hasChildren =
          (type === "object" && value !== null) || type === "array";
        let childrenCount = 0;

        if (type === "object" && value !== null && typeof value === "object") {
          childrenCount = Object.keys(value as Record<string, any>).length;
          result.push({
            key: fullKey,
            value,
            type,
            level,
            hasChildren,
            childrenCount,
          });
          result.push(
            ...flattenObject(value as Record<string, any>, fullKey, level + 1)
          );
        } else if (type === "array" && Array.isArray(value)) {
          childrenCount = value.length;
          result.push({
            key: fullKey,
            value,
            type,
            level,
            hasChildren,
            childrenCount,
          });
          value.forEach((item: any, index: number) => {
            if (typeof item === "object" && item !== null) {
              result.push(
                ...flattenObject(item, `${fullKey}[${index}]`, level + 1)
              );
            } else {
              result.push({
                key: `${fullKey}[${index}]`,
                value: item,
                type: getDataType(item),
                level: level + 1,
                hasChildren: false,
              });
            }
          });
        } else {
          result.push({ key: fullKey, value, type, level, hasChildren });
        }
      }

      return result;
    };

    const flattenedData = flattenObject(data);

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3 font-medium text-gray-700">Key</th>
              <th className="text-left p-3 font-medium text-gray-700">Type</th>
              <th className="text-left p-3 font-medium text-gray-700">Value</th>
              <th className="text-left p-3 font-medium text-gray-700">
                Details
              </th>
              <th className="text-left p-3 font-medium text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {flattenedData.map((item, index) => (
              <motion.tr
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                className="border-b hover:bg-gray-50 group"
                style={{
                  backgroundColor:
                    item.level > 0
                      ? `rgba(0, 0, 0, ${item.level * 0.02})`
                      : undefined,
                }}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingLeft: `${item.level * 16}px` }}
                    >
                      {item.hasChildren && (
                        <div className="flex items-center gap-1">
                          {getTypeIcon(item.type)}
                          <span className="text-gray-400">└</span>
                        </div>
                      )}
                      <span className="font-mono text-sm">{item.key}</span>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <Badge className={`text-xs ${getTypeColor(item.type)}`}>
                      {item.type}
                    </Badge>
                  </div>
                </td>
                <td className="p-3">
                  <div className="max-w-xs">
                    {item.hasChildren ? (
                      <div className="text-sm text-gray-500">
                        {item.type === "array"
                          ? `${item.childrenCount} items`
                          : `${item.childrenCount} properties`}
                      </div>
                    ) : (
                      <div className="font-mono text-sm truncate">
                        {formatValue(item.value, item.type)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  {item.hasChildren && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.childrenCount}{" "}
                        {item.type === "array" ? "items" : "props"}
                      </Badge>
                      {item.level > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Level {item.level}
                        </Badge>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(JSON.stringify(item.value, null, 2))
                      }
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {item.hasChildren && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleExpanded(item.key)}
                        className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {expandedPaths.has(item.key) ? "Collapse" : "Expand"}
                      </Button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCardsView = () => {
    const createCards = (
      obj: any,
      prefix = "",
      level = 0
    ): React.ReactNode[] => {
      const cards: React.ReactNode[] = [];

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const type = getDataType(value);

        cards.push(
          <motion.div
            key={fullKey}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: level * 0.1 }}
          >
            <Card className="hover:shadow-sm transition-shadow group">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(type)}
                    {key}
                  </div>
                  <Badge className={`text-xs ${getTypeColor(type)}`}>
                    {type}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-sm text-gray-600 break-all">
                  {type === "object" &&
                  value !== null &&
                  typeof value === "object" ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-500 mb-2">
                        Object with{" "}
                        {Object.keys(value as Record<string, any>).length}{" "}
                        properties
                      </div>
                      <ScrollArea className="max-h-32">
                        <div className="space-y-1">
                          {Object.keys(value as Record<string, any>)
                            .slice(0, 5)
                            .map((subKey) => (
                              <div
                                key={subKey}
                                className="flex items-center gap-2 text-xs p-1 bg-gray-50 rounded"
                              >
                                <Badge variant="outline" className="text-xs">
                                  {getDataType(
                                    (value as Record<string, any>)[subKey]
                                  )}
                                </Badge>
                                <span className="font-medium">{subKey}:</span>
                                <span className="text-gray-600">
                                  {formatValue(
                                    (value as Record<string, any>)[subKey],
                                    getDataType(
                                      (value as Record<string, any>)[subKey]
                                    )
                                  )}
                                </span>
                              </div>
                            ))}
                          {Object.keys(value as Record<string, any>).length >
                            5 && (
                            <div className="text-xs text-gray-500 italic">
                              +
                              {Object.keys(value as Record<string, any>)
                                .length - 5}{" "}
                              more properties...
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : type === "array" && Array.isArray(value) ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-500 mb-2">
                        Array with {value.length} items
                      </div>
                      <ScrollArea className="max-h-32">
                        <div className="space-y-1">
                          {value.slice(0, 5).map((item: any, index: number) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 text-xs p-1 bg-gray-50 rounded"
                            >
                              <Badge variant="outline" className="text-xs">
                                [{index}]
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {getDataType(item)}
                              </Badge>
                              <span className="text-gray-600">
                                {formatValue(item, getDataType(item))}
                              </span>
                            </div>
                          ))}
                          {value.length > 5 && (
                            <div className="text-xs text-gray-500 italic">
                              +{value.length - 5} more items...
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="p-2 bg-gray-50 rounded text-sm">
                      {formatValue(value, type)}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(JSON.stringify(value, null, 2))
                    }
                    className="h-6 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </Button>

                  {(type === "object" || type === "array") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleExpanded(fullKey)}
                      className="h-6 text-xs"
                    >
                      {expandedPaths.has(fullKey) ? "Collapse" : "Expand"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      }

      return cards;
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {createCards(data, "", 0)}
        </div>

        {/* Show expanded children in separate sections */}
        {Object.entries(data).map(([key, value]) => {
          const type = getDataType(value);
          const fullKey = key;

          if (
            (type === "object" || type === "array") &&
            expandedPaths.has(fullKey)
          ) {
            return (
              <motion.div
                key={`expanded-${fullKey}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    {getTypeIcon(type)}
                    {key} Details
                    <Badge className={`text-xs ${getTypeColor(type)}`}>
                      {type}
                    </Badge>
                  </h3>
                  <Separator className="mb-4" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {createCards(value, fullKey, 1)}
                </div>
              </motion.div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {showControls && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportJSON}
              className="h-8"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(data, null, 2))}
              className="h-8"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy All
            </Button>
          </div>
        )}
      </div>

      {/* Controls */}
      {showControls && (
        <div className="p-4 border-b">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search keys and values..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Tabs
              value={viewMode}
              onValueChange={(value) => setViewMode(value as ViewMode)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="tree" className="flex items-center gap-1">
                  <Code className="w-4 h-4" />
                  Tree
                </TabsTrigger>
                <TabsTrigger value="table" className="flex items-center gap-1">
                  <Table className="w-4 h-4" />
                  Table
                </TabsTrigger>
                <TabsTrigger value="cards" className="flex items-center gap-1">
                  <Grid3X3 className="w-4 h-4" />
                  Cards
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`p-4 flex-1`}>
        <Tabs value={viewMode}>
          <TabsContent value="tree" className="mt-0">
            {filteredTree ? (
              <div className="space-y-1">{renderTreeNode(filteredTree)}</div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No matching results found
              </div>
            )}
          </TabsContent>

          <TabsContent value="table" className="mt-0">
            {renderTableView()}
          </TabsContent>

          <TabsContent value="cards" className="mt-0">
            {renderCardsView()}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default JSONViewer;
