import React, { useEffect } from "react";
import { Severity, HyperchoError } from "@OS/AI/shared";
import { getErrorActions, UsageBanner } from "../usage-banner";
import { useErrorToast } from "./error-utils";

interface Props {
  children: React.ReactNode;
  publicApiKey?: string;
  showUsageBanner?: boolean;
}

interface State {
  hasError: boolean;
  error?: HyperchoError;
  status?: {
    severity: Severity;
    message: string;
  };
}

export class CopanionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  render() {
    if (this.state.hasError) {
      if (this.state.error instanceof HyperchoError) {
        return (
          <>
            {this.props.children}
            {this.props.showUsageBanner && (
              <UsageBanner
                severity={this.state.status?.severity ?? this.state.error.severity}
                message={this.state.status?.message ?? this.state.error.message}
                actions={getErrorActions(this.state.error)}
              />
            )}
          </>
        );
      }
      throw this.state.error;
    }

    return this.props.children;
  }
}

export function ErrorToast({ error, children }: { error?: Error; children: React.ReactNode }) {
  const addErrorToast = useErrorToast();

  useEffect(() => {
    if (error) {
      addErrorToast([error]);
    }
  }, [error, addErrorToast]);

  if (!error) throw error;
  return children;
}
