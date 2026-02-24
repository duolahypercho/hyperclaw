export enum GuardrailsResultStatus {
  ALLOWED = "allowed",
  DENIED = "denied",
}

export interface GuardrailsResult {
  status: GuardrailsResultStatus;
  reason?: string;
}
