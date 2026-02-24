# Hypercho Error Handling System

A comprehensive error handling system designed specifically for the Hypercho AI Operating System. This system provides structured error handling with proper categorization, visibility controls, and user-friendly error messages.

## Features

- **Structured Error Classes**: Pre-defined error types for common scenarios
- **Error Visibility Control**: Control how errors are displayed to users (banner, toast, silent, dev-only)
- **Severity Levels**: Categorize errors by importance (critical, warning, info)
- **Troubleshooting Links**: Automatic inclusion of helpful documentation links
- **Utility Functions**: Helper functions for error handling and display
- **TypeScript Support**: Full type safety and IntelliSense support

## Quick Start

```typescript
import {
  HyperchoError,
  HyperchoErrorCode,
  Severity,
  ErrorVisibility,
} from "./errors";

// Create a basic error
const error = new HyperchoError({
  message: "AI agent failed to respond",
  code: HyperchoErrorCode.OPERATION_ERROR,
  severity: Severity.CRITICAL,
  visibility: ErrorVisibility.BANNER,
});
```

## Error Classes

### Core Error Classes

- **`HyperchoError`**: Base error class for all Hypercho errors
- **`HyperchoApiDiscoveryError`**: API endpoint discovery failures
- **`HyperchoAgentDiscoveryError`**: AI agent not found or inaccessible
- **`HyperchoLowLevelError`**: Network-level errors (connection failures, timeouts)
- **`ResolvedHyperchoError`**: HTTP response errors with status codes

### Specific Error Classes

- **`AuthenticationError`**: Authentication failures (401)
- **`AuthorizationError`**: Authorization failures (403)
- **`RateLimitError`**: Rate limiting (429)
- **`ValidationError`**: Input validation errors (400)
- **`OperationError`**: General operation failures (500)
- **`ConfigurationError`**: Configuration issues
- **`MissingApiKeyError`**: Missing API key
- **`UpgradeRequiredError`**: Version upgrade required
- **`HyperchoVersionMismatchError`**: Version compatibility issues
- **`HyperchoMisuseError`**: Incorrect usage of components

## Error Codes

```typescript
enum HyperchoErrorCode {
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
}
```

## Error Visibility

Control how errors are displayed to users:

- **`BANNER`**: Critical errors shown as fixed banners
- **`TOAST`**: Regular errors shown as dismissible toasts
- **`SILENT`**: Errors logged but not shown to user
- **`DEV_ONLY`**: Errors only shown in development mode

## Error Severity

Categorize errors by importance:

- **`CRITICAL`**: Critical errors that block core functionality
- **`WARNING`**: Configuration/setup issues that need attention
- **`INFO`**: General errors and network issues

## Usage Examples

### Basic Error Creation

```typescript
import {
  HyperchoError,
  HyperchoErrorCode,
  Severity,
  ErrorVisibility,
} from "./errors";

const error = new HyperchoError({
  message: "Failed to connect to AI agent",
  code: HyperchoErrorCode.AGENT_NOT_FOUND,
  severity: Severity.CRITICAL,
  visibility: ErrorVisibility.BANNER,
});
```

### API Error Handling

```typescript
import {
  ResolvedHyperchoError,
  logError,
  shouldShowErrorToUser,
} from "./errors";

try {
  const response = await fetch("/api/hypercho/agents");

  if (!response.ok) {
    throw new ResolvedHyperchoError({
      status: response.status,
      message: await response.text(),
    });
  }
} catch (error) {
  logError(error, "API call to /api/hypercho/agents");

  if (shouldShowErrorToUser(error, process.env.NODE_ENV === "development")) {
    // Show error to user
  }
}
```

### Authentication Error

```typescript
import { AuthenticationError } from "./errors";

const error = new AuthenticationError("Invalid API key provided");
// Automatically sets severity to CRITICAL and visibility to BANNER
```

### Configuration Validation

```typescript
import { MissingApiKeyError, ConfigurationError } from "./errors";

function validateConfig(config: any) {
  if (!config.apiKey) {
    throw new MissingApiKeyError(
      "API key is required for Hypercho integration"
    );
  }

  if (!config.apiUrl) {
    throw new ConfigurationError("API URL is required");
  }
}
```

## Utility Functions

### Error Detection

```typescript
import { isStructuredHyperchoError } from "./errors";

if (isStructuredHyperchoError(error)) {
  console.log("Structured error:", error.code);
} else {
  console.log("Unstructured error:", error.message);
}
```

### Error Conversion

```typescript
import {
  ensureStructuredError,
  HyperchoError,
  HyperchoErrorCode,
} from "./errors";

const structuredError = ensureStructuredError(
  error,
  (err) =>
    new HyperchoError({
      message: err.message || "Unknown error occurred",
      code: HyperchoErrorCode.UNKNOWN,
    })
);
```

### Error Response Creation

```typescript
import { createErrorResponse } from "./errors";

// For API endpoints
const response = createErrorResponse(error);
// Returns standardized error response object
```

### Error Display Control

```typescript
import { shouldShowErrorToUser, getErrorDisplayType } from "./errors";

if (shouldShowErrorToUser(error, isDevelopment)) {
  const displayType = getErrorDisplayType(error);

  switch (displayType) {
    case "banner":
      // Show banner error
      break;
    case "toast":
      // Show toast error
      break;
    case "none":
      // Don't show to user
      break;
  }
}
```

### Error Logging

```typescript
import { logError } from "./errors";

logError(error, "Additional context information");
// Automatically logs with appropriate level based on severity
```

## Error Configuration

Each error type has a configuration that includes:

- **Status Code**: HTTP status code for API responses
- **Troubleshooting URL**: Link to documentation for resolving the error
- **Visibility**: How the error should be displayed
- **Severity**: Importance level of the error

## Best Practices

1. **Use Specific Error Classes**: Use the most specific error class for your scenario
2. **Provide Context**: Include relevant context in error messages
3. **Handle Errors Gracefully**: Always catch and handle errors appropriately
4. **Log Errors**: Use the `logError` utility for consistent logging
5. **Check Visibility**: Use `shouldShowErrorToUser` before displaying errors
6. **Use Structured Errors**: Convert unstructured errors using `ensureStructuredError`

## Integration with React Components

```typescript
import { useEffect, useState } from "react";
import {
  HyperchoError,
  logError,
  shouldShowErrorToUser,
  getErrorDisplayType,
} from "./errors";

function MyComponent() {
  const [error, setError] = useState<HyperchoError | null>(null);

  const handleApiCall = async () => {
    try {
      // API call logic
    } catch (err) {
      const hyperchoError = new HyperchoError({
        message: "Failed to load data",
        code: HyperchoErrorCode.OPERATION_ERROR,
      });

      logError(hyperchoError, "MyComponent API call");
      setError(hyperchoError);
    }
  };

  useEffect(() => {
    if (
      error &&
      shouldShowErrorToUser(error, process.env.NODE_ENV === "development")
    ) {
      const displayType = getErrorDisplayType(error);

      if (displayType === "banner") {
        // Show banner
      } else if (displayType === "toast") {
        // Show toast
      }
    }
  }, [error]);

  return <div>{/* Component JSX */}</div>;
}
```

## Integration with API Routes

```typescript
import { NextApiRequest, NextApiResponse } from "next";
import {
  ResolvedHyperchoError,
  createErrorResponse,
  logError,
  shouldShowErrorToUser,
} from "./errors";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // API logic
  } catch (error) {
    logError(error, `API route: ${req.url}`);

    if (shouldShowErrorToUser(error, process.env.NODE_ENV === "development")) {
      const errorResponse = createErrorResponse(error);
      res.status(errorResponse.error.statusCode).json(errorResponse);
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
```

This error handling system provides a robust foundation for managing errors in the Hypercho AI Operating System, ensuring consistent error handling across all components and providing users with helpful, actionable error messages.
