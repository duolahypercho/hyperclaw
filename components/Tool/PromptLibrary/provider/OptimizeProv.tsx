import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  Dispatch,
  SetStateAction,
  useRef,
} from "react";
import { useToast } from "@/components/ui/use-toast";
import { BasicChatService } from "@OS/AI/api/core";
import { OptimizePrompt, Prompt, PromptUIState } from "../types";
import { usePromptLibrary } from "../provider/PromptProv";
import {
  getAllOptimizePrompt,
  OptimizePromptService,
  patchUpdatePrompt,
  deletePromptService,
} from "../api/Prompt";
import { Settings, XCircle, Send, Plus, Save, Loader2 } from "lucide-react";
import { useOS } from "@OS/Provider/OSProv";
import { Message } from "$/types";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatTimeAgo } from "../utils";
import { useSession } from "next-auth/react";

// Zod schema for prompt form validation
const promptFormSchema = z.object({
  promptName: z
    .string()
    .min(3, "Prompt name must be at least 3 characters")
    .max(50, "Prompt name must be less than 50 characters"),
  promptDescription: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(500, "Description must be less than 500 characters"),
  promptCategory: z.string().min(1, "Please select a category"),
  promptImage: z.string().optional(),
  author: z.string().optional(),
  originalPrompt: z.string().min(1, "Original prompt is required"),
  optimizedPrompt: z.string().optional(),
  testPrompt: z.string().optional(),
  variables: z
    .array(
      z.object({
        _id: z.string(),
        name: z.string().min(1, "Variable name is required"),
        description: z.string(),
        defaultValue: z.string(),
        required: z.boolean(),
      })
    )
    .optional(),
  relatedHistory: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.union([
          z.string(),
          z.array(
            z.union([
              z.object({
                type: z.literal("text"),
                text: z.string(),
              }),
              z.object({
                type: z.literal("image_url"),
                image_url: z.object({
                  url: z.string(),
                }),
              }),
              z.object({
                type: z.literal("input_audio"),
                audio_data: z.object({
                  base64: z.string(),
                  mime_type: z.string(),
                }),
              }),
            ])
          ),
        ]),
        timestamp: z.number().optional(),
        display: z.boolean().optional(),
      })
    )
    .optional(),
});

type PromptFormData = z.infer<typeof promptFormSchema>;

interface OptimizeContextType {
  prompt: Prompt | null;
  setPrompt: Dispatch<SetStateAction<Prompt | null>>;
  optimizedPromptStream: AsyncIterable<string> | null;
  setOptimizedPromptStream: (stream: AsyncIterable<string> | null) => void;
  selectedOptimizePrompt: OptimizePrompt | null;
  setSelectedOptimizePrompt: (prompt: OptimizePrompt | null) => void;
  optimizePromptsTemp: OptimizePrompt[];
  handleOptimizePrompt: () => Promise<void>;
  getTestStreams: () => Promise<{
    originalStream: AsyncIterable<string> | null;
    optimizedStream: AsyncIterable<string> | null;
  }>;
  copyToClipboard: (text: string) => Promise<void>;
  uiState: PromptUIState;
  setUiState: Dispatch<SetStateAction<PromptUIState>>;
  hasUnsavedChanges: boolean;
  handleManualSave: () => Promise<void>;
  deletePrompt: (promptId: string) => Promise<void>;
  handlePublish: () => Promise<void>;
  lastSavedTime: number | null;
  isAutoSaving: boolean;
  addMessageToHistory: (message: Message) => void;
  updatePrompt: (updates: Partial<Prompt>) => void;
  updatePromptUIState: (uiState: Partial<PromptUIState>) => void;
  // Form related
  form: ReturnType<typeof useForm<PromptFormData>>;
  isSubmitting: boolean;
  isPublishing: boolean;
}

const OptimizeContext = createContext<OptimizeContextType | undefined>(
  undefined
);

export const useOptimize = () => {
  const context = useContext(OptimizeContext);
  if (!context) {
    throw new Error("useOptimize must be used within an OptimizeProvider");
  }
  return context;
};

export const OptimizeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const {
    devPrompt: initialPrompt,
    setDevPrompt: setInitialPrompt,
    loading,
    updatePlaygroundHeaderButtons,
    createNewPromptLibrary,
  } = usePromptLibrary();
  const { currentAppSettings, updateAppSettings } = useOS();
  const [optimizedPromptStream, setOptimizedPromptStream] =
    useState<AsyncIterable<string> | null>(null);
  const [selectedOptimizePrompt, setSelectedOptimizePrompt] =
    useState<OptimizePrompt | null>(null);
  const [optimizePromptsTemp, setOptimizePromptsTemp] = useState<
    OptimizePrompt[]
  >([]);
  const { status } = useSession();
  const [uiState, setUiState] = useState<PromptUIState>({
    editingVariable: null,
    newVariableName: "",
    showAddVariableForm: false,
    newMessageRole: "user",
    newMessageContent: "",
    showAddMessageForm: false,
    editingMessage: null,
    editMessageContent: "",
    editMessageRole: "user",
  });

  // Form state
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const { toast } = useToast();

  // Initialize form with default values
  const form = useForm<PromptFormData>({
    resolver: zodResolver(promptFormSchema),
    defaultValues: {
      promptName: "",
      promptDescription: "",
      promptCategory: "",
      promptImage: "",
      author: "",
      originalPrompt: "",
      optimizedPrompt: "",
      testPrompt: "",
      variables: [],
      relatedHistory: [],
    },
  });

  // Keep a snapshot of the last saved form to avoid redundant autosaves
  const lastSavedSnapshotRef = useRef<PromptFormData | null>(null);
  const suppressAutoSaveRef = useRef<boolean>(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save logic
  const hasUnsavedChanges = useMemo(() => {
    return form.formState.isDirty;
  }, [form.formState.isDirty]);

  const isAutoSaving = loading.isLoading("auto-saving");

  // Auto-save functionality
  const autoSavePrompt = useCallback(
    async (formData: PromptFormData) => {
      if (
        !prompt?._id ||
        !hasUnsavedChanges ||
        isAutoSaving ||
        isSubmitting ||
        isPublishing ||
        suppressAutoSaveRef.current
      ) {
        return;
      }

      try {
        // Avoid autosaving if nothing actually changed since last save
        if (
          lastSavedSnapshotRef.current &&
          JSON.stringify(formData) ===
            JSON.stringify(lastSavedSnapshotRef.current)
        ) {
          return;
        }

        loading.startLoading("auto-saving");

        const updateData = {
          promptName: formData.promptName,
          promptDescription: formData.promptDescription,
          promptCategory: formData.promptCategory,
          promptImage: formData.promptImage,
          author: formData.author,
          originalPrompt: formData.originalPrompt,
          optimizedPrompt: formData.optimizedPrompt,
          testPrompt: formData.testPrompt,
          variables: formData.variables,
          relatedHistory: formData.relatedHistory,
        };

        const response = await patchUpdatePrompt(prompt._id, updateData);

        if (response.success) {
          setPrompt(response.data || prompt);
          setLastSavedTime(Date.now());
          form.reset(formData); // Reset form to mark as clean
          lastSavedSnapshotRef.current = formData;
        } else {
          throw new Error(response.message || "Failed to auto-save prompt");
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
        toast({
          title: "Auto-save Failed",
          description: "Failed to automatically save your changes",
          variant: "destructive",
        });
      } finally {
        loading.stopLoading("auto-saving");
      }
    },
    [
      hasUnsavedChanges,
      isAutoSaving,
      isSubmitting,
      isPublishing,
      loading,
      toast,
      setPrompt,
      form,
      prompt,
    ]
  );

  // Manual save function
  const handleManualSave = useCallback(async () => {
    if (!prompt?._id) return;

    try {
      setIsSubmitting(true);
      const formData = form.getValues();

      const updateData = {
        promptName: formData.promptName,
        promptDescription: formData.promptDescription,
        promptCategory: formData.promptCategory,
        promptImage: formData.promptImage,
        author: formData.author,
        originalPrompt: formData.originalPrompt,
        optimizedPrompt: formData.optimizedPrompt,
        testPrompt: formData.testPrompt,
        variables: formData.variables,
        relatedHistory: formData.relatedHistory,
      };

      const response = await patchUpdatePrompt(prompt._id, updateData);

      if (response.success) {
        setInitialPrompt(response.data || prompt);
        setLastSavedTime(Date.now());
        form.reset(formData); // Reset form to mark as clean
        lastSavedSnapshotRef.current = formData;
        toast({
          title: "Saved",
          description: "Your changes have been saved",
        });
      } else {
        throw new Error(response.message || "Failed to save prompt");
      }
    } catch (error) {
      console.error("Manual save failed:", error);
      toast({
        title: "Save Failed",
        description: "Failed to save your changes",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [form, setInitialPrompt, toast, prompt]);

  // Publish function
  const handlePublish = useCallback(async () => {
    if (!prompt?._id) return;

    try {
      setIsPublishing(true);
      const formData = form.getValues();

      // Validate form before publishing
      const validationResult = await form.trigger();
      if (!validationResult) {
        toast({
          title: "Config is not complete",
          description: "Please complete the config before publishing",
          variant: "destructive",
        });
        updateAppSettings("prompt-library", { detail: true });
        return;
      }

      const updateData = {
        promptName: formData.promptName,
        promptDescription: formData.promptDescription,
        promptCategory: formData.promptCategory,
        promptImage: formData.promptImage,
        author: formData.author,
        originalPrompt: formData.originalPrompt,
        optimizedPrompt: formData.optimizedPrompt,
        testPrompt: formData.testPrompt,
        variables: formData.variables,
        relatedHistory: formData.relatedHistory,
        status: "active" as const,
      };

      const response = await patchUpdatePrompt(prompt._id, updateData);

      if (response.success) {
        setInitialPrompt(response.data || prompt);
        setLastSavedTime(Date.now());
        form.reset(formData); // Reset form to mark as clean
        lastSavedSnapshotRef.current = formData;
        toast({
          title: "Published",
          description: "Your prompt has been published successfully",
        });
      } else {
        throw new Error(response.message || "Failed to publish prompt");
      }
    } catch (error) {
      console.error("Failed to publish prompt:", error);
      toast({
        title: "Publish Failed",
        description: "Failed to publish your prompt",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  }, [form, setInitialPrompt, toast, prompt, updateAppSettings]);

  const createHeaderButtons = useCallback(() => {
    if (!prompt) return [];

    const baseButtons = [
      {
        id: "new-prompt",
        label: "New Prompt",
        icon: <Plus className="w-4 h-4" />,
        variant: "outline" as const,
        className: "text-xs font-semibold",
        onClick: () => createNewPromptLibrary(),
      },
    ];

    const optimizeButtons = [
      ...baseButtons,
      {
        id: "save",
        label: isAutoSaving
          ? "Auto-saving..."
          : lastSavedTime
          ? `Last auto-saved ${formatTimeAgo(lastSavedTime)}`
          : "Auto-save enabled",
        icon: isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        ),
        variant: hasUnsavedChanges ? "success" : ("outline" as const),
        className: `text-xs font-semibold`,
        onClick: handleManualSave,
        disabled: isSubmitting || !hasUnsavedChanges,
      },
      {
        id: "config",
        label: "Config",
        icon: <Settings className="w-4 h-4" />,
        variant: !currentAppSettings.detail ? "outline" : ("default" as const),
        className: "text-xs font-semibold",
        onClick: () => {
          updateAppSettings("prompt-library", {
            detail: !currentAppSettings.detail,
          });
        },
      },
    ];

    if (prompt && prompt.status === "active") {
      return [
        ...optimizeButtons,
        {
          id: "unpublish",
          label: "Unpublish",
          icon: <XCircle className="w-4 h-4" />,
          variant: "destructive" as const,
          className: "text-xs font-semibold",
          dialog: {
            id: "unpublish-prompt",
            data: {
              libraryId: prompt._id,
            },
          },
        },
      ];
    }

    if (
      (prompt && prompt.status === "archived") ||
      prompt?.status === "draft"
    ) {
      return [
        ...optimizeButtons,
        {
          id: "publish",
          label: isPublishing ? "Publishing..." : "Publish",
          icon: isPublishing ? (
            <Loader2
              className="w-4 h-4"
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : (
            <Send className="w-4 h-4" />
          ),
          variant: "accent" as const,
          className: "text-xs font-semibold",
          onClick: handlePublish,
          disabled: isPublishing || isAutoSaving,
        },
      ];
    }

    return optimizeButtons;
  }, [
    prompt,
    hasUnsavedChanges,
    isSubmitting,
    isPublishing,
    handleManualSave,
    handlePublish,
    currentAppSettings.detail,
    updateAppSettings,
    isAutoSaving,
    lastSavedTime,
    createNewPromptLibrary,
  ]);

  // Memoize handlers to prevent unnecessary re-renders
  const handleOptimizePrompt = useCallback(async () => {
    if (!prompt) {
      toast({
        title: "Error",
        description: "No prompt selected",
        variant: "destructive",
      });
      return;
    }

    const formData = form.getValues();
    if (!formData.originalPrompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt to optimize",
        variant: "destructive",
      });
      return;
    }

    if (!selectedOptimizePrompt) {
      toast({
        title: "Error",
        description: "Please select an optimization strategy",
        variant: "destructive",
      });
      return;
    }

    loading.startLoading("optimizing");
    try {
      setOptimizedPromptStream(null);
      form.setValue("optimizedPrompt", "");

      const stream = await OptimizePromptService(
        prompt._id,
        formData.originalPrompt,
        selectedOptimizePrompt.id
      );

      setOptimizedPromptStream(stream);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to optimize prompt. Please try again.",
        variant: "destructive",
      });
    } finally {
      loading.stopLoading("optimizing");
    }
  }, [prompt, selectedOptimizePrompt, loading, toast, form]);

  // New function that returns streams directly without consuming them
  const getTestStreams = useCallback(async () => {
    const formData = form.getValues();
    if (!formData.testPrompt?.trim()) {
      toast({
        title: "Error",
        description: "Please enter test content first",
        variant: "destructive",
      });
      return { originalStream: null, optimizedStream: null };
    }

    try {
      // Get the streams - await them to get the AsyncGenerator
      const originalStream = await BasicChatService(
        [
          {
            role: "system",
            content: formData.originalPrompt,
          },
          {
            role: "user",
            content: formData.testPrompt,
          },
        ],
        "gpt-4o-mini"
      );
      const optimizedStream = await BasicChatService(
        [
          {
            role: "system",
            content: formData.optimizedPrompt || "",
          },
          {
            role: "user",
            content: formData.testPrompt,
          },
        ],
        "gpt-4o-mini"
      );

      return { originalStream, optimizedStream };
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get test streams. Please try again.",
        variant: "destructive",
      });
      return { originalStream: null, optimizedStream: null };
    }
  }, [form, toast]);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Copied!",
          description: `Copied to clipboard`,
        });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to copy to clipboard",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const deletePrompt = useCallback(
    async (promptId: string) => {
      try {
        const response = await deletePromptService(promptId);
        if (response.success) {
          setPrompt(null);
          setInitialPrompt(null);
          setSelectedOptimizePrompt(null);
          setOptimizePromptsTemp([]);
          setUiState({
            editingVariable: null,
            newVariableName: "",
            showAddVariableForm: false,
            newMessageRole: "user",
            newMessageContent: "",
            showAddMessageForm: false,
            editingMessage: null,
            editMessageContent: "",
            editMessageRole: "user",
          });
        } else {
          throw new Error(response.message || "Failed to delete prompt");
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete prompt. Please try again.",
          variant: "destructive",
        });
      }
    },
    [toast, setInitialPrompt]
  );

  const updatePrompt = useCallback(
    (updates: Partial<Prompt>) => {
      setPrompt((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...updates,
        };
      });
    },
    [setPrompt]
  );

  const updatePromptUIState = useCallback(
    (uiState: Partial<PromptUIState>) => {
      setUiState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...uiState,
        };
      });
    },
    [setUiState]
  );

  // Add new message to history
  const addMessageToHistory = useCallback(
    (message: Message) => {
      if (!prompt) return;

      const newMessage: Message = {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: Date.now(),
        display: true,
      };

      const currentHistory = form.getValues("relatedHistory") || [];
      const updatedHistory = [
        ...currentHistory.map((msg) => ({ ...msg, display: true })),
        {
          ...newMessage,
          timestamp: newMessage.timestamp || Date.now(),
          display: true,
        },
      ];

      form.setValue("relatedHistory", updatedHistory, { shouldDirty: true });

      // Clear the form
      updatePromptUIState({
        newMessageContent: "",
        showAddMessageForm: false,
      });
    },
    [prompt, form, updatePromptUIState]
  );

  const fetchOptimizePrompts = useCallback(async () => {
    try {
      const prompts = await getAllOptimizePrompt();

      if (prompts.success && prompts.data && prompts.data.length > 0) {
        setOptimizePromptsTemp(prompts.data);
        setSelectedOptimizePrompt(prompts.data[0]);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch optimize prompts. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (prompt) {
    const buttons = createHeaderButtons();
      updatePlaygroundHeaderButtons(buttons);
    }
  }, [
    prompt,
    hasUnsavedChanges,
    isSubmitting,
    isPublishing,
    createHeaderButtons,
    updatePlaygroundHeaderButtons,
  ]);

  // Sync prompt when prompt changes and update form
  const lastLoadedPromptIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialPrompt) return;

    // Always keep provider prompt in sync
    setPrompt(initialPrompt);

    const isNewPrompt = lastLoadedPromptIdRef.current !== initialPrompt._id;

    // Only reset form when switching to a different prompt,
    // or when the form is not dirty (prevents clobbering user typing)
    if (isNewPrompt || !form.formState.isDirty) {
      form.reset({
        promptName: initialPrompt.promptName || "",
        promptDescription: initialPrompt.promptDescription || "",
        promptCategory: initialPrompt.promptCategory || "",
        promptImage: initialPrompt.promptImage || "",
        author: initialPrompt.author || "",
        originalPrompt: initialPrompt.originalPrompt || "",
        optimizedPrompt: initialPrompt.optimizedPrompt || "",
        testPrompt: initialPrompt.testPrompt || "",
        variables: initialPrompt.variables || [],
        relatedHistory: initialPrompt.relatedHistory || [],
      });
      lastLoadedPromptIdRef.current = initialPrompt._id as unknown as string;

      // Suppress autosave briefly after switching prompts to avoid immediate autosave
      if (isNewPrompt) {
        suppressAutoSaveRef.current = true;
        if (suppressTimerRef.current) {
          clearTimeout(suppressTimerRef.current);
        }
        suppressTimerRef.current = setTimeout(() => {
          suppressAutoSaveRef.current = false;
        }, 1000);
      }
    }
  }, [initialPrompt, form]);

  // Auto-save effect
  useEffect(() => {
    if (
      hasUnsavedChanges &&
      prompt?._id &&
      !isAutoSaving &&
      !isSubmitting &&
      !isPublishing &&
      !suppressAutoSaveRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const formData = form.getValues();
        autoSavePrompt(formData);
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [
    hasUnsavedChanges,
    prompt?._id,
    isAutoSaving,
    isSubmitting,
    isPublishing,
    autoSavePrompt,
    form,
  ]);

  useEffect(() => {
    fetchOptimizePrompts();
  }, []);

  const value = useMemo(
    () => ({
      prompt,
      setPrompt,
      optimizedPromptStream,
      setOptimizedPromptStream,
      selectedOptimizePrompt,
      setSelectedOptimizePrompt,
      optimizePromptsTemp,
      handleOptimizePrompt,
      getTestStreams,
      copyToClipboard,
      hasUnsavedChanges,
      handleManualSave,
      handlePublish,
      lastSavedTime,
      uiState,
      setUiState,
      isAutoSaving,
      addMessageToHistory,
      updatePrompt,
      updatePromptUIState,
      deletePrompt,
      // Form related
      form,
      isSubmitting,
      isPublishing,
    }),
    [
      prompt,
      setPrompt,
      optimizedPromptStream,
      setOptimizedPromptStream,
      selectedOptimizePrompt,
      setSelectedOptimizePrompt,
      optimizePromptsTemp,
      handleOptimizePrompt,
      getTestStreams,
      copyToClipboard,
      hasUnsavedChanges,
      handleManualSave,
      handlePublish,
      lastSavedTime,
      isAutoSaving,
      uiState,
      setUiState,
      addMessageToHistory,
      updatePrompt,
      updatePromptUIState,
      form,
      isSubmitting,
      isPublishing,
      deletePrompt,
    ]
  );

  return (
    <OptimizeContext.Provider value={value}>
      {children}
    </OptimizeContext.Provider>
  );
};
