// Hypercho version constant - should be updated to match your actual version
const HYPERCHO_VERSION = "1.0.0";

export enum Severity {
  CRITICAL = "critical", // Critical errors that block core functionality
  WARNING = "warning", // Configuration/setup issues that need attention
  INFO = "info", // General errors and network issues
}

export enum ErrorVisibility {
  BANNER = "banner", // Critical errors shown as fixed banners
  TOAST = "toast", // Regular errors shown as dismissible toasts
  SILENT = "silent", // Errors logged but not shown to user
  DEV_ONLY = "dev_only", // Errors only shown in development mode
}

export const ERROR_NAMES = {
  HYPERCHO_ERROR: "HyperchoError",
  HYPERCHO_API_DISCOVERY_ERROR: "HyperchoApiDiscoveryError",
  HYPERCHO_REMOTE_ENDPOINT_DISCOVERY_ERROR:
    "HyperchoRemoteEndpointDiscoveryError",
  HYPERCHO_AGENT_DISCOVERY_ERROR: "HyperchoAgentDiscoveryError",
  HYPERCHO_LOW_LEVEL_ERROR: "HyperchoLowLevelError",
  HYPERCHO_VERSION_MISMATCH_ERROR: "HyperchoVersionMismatchError",
  RESOLVED_HYPERCHO_ERROR: "ResolvedHyperchoError",
  CONFIGURATION_ERROR: "ConfigurationError",
  MISSING_API_KEY_ERROR: "MissingApiKeyError",
  UPGRADE_REQUIRED_ERROR: "UpgradeRequiredError",
  AUTHENTICATION_ERROR: "AuthenticationError",
  AUTHORIZATION_ERROR: "AuthorizationError",
  RATE_LIMIT_ERROR: "RateLimitError",
  VALIDATION_ERROR: "ValidationError",
  OPERATION_ERROR: "OperationError",
} as const;

// Banner errors - critical configuration/discovery issues
export const BANNER_ERROR_NAMES = [
  ERROR_NAMES.CONFIGURATION_ERROR,
  ERROR_NAMES.MISSING_API_KEY_ERROR,
  ERROR_NAMES.UPGRADE_REQUIRED_ERROR,
  ERROR_NAMES.HYPERCHO_API_DISCOVERY_ERROR,
  ERROR_NAMES.HYPERCHO_REMOTE_ENDPOINT_DISCOVERY_ERROR,
  ERROR_NAMES.HYPERCHO_AGENT_DISCOVERY_ERROR,
  ERROR_NAMES.AUTHENTICATION_ERROR,
  ERROR_NAMES.AUTHORIZATION_ERROR,
];

export enum HyperchoErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  NOT_FOUND = "NOT_FOUND",
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  API_NOT_FOUND = "API_NOT_FOUND",
  REMOTE_ENDPOINT_NOT_FOUND = "REMOTE_ENDPOINT_NOT_FOUND",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  OPERATION_ERROR = "OPERATION_ERROR",
  MISUSE = "MISUSE",
  UNKNOWN = "UNKNOWN",
  VERSION_MISMATCH = "VERSION_MISMATCH",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  MISSING_API_KEY_ERROR = "MISSING_API_KEY_ERROR",
  UPGRADE_REQUIRED_ERROR = "UPGRADE_REQUIRED_ERROR",
  EMPTY_MESSAGES = "EMPTY_MESSAGES",
}

const BASE_URL = "https://docs.hypercho.ai";

const getSeeMoreMarkdown = (link: string) => `See more: [${link}](${link})`;

export const ERROR_CONFIG = {
  [HyperchoErrorCode.NETWORK_ERROR]: {
    statusCode: 503,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#network-errors`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.NOT_FOUND]: {
    statusCode: 404,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#not-found-errors`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.AGENT_NOT_FOUND]: {
    statusCode: 500,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#agent-not-found-error`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.API_NOT_FOUND]: {
    statusCode: 404,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#api-not-found-error`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.REMOTE_ENDPOINT_NOT_FOUND]: {
    statusCode: 404,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#remote-endpoint-not-found-error`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.AUTHENTICATION_ERROR]: {
    statusCode: 401,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#authentication-errors`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.AUTHORIZATION_ERROR]: {
    statusCode: 403,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#authorization-errors`,
    visibility: ErrorVisibility.BANNER,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.RATE_LIMIT_ERROR]: {
    statusCode: 429,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#rate-limit-errors`,
    visibility: ErrorVisibility.TOAST,
    severity: Severity.WARNING,
  },
  [HyperchoErrorCode.VALIDATION_ERROR]: {
    statusCode: 400,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#validation-errors`,
    visibility: ErrorVisibility.TOAST,
    severity: Severity.WARNING,
  },
  [HyperchoErrorCode.OPERATION_ERROR]: {
    statusCode: 500,
    troubleshootingUrl: `${BASE_URL}/troubleshooting/common-issues#operation-errors`,
    visibility: ErrorVisibility.TOAST,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.MISUSE]: {
    statusCode: 400,
    troubleshootingUrl: null,
    visibility: ErrorVisibility.DEV_ONLY,
    severity: Severity.WARNING,
  },
  [HyperchoErrorCode.UNKNOWN]: {
    statusCode: 500,
    visibility: ErrorVisibility.TOAST,
    severity: Severity.CRITICAL,
  },
  [HyperchoErrorCode.CONFIGURATION_ERROR]: {
    statusCode: 400,
    troubleshootingUrl: null,
    severity: Severity.WARNING,
    visibility: ErrorVisibility.BANNER,
  },
  [HyperchoErrorCode.MISSING_API_KEY_ERROR]: {
    statusCode: 400,
    troubleshootingUrl: null,
    severity: Severity.CRITICAL,
    visibility: ErrorVisibility.BANNER,
  },
  [HyperchoErrorCode.UPGRADE_REQUIRED_ERROR]: {
    statusCode: 402,
    troubleshootingUrl: null,
    severity: Severity.WARNING,
    visibility: ErrorVisibility.BANNER,
  },
  [HyperchoErrorCode.VERSION_MISMATCH]: {
    statusCode: 400,
    troubleshootingUrl: null,
    visibility: ErrorVisibility.DEV_ONLY,
    severity: Severity.INFO,
  },
  [HyperchoErrorCode.EMPTY_MESSAGES]: {
    statusCode: 400,
    troubleshootingUrl: null,
    severity: Severity.WARNING,
    visibility: ErrorVisibility.BANNER,
  },
};

export class HyperchoError extends Error {
  code: HyperchoErrorCode;
  statusCode: number;
  severity?: Severity;
  visibility: ErrorVisibility;
  troubleshootingUrl?: string | null;
  originalError?: {
    message: string;
    stack?: string;
  };

  constructor({
    message = "Unknown error occurred",
    code,
    severity,
    visibility,
  }: {
    message?: string;
    code: HyperchoErrorCode;
    severity?: Severity;
    visibility?: ErrorVisibility;
  }) {
    const name = ERROR_NAMES.HYPERCHO_ERROR;
    const config = ERROR_CONFIG[code];
    const { statusCode } = config;
    const resolvedVisibility =
      visibility ?? config.visibility ?? ErrorVisibility.TOAST;
    const resolvedSeverity =
      severity ?? ("severity" in config ? config.severity : undefined);

    super(message);

    this.name = name;
    this.code = code;
    this.statusCode = statusCode;
    this.severity = resolvedSeverity;
    this.visibility = resolvedVisibility;
    this.troubleshootingUrl =
      "troubleshootingUrl" in config ? config.troubleshootingUrl : null;
    this.originalError = {
      message,
      stack: new Error().stack,
    };

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HyperchoError);
    }
  }
}

/**
 * Error thrown when we can identify wrong usage of our components.
 * This helps us notify the developer before real errors can happen
 *
 * @extends HyperchoError
 */
export class HyperchoMisuseError extends HyperchoError {
  constructor({
    message,
    code = HyperchoErrorCode.MISUSE,
  }: {
    message: string;
    code?: HyperchoErrorCode;
  }) {
    const docsLink =
      "troubleshootingUrl" in ERROR_CONFIG[code] &&
      ERROR_CONFIG[code].troubleshootingUrl
        ? getSeeMoreMarkdown(ERROR_CONFIG[code].troubleshootingUrl as string)
        : null;
    const finalMessage = docsLink ? `${message}.\n\n${docsLink}` : message;
    super({ message: finalMessage, code });
    this.name = ERROR_NAMES.HYPERCHO_API_DISCOVERY_ERROR;
  }
}

const getVersionMismatchErrorMessage = ({
  frontendVersion,
  backendVersion,
  apiVersion,
}: VersionMismatchResponse) =>
  `Version mismatch detected: Hypercho backend@${
    backendVersion ?? ""
  } is not compatible with Hypercho frontend@${frontendVersion} and Hypercho API@${apiVersion}. Please ensure all installed Hypercho packages are on the same version.`;
/**
 * Error thrown when Hypercho versions do not match
 *
 * @extends HyperchoError
 */
export class HyperchoVersionMismatchError extends HyperchoError {
  constructor({
    frontendVersion,
    backendVersion,
    apiVersion,
  }: VersionMismatchResponse) {
    const code = HyperchoErrorCode.VERSION_MISMATCH;
    super({
      message: getVersionMismatchErrorMessage({
        frontendVersion,
        backendVersion,
        apiVersion,
      }),
      code,
    });
    this.name = ERROR_NAMES.HYPERCHO_VERSION_MISMATCH_ERROR;
  }
}

/**
 * Error thrown when the Hypercho API endpoint cannot be discovered or accessed.
 * This typically occurs when:
 * - The API endpoint URL is invalid or misconfigured
 * - The API service is not running at the expected location
 * - There are network/firewall issues preventing access
 *
 * @extends HyperchoError
 */
export class HyperchoApiDiscoveryError extends HyperchoError {
  constructor(
    params: {
      message?: string;
      code?:
        | HyperchoErrorCode.API_NOT_FOUND
        | HyperchoErrorCode.REMOTE_ENDPOINT_NOT_FOUND;
      url?: string;
    } = {}
  ) {
    const url = params.url ?? "";
    let operationSuffix = "";
    if (url?.includes("/info")) operationSuffix = `when fetching Hypercho info`;
    else if (url.includes("/actions/execute"))
      operationSuffix = `when attempting to execute actions.`;
    else if (url.includes("/agents/state"))
      operationSuffix = `when attempting to get agent state.`;
    else if (url.includes("/agents/execute"))
      operationSuffix = `when attempting to execute agent(s).`;
    else if (url.includes("/auth"))
      operationSuffix = `when attempting to authenticate.`;
    else if (url.includes("/users"))
      operationSuffix = `when attempting to access user data.`;
    const message =
      params.message ??
      (params.url
        ? `Failed to find Hypercho API endpoint at url ${params.url} ${operationSuffix}`
        : `Failed to find Hypercho API endpoint.`);
    const code = params.code ?? HyperchoErrorCode.API_NOT_FOUND;
    const errorMessage = `${message}.\n\n${getSeeMoreMarkdown(
      ERROR_CONFIG[code].troubleshootingUrl
    )}`;
    super({ message: errorMessage, code });
    this.name = ERROR_NAMES.HYPERCHO_API_DISCOVERY_ERROR;
  }
}

/**
 * This error is used for endpoints specified in runtime's remote endpoints. If they cannot be contacted
 * This typically occurs when:
 * - The API endpoint URL is invalid or misconfigured
 * - The API service is not running at the expected location
 *
 * @extends HyperchoApiDiscoveryError
 */
export class HyperchoRemoteEndpointDiscoveryError extends HyperchoApiDiscoveryError {
  constructor(params?: { message?: string; url?: string }) {
    const message =
      params?.message ??
      (params?.url
        ? `Failed to find or contact remote endpoint at url ${params.url}`
        : "Failed to find or contact remote endpoint");
    const code = HyperchoErrorCode.REMOTE_ENDPOINT_NOT_FOUND;
    super({ message, code });
    this.name = ERROR_NAMES.HYPERCHO_REMOTE_ENDPOINT_DISCOVERY_ERROR;
  }
}

/**
 * Error thrown when a Hypercho AI agent cannot be found or accessed.
 * This typically occurs when:
 * - The specified agent name does not exist in the deployment
 * - The agent configuration is invalid or missing
 * - The agent service is not properly deployed or initialized
 *
 * @extends HyperchoError
 */
export class HyperchoAgentDiscoveryError extends HyperchoError {
  constructor(params: {
    agentName?: string;
    availableAgents: { name: string; id: string }[];
  }) {
    const { agentName, availableAgents } = params;
    const code = HyperchoErrorCode.AGENT_NOT_FOUND;

    const seeMore = getSeeMoreMarkdown(ERROR_CONFIG[code].troubleshootingUrl);
    let message;

    if (availableAgents.length) {
      const agentList = availableAgents.map((agent) => agent.name).join(", ");

      if (agentName) {
        message = `Agent '${agentName}' was not found. Available agents are: ${agentList}. Please verify the agent name in your configuration and ensure it matches one of the available agents.\n\n${seeMore}`;
      } else {
        message = `The requested agent was not found. Available agents are: ${agentList}. Please verify the agent name in your configuration and ensure it matches one of the available agents.\n\n${seeMore}`;
      }
    } else {
      message = `${
        agentName ? `Agent '${agentName}'` : "The requested agent"
      } was not found. Please set up at least one agent before proceeding. ${seeMore}`;
    }

    super({ message, code });
    this.name = ERROR_NAMES.HYPERCHO_AGENT_DISCOVERY_ERROR;
  }
}

/**
 * Handles low-level networking errors that occur before a request reaches the server.
 * These errors arise from issues in the underlying communication infrastructure rather than
 * application-level logic or server responses. Typically used to handle "fetch failed" errors
 * where no HTTP status code is available.
 *
 * Common scenarios include:
 * - Connection failures (ECONNREFUSED) when server is down/unreachable
 * - DNS resolution failures (ENOTFOUND) when domain can't be resolved
 * - Timeouts (ETIMEDOUT) when request takes too long
 * - Protocol/transport layer errors like SSL/TLS issues
 */
export class HyperchoLowLevelError extends HyperchoError {
  constructor({
    error,
    url,
    message,
  }: {
    error: Error;
    url: string;
    message?: string;
  }) {
    let code = HyperchoErrorCode.NETWORK_ERROR;

    // @ts-expect-error -- code may exist
    const errorCode = error.code as string;
    const errorMessage =
      message ?? resolveLowLevelErrorMessage({ errorCode, url });

    super({ message: errorMessage, code });

    this.name = ERROR_NAMES.HYPERCHO_LOW_LEVEL_ERROR;
  }
}

/**
 * Generic catch-all error handler for HTTP responses from the Hypercho API where a status code is available.
 * Used when we receive an HTTP error status and wish to handle broad range of them
 *
 * This differs from HyperchoLowLevelError in that:
 * - ResolvedHyperchoError: Server was reached and returned an HTTP status
 * - HyperchoLowLevelError: Error occurred before reaching server (e.g. network failure)
 *
 * @param status - The HTTP status code received from the API response
 * @param message - Optional error message to include
 * @param code - Optional specific HyperchoErrorCode to override default behavior
 *
 * Default behavior:
 * - 400 Bad Request: Maps to HyperchoApiDiscoveryError
 * - 401 Unauthorized: Maps to AuthenticationError
 * - 403 Forbidden: Maps to AuthorizationError
 * - 429 Too Many Requests: Maps to RateLimitError
 * - All other status codes: Maps to UNKNOWN error code if no specific code provided
 */
export class ResolvedHyperchoError extends HyperchoError {
  constructor({
    status,
    message,
    code,
    isRemoteEndpoint,
    url,
  }: {
    status: number;
    message?: string;
    code?: HyperchoErrorCode;
    isRemoteEndpoint?: boolean;
    url?: string;
  }) {
    let resolvedCode = code;
    if (!resolvedCode) {
      switch (status) {
        case 400:
          throw new HyperchoApiDiscoveryError({ message, url });
        case 401:
          resolvedCode = HyperchoErrorCode.AUTHENTICATION_ERROR;
          break;
        case 403:
          resolvedCode = HyperchoErrorCode.AUTHORIZATION_ERROR;
          break;
        case 404:
          throw isRemoteEndpoint
            ? new HyperchoRemoteEndpointDiscoveryError({ message, url })
            : new HyperchoApiDiscoveryError({ message, url });
        case 429:
          resolvedCode = HyperchoErrorCode.RATE_LIMIT_ERROR;
          break;
        default:
          resolvedCode = HyperchoErrorCode.UNKNOWN;
          break;
      }
    }

    super({ message, code: resolvedCode });
    this.name = ERROR_NAMES.RESOLVED_HYPERCHO_ERROR;
  }
}

export class ConfigurationError extends HyperchoError {
  constructor(message: string) {
    super({ message, code: HyperchoErrorCode.CONFIGURATION_ERROR });
    this.name = ERROR_NAMES.CONFIGURATION_ERROR;
    this.severity = Severity.WARNING;
  }
}

export class MissingApiKeyError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = ERROR_NAMES.MISSING_API_KEY_ERROR;
    this.severity = Severity.CRITICAL;
  }
}

export class UpgradeRequiredError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = ERROR_NAMES.UPGRADE_REQUIRED_ERROR;
    this.severity = Severity.WARNING;
  }
}

export class AuthenticationError extends HyperchoError {
  constructor(message: string) {
    super({ message, code: HyperchoErrorCode.AUTHENTICATION_ERROR });
    this.name = ERROR_NAMES.AUTHENTICATION_ERROR;
    this.severity = Severity.CRITICAL;
  }
}

export class AuthorizationError extends HyperchoError {
  constructor(message: string) {
    super({ message, code: HyperchoErrorCode.AUTHORIZATION_ERROR });
    this.name = ERROR_NAMES.AUTHORIZATION_ERROR;
    this.severity = Severity.CRITICAL;
  }
}

export class RateLimitError extends HyperchoError {
  constructor(message: string) {
    super({ message, code: HyperchoErrorCode.RATE_LIMIT_ERROR });
    this.name = ERROR_NAMES.RATE_LIMIT_ERROR;
    this.severity = Severity.WARNING;
  }
}

export class ValidationError extends HyperchoError {
  constructor(message: string) {
    super({ message, code: HyperchoErrorCode.VALIDATION_ERROR });
    this.name = ERROR_NAMES.VALIDATION_ERROR;
    this.severity = Severity.WARNING;
  }
}

export class OperationError extends HyperchoError {
  constructor(message: string) {
    super({ message, code: HyperchoErrorCode.OPERATION_ERROR });
    this.name = ERROR_NAMES.OPERATION_ERROR;
    this.severity = Severity.CRITICAL;
  }
}

/**
 * Checks if an error is already a structured Hypercho error.
 * This utility centralizes the logic for detecting structured errors across the codebase.
 *
 * @param error - The error to check
 * @returns true if the error is already structured, false otherwise
 */
export function isStructuredHyperchoError(error: any): boolean {
  return (
    error instanceof HyperchoError ||
    error instanceof HyperchoLowLevelError ||
    (error?.name && error.name.includes("Hypercho")) ||
    error?.code !== undefined // Check if it has our structured error properties
  );
}

/**
 * Returns the error as-is if it's already structured, otherwise converts it using the provided converter function.
 * This utility centralizes the pattern of preserving structured errors while converting unstructured ones.
 *
 * @param error - The error to process
 * @param converter - Function to convert unstructured errors to structured ones
 * @returns The structured error
 */
export function ensureStructuredError<T extends HyperchoError>(
  error: any,
  converter: (error: any) => T
): T | any {
  return isStructuredHyperchoError(error) ? error : converter(error);
}

interface VersionMismatchResponse {
  backendVersion?: string;
  apiVersion: string;
  frontendVersion: string;
}

export async function getPossibleVersionMismatch({
  backendVersion,
  apiVersion,
}: {
  backendVersion?: string;
  apiVersion: string;
}) {
  if (!backendVersion || backendVersion === "" || !apiVersion) return;
  if (
    HYPERCHO_VERSION !== backendVersion ||
    HYPERCHO_VERSION !== apiVersion ||
    backendVersion !== apiVersion
  ) {
    return {
      backendVersion,
      apiVersion,
      frontendVersion: HYPERCHO_VERSION,
      message: getVersionMismatchErrorMessage({
        backendVersion,
        apiVersion,
        frontendVersion: HYPERCHO_VERSION,
      }),
    };
  }

  return;
}

const resolveLowLevelErrorMessage = ({
  errorCode,
  url,
}: {
  errorCode?: string;
  url: string;
}) => {
  const troubleshootingLink =
    ERROR_CONFIG[HyperchoErrorCode.NETWORK_ERROR].troubleshootingUrl;
  const genericMessage = (
    description = `Failed to fetch from url ${url}.`
  ) => `${description}.

Possible reasons:
- The server may have an error preventing it from returning a response (Check the server logs for more info).
- The server might be down or unreachable
- There might be a network issue (e.g., DNS failure, connection timeout) 
- The URL might be incorrect
- The server is not running on the specified port

${getSeeMoreMarkdown(troubleshootingLink)}`;

  if (url.includes("/info"))
    return genericMessage(
      `Failed to fetch Hypercho agents/action information from url ${url}.`
    );
  if (url.includes("/actions/execute"))
    return genericMessage(`Fetch call to ${url} to execute actions failed.`);
  if (url.includes("/agents/state"))
    return genericMessage(`Fetch call to ${url} to get agent state failed.`);
  if (url.includes("/agents/execute"))
    return genericMessage(`Fetch call to ${url} to execute agent(s) failed.`);
  if (url.includes("/auth"))
    return genericMessage(`Fetch call to ${url} to authenticate failed.`);
  if (url.includes("/users"))
    return genericMessage(`Fetch call to ${url} to access user data failed.`);

  switch (errorCode) {
    case "ECONNREFUSED":
      return `Connection to ${url} was refused. Ensure the server is running and accessible.\n\n${getSeeMoreMarkdown(
        troubleshootingLink
      )}`;
    case "ENOTFOUND":
      return `The server on ${url} could not be found. Check the URL or your network configuration.\n\n${getSeeMoreMarkdown(
        ERROR_CONFIG[HyperchoErrorCode.NOT_FOUND].troubleshootingUrl
      )}`;
    case "ETIMEDOUT":
      return `The connection to ${url} timed out. The server might be overloaded or taking too long to respond.\n\n${getSeeMoreMarkdown(
        troubleshootingLink
      )}`;
    default:
      return;
  }
};

// Additional utility functions for Hypercho error handling

/**
 * Creates a standardized error response for API endpoints
 * @param error - The error to convert
 * @returns A standardized error response object
 */
export function createErrorResponse(error: any) {
  if (isStructuredHyperchoError(error)) {
    return {
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        severity: error.severity,
        visibility: error.visibility,
        troubleshootingUrl: error.troubleshootingUrl,
      },
    };
  }

  // Handle unstructured errors
  return {
    error: {
      name: "UnknownError",
      code: HyperchoErrorCode.UNKNOWN,
      message: error?.message || "An unexpected error occurred",
      statusCode: 500,
      severity: Severity.CRITICAL,
      visibility: ErrorVisibility.TOAST,
    },
  };
}

/**
 * Determines if an error should be shown to the user based on visibility and environment
 * @param error - The error to check
 * @param isDevelopment - Whether the app is in development mode
 * @returns true if the error should be shown to the user
 */
export function shouldShowErrorToUser(
  error: any,
  isDevelopment = false
): boolean {
  if (!isStructuredHyperchoError(error)) {
    return true; // Show unknown errors
  }

  switch (error.visibility) {
    case ErrorVisibility.SILENT:
      return false;
    case ErrorVisibility.DEV_ONLY:
      return isDevelopment;
    case ErrorVisibility.BANNER:
    case ErrorVisibility.TOAST:
    default:
      return true;
  }
}

/**
 * Gets the appropriate error display component type based on error visibility
 * @param error - The error to check
 * @returns The display type for the error
 */
export function getErrorDisplayType(error: any): "banner" | "toast" | "none" {
  if (!isStructuredHyperchoError(error)) {
    return "toast";
  }

  switch (error.visibility) {
    case ErrorVisibility.BANNER:
      return "banner";
    case ErrorVisibility.TOAST:
      return "toast";
    case ErrorVisibility.SILENT:
    case ErrorVisibility.DEV_ONLY:
    default:
      return "none";
  }
}

/**
 * Logs an error with appropriate level based on severity
 * @param error - The error to log
 * @param context - Additional context for the error
 */
export function logError(error: any, context?: string) {
  if (!isStructuredHyperchoError(error)) {
    console.error("Unstructured error:", error, context);
    return;
  }

  const logMessage = `[${error.name}] ${error.message}`;
  const fullContext = context
    ? `${logMessage} - Context: ${context}`
    : logMessage;

  switch (error.severity) {
    case Severity.CRITICAL:
      console.error(fullContext, error);
      break;
    case Severity.WARNING:
      console.warn(fullContext, error);
      break;
    case Severity.INFO:
    default:
      console.info(fullContext, error);
      break;
  }
}
