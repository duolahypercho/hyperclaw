// Export the new HyperchoCopilotClient
export { CopanionClient } from "./CopanionClient";
export type { CopanionClientOptions } from "./CopanionClient";
export * from "./types";
export {
  convertMessagesToApiFormat,
  convertApiOutputToMessages,
  filterAdjacentAgentStateMessages,
  filterAgentStateMessages,
  loadMessagesFromJsonRepresentation,
} from "./conversion";
