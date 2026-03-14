import * as Sentry from "@sentry/nextjs";
import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

const defaultFallback = (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", fontFamily: "system-ui, sans-serif" }}>
    <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Something went wrong</h2>
    <button onClick={() => window.location.reload()} style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: "6px", border: "1px solid #ccc", background: "transparent" }}>
      Reload page
    </button>
  </div>
);

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? defaultFallback;
    }
    return this.props.children;
  }
}
