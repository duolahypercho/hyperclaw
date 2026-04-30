import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  SetStateAction,
} from "react";
import useFlatCategoryStore from "@OS/AI/core/hook/useFlatCategoryStore";
import useTree from "@OS/AI/core/hook/use-tree";
import {
  FrontendAction,
  CoAgentStateRender,
  CopilotChatSuggestionConfiguration,
  CoagentState,
  LangGraphInterruptAction,
  LangGraphInterruptActionSetterArgs,
} from "@OS/AI/types";
import { CopanionkitProps } from "@OS/AI/core/copanionkit-props";
import {
  AuthState,
  ChatComponentsCache,
  CopanionkitApiConfig,
  AgentSession,
  CopanionContext,
} from "@OS/AI/core/context/copanion-context";
import { ExtensionsInput, Agent } from "@OS/AI/runtime";
import { FunctionCallHandler, HyperchoError, randomUUID } from "@OS/AI/shared";
import { flushSync } from "react-dom";
import { shouldShowDevConsole } from "@OS/AI/core/utils";
import { useCopanionRuntimeClient } from "@OS/AI/core/hook";
import {
  MessagesTapProvider,
  CopanionMessages,
} from "@OS/AI/core/copanion-messages";
import { ConsoleTrigger } from "@OS/AI/core/dev-console/console-trigger";
import { UsageBanner } from "@OS/AI/core/components/usage-banner";
import { getErrorActions } from "@OS/AI/core/components/usage-banner";
import { CopanionErrorBoundary } from "@OS/AI/core/components/error-boundary/error-boundary";
import { CopanionActionMode } from "@OS/AI/shared/types/action";

export interface DocumentPointer {
  id: string;
  name: string;
  sourceApplication: string;
  iconImageUri: string;
  getContents: () => string;
}

export const defaultCopanionContextCategories = ["global"];

// Remove the duplicate context definition - we'll use the one from copanion-context.tsx

export function Copanionkit({ children, ...props }: CopanionkitProps) {
  const enabled = shouldShowDevConsole(props.showDevConsole);

  // Use API key if provided, otherwise use the license key
  const publicApiKey = props.publicApiKey;

  return (
    <CopanionErrorBoundary
      publicApiKey={publicApiKey}
      showUsageBanner={enabled}
    >
      <CopanionkitInternalProvider {...props}>
        {children}
      </CopanionkitInternalProvider>
    </CopanionErrorBoundary>
  );
}

// Provider component
export function CopanionkitInternalProvider({
  children,
  ...props
}: CopanionkitProps) {
  const chatApiEndpoint = props.runtimeUrl || "";

  const [actions, setActions] = useState<Record<string, FrontendAction<any>>>(
    {}
  );
  const [copanionActionMode, setCopanionActionMode] =
    useState<CopanionActionMode>(CopanionActionMode.AGENT);
  const [coAgentStateRenders, setCoAgentStateRenders] = useState<
    Record<string, CoAgentStateRender<any>>
  >({});

  const chatComponentsCache = useRef<ChatComponentsCache>({
    actions: {},
    coAgentStateRenders: {},
  });

  const { addElement, removeElement, printTree, getAllElements } = useTree();

  const [isLoading, setIsLoading] = useState(false);
  const [chatInstructions, setChatInstructions] = useState("");
  const [authStates, setAuthStates] = useState<Record<string, AuthState>>({});
  const [extensions, setExtensions] = useState<ExtensionsInput>({});
  const [additionalInstructions, setAdditionalInstructions] = useState<
    string[]
  >([]);

  const {
    addElement: addDocument,
    removeElement: removeDocument,
    allElements: allDocuments,
  } = useFlatCategoryStore<DocumentPointer>();

  // Compute all the functions and properties that we need to pass
  const setAction = useCallback((id: string, action: FrontendAction<any>) => {
    setActions((prevPoints) => {
      return {
        ...prevPoints,
        [id]: action,
      };
    });
  }, []);

  const removeAction = useCallback((id: string) => {
    setActions((prevPoints) => {
      const newPoints = { ...prevPoints };
      delete newPoints[id];
      return newPoints;
    });
  }, []);

  const setCoAgentStateRender = useCallback(
    (id: string, stateRender: CoAgentStateRender<any>) => {
      setCoAgentStateRenders((prevPoints) => {
        return {
          ...prevPoints,
          [id]: stateRender,
        };
      });
    },
    []
  );

  const removeCoAgentStateRender = useCallback((id: string) => {
    setCoAgentStateRenders((prevPoints) => {
      const newPoints = { ...prevPoints };
      delete newPoints[id];
      return newPoints;
    });
  }, []);

  const getContextString = useCallback(
    (documents: DocumentPointer[], categories: string[]) => {
      const documentsString = documents
        .map((document) => {
          return `${document.name} (${
            document.sourceApplication
          }):\n${document.getContents()}`;
        })
        .join("\n\n");

      const nonDocumentStrings = printTree(categories);

      return `${documentsString}\n\n${nonDocumentStrings}`;
    },
    [printTree]
  );

  const addContext = useCallback(
    (
      context: string,
      parentId?: string,
      categories: string[] = defaultCopanionContextCategories
    ) => {
      return addElement(context, categories, parentId);
    },
    [addElement]
  );

  const removeContext = useCallback(
    (id: string) => {
      removeElement(id);
    },
    [removeElement]
  );

  const getAllContext = useCallback(() => {
    return getAllElements();
  }, [getAllElements]);

  const getFunctionCallHandler = useCallback(
    (customEntryPoints?: Record<string, FrontendAction<any>>) => {
      return entryPointsToFunctionCallHandler(
        Object.values(customEntryPoints || actions)
      );
    },
    [actions]
  );

  const getDocumentsContext = useCallback(
    (categories: string[]) => {
      return allDocuments(categories);
    },
    [allDocuments]
  );

  const addDocumentContext = useCallback(
    (
      documentPointer: DocumentPointer,
      categories: string[] = defaultCopanionContextCategories
    ) => {
      return addDocument(documentPointer, categories);
    },
    [addDocument]
  );

  const removeDocumentContext = useCallback(
    (documentId: string) => {
      removeDocument(documentId);
    },
    [removeDocument]
  );

  // get the appropriate copanionApiConfig from the props
  const copanionApiConfig: CopanionkitApiConfig = useMemo(() => {
    return {
      chatApiEndpoint: chatApiEndpoint,
      headers: props.headers || {},
      properties: props.properties || {},
      transcribeAudioUrl: props.transcribeAudioUrl,
      textToSpeechUrl: props.textToSpeechUrl,
      credentials: props.credentials,
      publicApiKey: props.publicApiKey,
    };
  }, [
    chatApiEndpoint,
    props.headers,
    props.properties,
    props.transcribeAudioUrl,
    props.textToSpeechUrl,
    props.credentials,
    props.publicApiKey,
  ]);

  const headers = useMemo(() => {
    const authHeaders = Object.values(authStates || {}).reduce((acc, state) => {
      if (state.status === "authenticated" && state.authHeaders) {
        return {
          ...acc,
          ...Object.entries(state.authHeaders).reduce(
            (headers, [key, value]) => ({
              ...headers,
              [key.startsWith("X-Custom-") ? key : `X-Custom-${key}`]: value,
            }),
            {}
          ),
        };
      }
      return acc;
    }, {});

    return {
      ...(copanionApiConfig.headers || {}),
      ...authHeaders,
    };
  }, [copanionApiConfig.headers, authStates]);

  const runtimeClient = useCopanionRuntimeClient({
    url: copanionApiConfig.chatApiEndpoint,
    headers,
    credentials: copanionApiConfig.credentials,
    showDevConsole: shouldShowDevConsole(props.showDevConsole),
    onError: props.onError,
    publicApiKey: props.publicApiKey,
  });

  const [chatSuggestionConfiguration, setChatSuggestionConfiguration] =
    useState<{
      [key: string]: CopilotChatSuggestionConfiguration;
    }>({});

  const addChatSuggestionConfiguration = useCallback(
    (id: string, suggestion: CopilotChatSuggestionConfiguration) => {
      setChatSuggestionConfiguration((prev) => ({ ...prev, [id]: suggestion }));
    },
    [setChatSuggestionConfiguration]
  );

  const removeChatSuggestionConfiguration = useCallback(
    (id: string) => {
      setChatSuggestionConfiguration((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    },
    [setChatSuggestionConfiguration]
  );

  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [coagentStates, setCoagentStates] = useState<
    Record<string, CoagentState>
  >({});
  const coagentStatesRef = useRef<Record<string, CoagentState>>({});

  const setCoagentStatesWithRef = useCallback(
    (
      value:
        | Record<string, CoagentState>
        | ((prev: Record<string, CoagentState>) => Record<string, CoagentState>)
    ) => {
      const newValue =
        typeof value === "function" ? value(coagentStatesRef.current) : value;
      coagentStatesRef.current = newValue;
      setCoagentStates((prev) => {
        return newValue;
      });
    },
    []
  );

  const hasLoadedInitialData = useRef(false);

  useEffect(() => {
    if (hasLoadedInitialData.current) return;

    // Don't fetch agents if we don't have a publicApiKey yet
    if (!copanionApiConfig.publicApiKey) {
      return;
    }

    const fetchData = async () => {
      try {
        const result = await runtimeClient.availableAgents();
        if (result.data?.agents) {
          setAvailableAgents(result.data.agents);
        }
        hasLoadedInitialData.current = true;
      } catch (error) {
        console.error("❌ Failed to load agents:", error);
        // Don't set hasLoadedInitialData to true on error, so we can retry
        // when the session token becomes available
      }
    };

    void fetchData();
  }, [copanionApiConfig.publicApiKey, runtimeClient]);

  let initialAgentSession: AgentSession | null = null;
  if (props.agent) {
    initialAgentSession = {
      agentName: props.agent,
    };
  }

  const [agentSession, setAgentSession] = useState<AgentSession | null>(
    initialAgentSession
  );

  // Update agentSession when props.agent changes
  useEffect(() => {
    if (props.agent) {
      setAgentSession({
        agentName: props.agent,
      });
    } else {
      setAgentSession(null);
    }
  }, [props.agent]);

  const [internalThreadId, setInternalThreadId] = useState<string>(
    props.threadId || randomUUID()
  );

  const setThreadId = useCallback(
    (value: SetStateAction<string>) => {
      if (props.threadId) {
        throw new Error(
          "Cannot call setThreadId() when threadId is provided via props."
        );
      }
      setInternalThreadId(value);
    },
    [props.threadId]
  );

  // update the internal threadId if the props.threadId changes
  useEffect(() => {
    if (props.threadId !== undefined) {
      setInternalThreadId(props.threadId);
    }
  }, [props.threadId]);

  const [runId, setRunId] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);

  const chatAbortControllerRef = useRef<AbortController | null>(null);

  const showDevConsole = shouldShowDevConsole(props.showDevConsole);

  const [langGraphInterruptAction, _setLangGraphInterruptAction] =
    useState<LangGraphInterruptAction | null>(null);
  const setLangGraphInterruptAction = useCallback(
    (action: LangGraphInterruptActionSetterArgs) => {
      _setLangGraphInterruptAction((prev) => {
        if (prev == null) return action as LangGraphInterruptAction;
        if (action == null) return null;
        let event = prev.event;
        if (action.event) {
          // @ts-ignore
          event = { ...prev.event, ...action.event };
        }
        return { ...prev, ...action, event };
      });
    },
    []
  );
  const removeLangGraphInterruptAction = useCallback((): void => {
    setLangGraphInterruptAction(null);
  }, []);

  const memoizedChildren = useMemo(() => children, [children]);
  const [bannerError, setBannerError] = useState<HyperchoError | null>(null);

  const agentLock = useMemo(() => props.agent ?? null, [props.agent]);

  const forwardedParameters = useMemo(
    () => props.forwardedParameters ?? {},
    [props.forwardedParameters]
  );

  const updateExtensions = useCallback(
    (newExtensions: SetStateAction<ExtensionsInput>) => {
      setExtensions((prev: ExtensionsInput) => {
        const resolved =
          typeof newExtensions === "function"
            ? newExtensions(prev)
            : newExtensions;
        const isSameLength =
          Object.keys(resolved).length === Object.keys(prev).length;
        const isEqual =
          isSameLength &&
          // @ts-ignore
          Object.entries(resolved).every(([key, value]) => prev[key] === value);

        return isEqual ? prev : resolved;
      });
    },
    [setExtensions]
  );

  const updateAuthStates = useCallback(
    (newAuthStates: SetStateAction<Record<string, AuthState>>) => {
      setAuthStates((prev) => {
        const resolved =
          typeof newAuthStates === "function"
            ? newAuthStates(prev)
            : newAuthStates;
        const isSameLength =
          Object.keys(resolved).length === Object.keys(prev).length;
        const isEqual =
          isSameLength &&
          // @ts-ignore
          Object.entries(resolved).every(([key, value]) => prev[key] === value);

        return isEqual ? prev : resolved;
      });
    },
    [setAuthStates]
  );

  const value = useMemo(
    () => ({
      actions,
      chatComponentsCache,
      getFunctionCallHandler,
      setAction,
      removeAction,
      coAgentStateRenders,
      setCoAgentStateRender,
      removeCoAgentStateRender,
      getContextString,
      addContext,
      removeContext,
      getAllContext,
      getDocumentsContext,
      addDocumentContext,
      removeDocumentContext,
      copanionApiConfig,
      isLoading,
      setIsLoading,
      chatSuggestionConfiguration,
      addChatSuggestionConfiguration,
      removeChatSuggestionConfiguration,
      chatInstructions,
      setChatInstructions,
      additionalInstructions,
      setAdditionalInstructions,
      showDevConsole,
      coagentStates,
      setCoagentStates,
      coagentStatesRef,
      copanionActionMode,
      setCopanionActionMode,
      setCoagentStatesWithRef,
      agentSession,
      setAgentSession,
      runtimeClient,
      forwardedParameters,
      agentLock,
      threadId: internalThreadId,
      setThreadId,
      runId,
      setRunId,
      conversationId,
      setConversationId,
      chatAbortControllerRef,
      availableAgents,
      authStates_c: authStates,
      setAuthStates_c: updateAuthStates,
      extensions,
      setExtensions: updateExtensions,
      langGraphInterruptAction,
      setLangGraphInterruptAction,
      removeLangGraphInterruptAction,
      onError: props.onError,
    }),
    [
      actions,
      chatComponentsCache,
      getFunctionCallHandler,
      setAction,
      removeAction,
      coAgentStateRenders,
      setCoAgentStateRender,
      removeCoAgentStateRender,
      getContextString,
      addContext,
      removeContext,
      getAllContext,
      getDocumentsContext,
      addDocumentContext,
      removeDocumentContext,
      copanionApiConfig,
      isLoading,
      setIsLoading,
      copanionActionMode,
      setCopanionActionMode,
      chatSuggestionConfiguration,
      addChatSuggestionConfiguration,
      removeChatSuggestionConfiguration,
      chatInstructions,
      setChatInstructions,
      additionalInstructions,
      setAdditionalInstructions,
      showDevConsole,
      coagentStates,
      setCoagentStates,
      coagentStatesRef,
      setCoagentStatesWithRef,
      agentSession,
      setAgentSession,
      runtimeClient,
      forwardedParameters,
      agentLock,
      internalThreadId,
      setThreadId,
      runId,
      setRunId,
      conversationId,
      setConversationId,
      chatAbortControllerRef,
      availableAgents,
      authStates,
      updateAuthStates,
      extensions,
      updateExtensions,
      langGraphInterruptAction,
      setLangGraphInterruptAction,
      removeLangGraphInterruptAction,
      props.onError,
    ]
  );

  return (
    <CopanionContext.Provider value={value}>
      <MessagesTapProvider>
        <CopanionMessages>
          {memoizedChildren}
          {showDevConsole && <ConsoleTrigger />}
        </CopanionMessages>
      </MessagesTapProvider>
      {bannerError && showDevConsole && (
        <UsageBanner
          severity={bannerError.severity}
          message={bannerError.message}
          onClose={() => setBannerError(null)}
          actions={getErrorActions(bannerError)}
        />
      )}
    </CopanionContext.Provider>
  );
}

// Custom hook to use the context - now using the proper context from copanion-context.tsx
export function useCopanionkit() {
  return useContext(CopanionContext);
}

function entryPointsToFunctionCallHandler(
  actions: FrontendAction<any>[]
): FunctionCallHandler {
  return async ({
    name,
    args,
  }: {
    name: string;
    args: Record<string, any>;
  }) => {
    let actionsByFunctionName: Record<string, FrontendAction<any>> = {};
    for (let action of actions) {
      actionsByFunctionName[action.name] = action;
    }

    const action = actionsByFunctionName[name];
    let result: any = undefined;
    if (action) {
      await new Promise<void>((resolve, reject) => {
        flushSync(async () => {
          try {
            result = await action.handler?.(args);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return result;
  };
}
