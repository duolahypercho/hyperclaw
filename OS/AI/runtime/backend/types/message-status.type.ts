export enum MessageStatusCode {
  Pending = "pending",
  Success = "success",
  Failed = "failed",
}

export interface BaseMessageStatus {
  code: MessageStatusCode;
}

export interface PendingMessageStatus extends BaseMessageStatus {
  code: MessageStatusCode.Pending;
}

export interface SuccessMessageStatus extends BaseMessageStatus {
  code: MessageStatusCode.Success;
}

export interface FailedMessageStatus extends BaseMessageStatus {
  code: MessageStatusCode.Failed;
  reason: string;
}

export type MessageStatus =
  | PendingMessageStatus
  | SuccessMessageStatus
  | FailedMessageStatus;
