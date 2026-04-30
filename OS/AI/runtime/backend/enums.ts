export enum MessageRole {
  user = "user",
  assistant = "assistant",
  system = "system",
  tool = "tool",
  developer = "developer",
}

export enum CopanionRequestType {
  Chat = "Chat",
  Task = "Task",
  TextareaCompletion = "TextareaCompletion",
  TextareaPopover = "TextareaPopover",
  Suggestion = "Suggestion",
}

export enum ActionInputAvailability {
  disabled = "disabled",
  enabled = "enabled",
  remote = "remote",
}