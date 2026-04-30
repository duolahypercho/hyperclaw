"use client";

import React, { memo, useState } from "react";
import { usePromptLibrary } from "../../provider/PromptProv";
import { useOptimize } from "../../provider/OptimizeProv";
import { Message, PromptVariable } from "$/types";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Variable,
  Lightbulb,
  Settings,
  History,
  Sparkles,
  User,
  Trash2,
  Plus,
  XCircle,
  ArrowRight,
  RefreshCw,
  Edit2,
  Save,
  GripVertical,
  Eye,
  EyeOff,
  Bot,
} from "lucide-react";
import { AnimationContainer } from "@OS/AI/components/AnimationContainer";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { extractVariableNames } from "../../utils";
import HyperchoLogoInput from "$/components/UI/HyperchoLogoInput";
import { Prompt } from "../../types";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
// DnD Kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { newMongoId } from "$/utils/form";
import DeleteConfirmation from "$/components/UI/DeleteConfirmation";

type TabType = "general" | "prompt" | "variables" | "history";

// PromptConfigDetail Component for the right-side panel
const PromptConfigDetail = memo(({ prompt }: { prompt: Prompt }) => {
  const { category, loading } = usePromptLibrary();
  const { toast } = useToast();
  const {
    optimizedPromptStream,
    setOptimizedPromptStream,
    selectedOptimizePrompt,
    setSelectedOptimizePrompt,
    optimizePromptsTemp,
    handleOptimizePrompt,
    copyToClipboard,
    uiState,
    addMessageToHistory,
    updatePromptUIState,
    form,
    deletePrompt,
  } = useOptimize();

  // Tab state - keep this local as it's UI state
  const [activeTab, setActiveTab] = useState<TabType>("general");

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get form values
  const formValues = form.watch();

  // Remove message from history
  const removeMessageFromHistory = (messageId: string) => {
    const currentHistory = form.getValues("relatedHistory") || [];
    const updatedHistory = currentHistory.filter((msg) => msg.id !== messageId);

    form.setValue("relatedHistory", updatedHistory, { shouldDirty: true });
  };

  const toggleMessageVisibility = (messageId: string) => {
    const currentHistory = form.getValues("relatedHistory") || [];
    const updatedHistory = currentHistory.map((msg) =>
      msg.id === messageId ? { ...msg, display: !msg.display } : msg
    );
    form.setValue("relatedHistory", updatedHistory, { shouldDirty: true });
  };

  // Clear all history
  const clearHistory = () => {
    form.setValue("relatedHistory", [], { shouldDirty: true });
  };

  // Edit message functions
  const startEditMessage = (message: Message) => {
    const editMessageContent =
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((content) => (content.type === "text" ? content.text : ""))
            .join("");

    updatePromptUIState({
      editingMessage: message.id,
      editMessageContent,
      editMessageRole: message.role as "user" | "assistant",
    });
  };

  const saveEditMessage = () => {
    const editingMessage = uiState.editingMessage;
    const editMessageContent = uiState.editMessageContent || "";
    const editMessageRole = uiState.editMessageRole || "user";

    if (!editingMessage || !editMessageContent.trim()) return;

    const currentHistory = form.getValues("relatedHistory") || [];
    const updatedHistory = currentHistory.map((msg) =>
      msg.id === editingMessage
        ? {
            ...msg,
            role: editMessageRole,
            content: editMessageContent.trim(),
          }
        : msg
    );

    form.setValue("relatedHistory", updatedHistory, { shouldDirty: true });

    updatePromptUIState({
      editingMessage: null,
      editMessageContent: "",
    });
  };

  const cancelEditMessage = () => {
    updatePromptUIState({
      editingMessage: null,
      editMessageContent: "",
    });
  };

  // Drag and drop functions
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const currentHistory = form.getValues("relatedHistory") || [];
    const oldIndex = currentHistory.findIndex((item) => item.id === active.id);
    const newIndex = currentHistory.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newHistory = arrayMove(currentHistory, oldIndex, newIndex);

      form.setValue("relatedHistory", newHistory, { shouldDirty: true });
    }
  };

  // Variables management functions
  const addVariable = () => {
    const newVariableName = uiState.newVariableName || "";

    if (!newVariableName.trim()) return;

    const variable: PromptVariable = {
      _id: newMongoId(),
      name: newVariableName.trim(),
      description: `Variable for ${newVariableName.trim()}`,
      defaultValue: "",
      required: false,
    };

    const currentVariables = form.getValues("variables") || [];
    const updatedVariables = [...currentVariables, variable];

    form.setValue("variables", updatedVariables, { shouldDirty: true });

    // Reset form
    updatePromptUIState({
      newVariableName: "",
      showAddVariableForm: false,
    });
  };

  const updateVariable = (id: string, updates: Partial<PromptVariable>) => {
    const currentVariables = form.getValues("variables") || [];
    const updatedVariables = currentVariables.map((var_) =>
      var_._id === id ? { ...var_, ...updates } : var_
    );

    form.setValue("variables", updatedVariables, { shouldDirty: true });

    updatePromptUIState({
      editingVariable: null,
    });
  };

  const removeVariable = (id: string) => {
    const currentVariables = form.getValues("variables") || [];
    const updatedVariables = currentVariables.filter((var_) => var_._id !== id);

    form.setValue("variables", updatedVariables, { shouldDirty: true });
  };

  // Suggest variables from prompt template
  const suggestVariablesFromPrompt = () => {
    const promptText =
      formValues.originalPrompt || formValues.optimizedPrompt || "";
    const detectedVariables = extractVariableNames(promptText);

    if (detectedVariables.length > 0) {
      // Create variables from detected placeholders
      const suggestedVariables: PromptVariable[] = detectedVariables.map(
        (varName) => ({
          _id: newMongoId(),
          name: varName,
          description: `Variable for ${varName}`,
          defaultValue: "",
          required: false,
        })
      );

      form.setValue("variables", suggestedVariables, { shouldDirty: true });
    }
  };

  // Add new function to insert/merge optimized prompt
  const insertOptimizedPrompt = () => {
    if (!formValues.optimizedPrompt) return;

    // Update the prompt with merged content and new version
    form.setValue("originalPrompt", formValues.optimizedPrompt, {
      shouldDirty: true,
    });
    form.setValue("optimizedPrompt", "", { shouldDirty: true });

    // Clear the optimized prompt stream if it exists
    setOptimizedPromptStream(null);

    toast({
      title: "Prompt Merged",
      description: "Optimized prompt has been merged into the original prompt.",
    });
  };

  // Simplified Variable Display Component
  const VariableDisplay = ({
    variable,
    onEdit,
    onDelete,
  }: {
    variable: PromptVariable;
    onEdit: () => void;
    onDelete: () => void;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{variable.name}</span>
          {variable.required && (
            <Badge variant="destructive" className="text-xs">
              Required
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            text
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-6 w-6 p-0"
          >
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-destructive"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {variable.description && (
        <p className="text-xs text-muted-foreground">{variable.description}</p>
      )}
      <div className="text-xs text-muted-foreground">
        Default: {variable.defaultValue || "None"}
      </div>
    </div>
  );

  // Simplified Variable Edit Form Component
  const VariableEditForm = ({
    variable,
    onSave,
    onCancel,
  }: {
    variable: PromptVariable;
    onSave: (updates: Partial<PromptVariable>) => void;
    onCancel: () => void;
  }) => {
    const [editData, setEditData] = useState<Partial<PromptVariable>>(variable);

    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Variable Name</Label>
          <Input
            value={editData.name}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, name: e.target.value }))
            }
            className="h-8"
            placeholder="e.g., topic, tone, length"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input
            value={editData.description}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, description: e.target.value }))
            }
            className="h-8"
            placeholder="What is this variable for?"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Default Value</Label>
          <Input
            value={editData.defaultValue}
            onChange={(e) =>
              setEditData((prev) => ({
                ...prev,
                defaultValue: e.target.value,
              }))
            }
            className="h-8"
            placeholder="Default value (optional)"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id={`required-${variable._id}`}
            checked={editData.required}
            onCheckedChange={(checked) =>
              setEditData((prev) => ({ ...prev, required: checked }))
            }
          />
          <Label htmlFor={`required-${variable._id}`} className="text-xs">
            Required
          </Label>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => onSave(editData)} size="sm" className="flex-1">
            <Save className="w-3 h-3 mr-2" />
            Save
          </Button>
          <Button variant="outline" onClick={onCancel} size="sm">
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Sortable Message Component
  const SortableMessage = ({ message }: { message: Message }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: message.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const isEditing = uiState.editingMessage === message.id;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-start gap-1.5 p-1.5 px-3 rounded-lg border transition-all ${
          isDragging ? "opacity-50 scale-95" : ""
        } ${
          message.role === "user"
            ? "bg-primary/10 border-primary/20"
            : "bg-muted/50 border-muted"
        }`}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Message Icon */}
        <div className="flex-shrink-0 mt-1">
          {message.role === "user" ? (
            <User className="w-4 h-4 text-primary" />
          ) : (
            <Bot className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium capitalize text-muted-foreground">
              {message.role === "assistant" ? "Agent" : "User"}
            </span>
            <div className="flex items-center gap-1">
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEditMessage(message)}
                  className="h-6 w-6 p-0"
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => toggleMessageVisibility(message.id)}
              >
                {message.display ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMessageFromHistory(message.id)}
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Role:</Label>
                <Select
                  value={uiState.editMessageRole || "user"}
                  onValueChange={(value: "user" | "assistant") =>
                    updatePromptUIState({ editMessageRole: value })
                  }
                >
                  <SelectTrigger className="w-36 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        User
                      </div>
                    </SelectItem>
                    <SelectItem value="assistant">
                      <div className="flex items-center gap-2">
                        <Bot className="w-3 h-3" />
                        Agent
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={uiState.editMessageContent || ""}
                onChange={(e) =>
                  updatePromptUIState({ editMessageContent: e.target.value })
                }
                className="resize-none customScrollbar2 max-h-[300px] overflow-y-auto"
                rows={12}
                placeholder="Edit message content..."
              />
              <div className="flex gap-2">
                <Button
                  onClick={saveEditMessage}
                  disabled={!uiState.editMessageContent?.trim()}
                  size="sm"
                  className="flex-1"
                >
                  <Save className="w-3 h-3 mr-2" />
                  Save
                </Button>
                <Button variant="outline" onClick={cancelEditMessage} size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed max-h-[300px] overflow-y-auto customScrollbar2">
              {typeof message.content === "string"
                ? message.content
                : message.content
                    .map((content, i) =>
                      content.type === "text"
                        ? content.text
                        : `[Image ${i + 1}]`
                    )
                    .join(" ")}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="h-full w-full rounded-none border-none flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Prompt Configuration
        </CardTitle>
        <CardDescription>
          Configure and optimize your prompt with best practices
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <Form {...form}>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TabType)}
            className="h-full flex flex-col"
          >
            <div className="px-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="variables">Variables</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden">
              <TabsContent
                value="general"
                className="h-full overflow-y-auto customScrollbar2"
              >
                <div className="px-6 py-3 space-y-4">
                  <FormField
                    control={form.control}
                    name="promptImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prompt Image</FormLabel>
                        <FormControl>
                          <HyperchoLogoInput
                            value={field.value || ""}
                            onChange={(value) => {
                              const imageValue =
                                typeof value === "string" ? value : "";
                              field.onChange(imageValue);
                            }}
                            placeholder="Upload prompt image"
                            storeLocation={`prompt/${prompt._id}/images`}
                            size="md"
                            variant="immediate"
                            maxSizeInMB={2}
                          />
                        </FormControl>
                        <FormDescription>
                          Add an image to make your prompt stand out
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="promptName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prompt Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter a catchy name for your prompt"
                            {...field}
                            maxLength={50}
                            minLength={3}
                          />
                        </FormControl>
                        <div className="flex items-center justify-between">
                          <FormDescription>
                            Give your prompt a memorable name
                          </FormDescription>
                          <span className="text-xs text-muted-foreground">
                            {field.value?.length || 0}/50
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="promptCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {category.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose the most relevant category
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="promptDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe what this prompt does and how to use it"
                            {...field}
                            rows={3}
                            maxLength={500}
                            minLength={10}
                          />
                        </FormControl>
                        <div className="flex items-center justify-between">
                          <FormDescription>
                            Help others understand your prompt
                          </FormDescription>
                          <span className="text-xs text-muted-foreground">
                            {field.value?.length || 0}/500
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="author"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Author Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your name" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <DeleteConfirmation
                    className="w-full cursor-pointer"
                    onConfirm={() => {
                      deletePrompt(prompt._id);
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value="prompt"
                className="h-full overflow-y-auto customScrollbar2"
              >
                <div className="px-6 py-3 space-y-6 h-full">
                  <FormField
                    control={form.control}
                    name="originalPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Prompt</FormLabel>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(field.value)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <FormControl>
                          <Textarea
                            className="resize-none customScrollbar2 max-h-[300px] overflow-y-auto"
                            placeholder="e.g., Write a blog post about {topic} in a {tone} tone"
                            rows={10}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <Label>Optimization Strategy</Label>
                    <Select
                      value={selectedOptimizePrompt?.id || ""}
                      onValueChange={(value) => {
                        const prompt = optimizePromptsTemp.find(
                          (p) => p.id === value
                        );
                        setSelectedOptimizePrompt(prompt || null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select optimization strategy">
                          {selectedOptimizePrompt?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {optimizePromptsTemp.map((prompt) => (
                          <SelectItem key={prompt.id} value={prompt.id}>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span>{prompt.name}</span>
                                {prompt.isBuiltin && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Built-in
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {prompt.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleOptimizePrompt}
                    disabled={
                      loading.isLoading("optimizing") ||
                      !formValues.originalPrompt?.trim()
                    }
                    className="w-full"
                  >
                    {loading.isLoading("optimizing") ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Optimize Prompt
                      </>
                    )}
                  </Button>
                  <Separator />
                  {(formValues.optimizedPrompt || optimizedPromptStream) && (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Optimized Prompt
                          </Label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  formValues.optimizedPrompt || ""
                                )
                              }
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={insertOptimizedPrompt}
                            >
                              Insert Prompt
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        </div>

                        {/* Optimized Prompt Display/Edit */}
                        <div className="space-y-4">
                          <AnimationContainer
                            stream={optimizedPromptStream}
                            text={formValues.optimizedPrompt || ""}
                            onComplete={(completeText) => {
                              setOptimizedPromptStream(null);
                              form.setValue("optimizedPrompt", completeText, {
                                shouldDirty: true,
                              });
                            }}
                            placeholder={{
                              icon: (
                                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              ),
                              text: "Your optimized prompt will appear here",
                            }}
                          />
                        </div>
                      </div>

                      <Separator />
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="variables" className="h-full overflow-hidden">
                <div className="flex flex-col h-full px-6 py-3">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap w-full">
                      <Label className="flex items-center gap-2">
                        <Variable className="w-4 h-4" />
                        Text Variables
                      </Label>
                      <Badge variant="secondary" className="mr-auto text-xs">
                        {formValues.variables?.length || 0} variables
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={suggestVariablesFromPrompt}
                          className="text-xs"
                        >
                          <Lightbulb className="w-3 h-3 mr-1" />
                          Auto-detect
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updatePromptUIState({ showAddVariableForm: true })
                          }
                          className="text-xs"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Variables List with scrollbar */}
                  <div className="flex-1 overflow-y-auto customScrollbar2 min-h-0">
                    {formValues.variables &&
                      formValues.variables.length > 0 && (
                        <div className="space-y-3">
                          {formValues.variables.map((variable) => (
                            <div
                              key={variable._id}
                              className="p-1.5 px-3 border rounded-lg bg-muted/30"
                            >
                              {uiState.editingVariable === variable._id ? (
                                <VariableEditForm
                                  variable={variable}
                                  onSave={(updates) =>
                                    updateVariable(variable._id, updates)
                                  }
                                  onCancel={() =>
                                    updatePromptUIState({
                                      editingVariable: null,
                                    })
                                  }
                                />
                              ) : (
                                <VariableDisplay
                                  variable={variable}
                                  onEdit={() =>
                                    updatePromptUIState({
                                      editingVariable: variable._id,
                                    })
                                  }
                                  onDelete={() => removeVariable(variable._id)}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    {uiState.showAddVariableForm && (
                      <div className="space-y-3 p-4 border rounded-lg bg-muted/30 mt-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Add Text Variable
                          </Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updatePromptUIState({
                                showAddVariableForm: false,
                                newVariableName: "",
                              });
                            }}
                            className="h-6 w-6 p-0 absolute top-2 right-2"
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Variable Name</Label>
                          <Input
                            placeholder="e.g., topic, tone, length"
                            value={uiState.newVariableName || ""}
                            onChange={(e) =>
                              updatePromptUIState({
                                newVariableName: e.target.value,
                              })
                            }
                            className="h-8"
                          />
                          <p className="text-xs text-muted-foreground">
                            Use this name in your prompt as {"{"}
                            {uiState.newVariableName || "variable"}
                            {"}"}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={addVariable}
                            disabled={!uiState.newVariableName?.trim()}
                            size="sm"
                            className="flex-1"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Variable
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              updatePromptUIState({
                                showAddVariableForm: false,
                                newVariableName: "",
                              });
                            }}
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="h-full overflow-hidden">
                <div className="flex flex-col h-full px-6 py-3">
                  {/* Fixed Header */}
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <Label className="flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Chat History
                    </Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {(formValues.relatedHistory || []).length}/20
                      </Badge>
                      {(formValues.relatedHistory || []).length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearHistory}
                          className="text-xs"
                        >
                          Clear All
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() =>
                          updatePromptUIState({ showAddMessageForm: true })
                        }
                        size="sm"
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-2" />
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Scrollable Messages Area */}
                  <div className="flex-1 overflow-y-auto customScrollbar2 min-h-0">
                    {/* Empty State */}
                    {(!formValues.relatedHistory ||
                      formValues.relatedHistory.length === 0) &&
                      !uiState.showAddMessageForm && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <History className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground mb-4">
                            No chat history yet
                          </p>
                          <p className="text-xs text-muted-foreground mb-4">
                            Add conversation examples to help improve your
                            prompt
                          </p>
                          <Button
                            variant="outline"
                            onClick={() =>
                              updatePromptUIState({ showAddMessageForm: true })
                            }
                            size="sm"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Message
                          </Button>
                        </div>
                      )}

                    {/* History Messages */}
                    {formValues.relatedHistory &&
                      formValues.relatedHistory.length > 0 && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={formValues.relatedHistory.map(
                              (item) => item.id
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-3">
                              {formValues.relatedHistory.map((message) => (
                                <SortableMessage
                                  key={message.id}
                                  message={message}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}

                    {/* Add New Message Form */}
                    {uiState.showAddMessageForm &&
                      (formValues.relatedHistory || []).length < 20 && (
                        <div className="space-y-3 p-4 border rounded-lg bg-muted/30 mt-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                              Add Message
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                updatePromptUIState({
                                  showAddMessageForm: false,
                                  newMessageContent: "",
                                });
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium">Role:</Label>
                            <Select
                              value={uiState.newMessageRole || "user"}
                              onValueChange={(value: "user" | "assistant") =>
                                updatePromptUIState({ newMessageRole: value })
                              }
                            >
                              <SelectTrigger className="w-36 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">
                                  <div className="flex items-center gap-2">
                                    <User className="w-3 h-3" />
                                    User
                                  </div>
                                </SelectItem>
                                <SelectItem value="assistant">
                                  <div className="flex items-center gap-2">
                                    <Bot className="w-3 h-3" />
                                    Agent
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <Textarea
                            placeholder={`Enter ${
                              uiState.newMessageRole || "user"
                            } message...`}
                            value={uiState.newMessageContent || ""}
                            onChange={(e) =>
                              updatePromptUIState({
                                newMessageContent: e.target.value,
                              })
                            }
                            className="resize-none"
                            rows={3}
                          />

                          <div className="flex gap-2">
                            <Button
                              onClick={() =>
                                addMessageToHistory({
                                  id: newMongoId(),
                                  role: uiState.newMessageRole || "user",
                                  content: uiState.newMessageContent || "",
                                  display: true,
                                  timestamp: Date.now(),
                                })
                              }
                              disabled={!uiState.newMessageContent?.trim()}
                              size="sm"
                              className="flex-1"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add Message
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                updatePromptUIState({
                                  showAddMessageForm: false,
                                  newMessageContent: "",
                                });
                              }}
                              size="sm"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                    {(formValues.relatedHistory || []).length >= 20 && (
                      <div className="text-center p-4 border rounded-lg bg-muted/30 mt-3">
                        <p className="text-sm text-muted-foreground">
                          Maximum 20 messages reached. Remove some messages to
                          add more.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </Form>
      </CardContent>
    </Card>
  );
});

PromptConfigDetail.displayName = "PromptConfigDetail";

const PromptConfigDetailWrapper = memo(() => {
  const { prompt } = useOptimize();

  if (!prompt) return null;

  return <PromptConfigDetail prompt={prompt} />;
});

PromptConfigDetailWrapper.displayName = "PromptConfigDetailWrapper";

// Export the component directly without the redundant wrapper
export default PromptConfigDetailWrapper;
