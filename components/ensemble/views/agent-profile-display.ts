type AgentLike = {
  name?: string;
  title?: string;
  identity?: string;
};

type IdentityLike = {
  name?: string;
  role?: string;
  description?: string;
};

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

export function resolveAgentProfileDisplay(
  agent: AgentLike | undefined,
  identity: IdentityLike | null | undefined,
) {
  return {
    name: cleanText(identity?.name) ?? cleanText(agent?.name) ?? "Agent",
    role: cleanText(identity?.role) ?? cleanText(agent?.title) ?? "",
    description: cleanText(identity?.description) ?? cleanText(agent?.identity) ?? "",
  };
}
