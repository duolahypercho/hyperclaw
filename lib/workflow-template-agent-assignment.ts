import type {
  BridgeWorkflowStep,
} from "$/lib/hyperclaw-bridge-client";
import type {
  WorkflowTemplateAgentBlueprint,
  WorkflowTemplateAgentRequirement,
  WorkflowTemplateSeed,
  WorkflowTemplateStepSeed,
} from "$/lib/workflow-templates";

type TemplateAgentMetadata = Record<string, unknown> | undefined;
type TemplateAgentStepHint = Partial<Pick<
  BridgeWorkflowStep,
  "id" | "name" | "stepType" | "position"
>> & {
  requirementId?: string;
  preferredAgentId?: string;
  assignedAgentId?: string;
  preferredRole?: string;
  metadata?: TemplateAgentMetadata;
};

export interface TemplateAgentDefaults {
  crew: string[];
  leadAgentId: string | null;
  missingAgentIds: string[];
}

export interface TemplateAgentBindingOptions {
  crew: string[];
  leadAgentId?: string | null;
  suggestedRoles?: string[];
  agentAssignments?: Record<string, string>;
  agentRequirements?: WorkflowTemplateAgentRequirement[];
  deliveryChannel?: string;
}

export type TemplateWithAgentHints = {
  metadata?: TemplateAgentMetadata;
  steps?: TemplateAgentStepHint[];
  agentRequirements?: WorkflowTemplateAgentRequirement[];
  suggestedRoles?: string[];
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readString).filter((item): item is string => Boolean(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key, readString(raw)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}

export function readMetadataStringArray(
  metadata: TemplateAgentMetadata,
  key: string,
): string[] {
  return readStringArray(metadata?.[key]);
}

export function collectTemplateAgentIds(template: TemplateWithAgentHints | null | undefined): string[] {
  if (!template) return [];
  const metadata = template.metadata as TemplateAgentMetadata;
  const stepAgentIds = (template.steps ?? []).flatMap((step) => {
    const stepMetadata = step.metadata;
    return [
      readString(step.preferredAgentId),
      readString(step.assignedAgentId),
      readString(stepMetadata?.preferredAgentId),
      readString(stepMetadata?.assignedAgentId),
      ...readStringArray(stepMetadata?.crew),
    ];
  });
  const assignmentIds = Object.values(readStringRecord(metadata?.agentAssignments));

  return uniqueStrings([
    ...readStringArray(metadata?.crew),
    ...readStringArray(metadata?.agentIds),
    ...readStringArray(metadata?.assignedAgentIds),
    ...assignmentIds,
    readString(metadata?.leadAgentId),
    readString(metadata?.preferredAgentId),
    ...stepAgentIds,
  ]);
}

export function getTemplateAgentAssignments(
  template: TemplateWithAgentHints | null | undefined,
): Record<string, string> {
  return readStringRecord(template?.metadata?.agentAssignments);
}

export function getTemplateAgentRequirements(
  template: TemplateWithAgentHints | null | undefined,
): WorkflowTemplateAgentRequirement[] {
  if (!template) return [];
  if (Array.isArray(template.agentRequirements)) {
    return template.agentRequirements;
  }

  const metadata = template.metadata as TemplateAgentMetadata;
  const blueprintMap = isRecord(metadata?.agentBlueprints) ? metadata.agentBlueprints : {};
  const metadataRequirements = readRecordArray(metadata?.agentRequirements);
  if (metadataRequirements.length > 0) {
    return metadataRequirements.map((requirement, index) => {
      const id = readString(requirement.id) ?? `agent-${index + 1}`;
      const blueprint = isRecord(requirement.agentBlueprint)
        ? requirement.agentBlueprint as unknown as WorkflowTemplateAgentBlueprint
        : isRecord(blueprintMap[id])
          ? blueprintMap[id] as unknown as WorkflowTemplateAgentBlueprint
          : undefined;
      const role = readString(requirement.role) ?? readString(blueprint?.role) ?? "Workflow agent";
      const description =
        readString(requirement.description) ??
        readString(blueprint?.description) ??
        "Runs the agent-owned steps in this workflow template.";
      const defaultName =
        readString(requirement.defaultName) ??
        readString(blueprint?.defaultName) ??
        `${role} Agent`;
      return {
        id,
        label: readString(requirement.label) ?? role,
        role,
        description,
        runtime: readString(requirement.runtime) ?? readString(blueprint?.runtime) ?? "openclaw",
        skills: readStringArray(requirement.skills ?? blueprint?.skills),
        defaultName,
        emoji: readString(requirement.emoji) ?? readString(blueprint?.emoji) ?? "🤖",
        prompt: readString(requirement.prompt) ?? readString(blueprint?.prompt) ?? description,
        expectedOutput:
          readString(requirement.expectedOutput) ??
          readString(blueprint?.expectedOutput) ??
          "Completed workflow output.",
        agentBlueprint: {
          defaultName,
          role,
          description,
          runtime: readString(requirement.runtime) ?? readString(blueprint?.runtime) ?? "openclaw",
          emoji: readString(requirement.emoji) ?? readString(blueprint?.emoji) ?? "🤖",
          skills: readStringArray(requirement.skills ?? blueprint?.skills),
          prompt: readString(requirement.prompt) ?? readString(blueprint?.prompt) ?? description,
          expectedOutput:
            readString(requirement.expectedOutput) ??
            readString(blueprint?.expectedOutput) ??
            "Completed workflow output.",
          soulTemplateSlug: readString(blueprint?.soulTemplateSlug) ?? undefined,
          systemPrompt: readString(blueprint?.systemPrompt) ?? undefined,
          soulContent: readString(blueprint?.soulContent) ?? undefined,
          workspaceInstructions: readString(blueprint?.workspaceInstructions) ?? undefined,
          userNotes: readString(blueprint?.userNotes) ?? undefined,
          files: isRecord(blueprint?.files)
            ? Object.fromEntries(
                Object.entries(blueprint.files)
                  .map(([name, content]) => [name, readString(content)] as const)
                  .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
              )
            : undefined,
        },
      };
    });
  }

  const metadataBlueprints = Object.entries(blueprintMap)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]));
  if (metadataBlueprints.length > 0) {
    return metadataBlueprints.map(([id, rawBlueprint]) => {
      const blueprint = rawBlueprint as unknown as WorkflowTemplateAgentBlueprint;
      const role = readString(blueprint.role) ?? "Workflow agent";
      const description =
        readString(blueprint.description) ??
        "Runs the agent-owned steps in this workflow template.";
      const defaultName = readString(blueprint.defaultName) ?? `${role} Agent`;
      return {
        id,
        label: role,
        role,
        description,
        runtime: readString(blueprint.runtime) ?? "openclaw",
        skills: readStringArray(blueprint.skills),
        defaultName,
        emoji: readString(blueprint.emoji) ?? "🤖",
        prompt: readString(blueprint.prompt) ?? description,
        expectedOutput: readString(blueprint.expectedOutput) ?? "Completed workflow output.",
        agentBlueprint: {
          defaultName,
          role,
          description,
          runtime: readString(blueprint.runtime) ?? "openclaw",
          emoji: readString(blueprint.emoji) ?? undefined,
          skills: readStringArray(blueprint.skills),
          prompt: readString(blueprint.prompt) ?? description,
          expectedOutput: readString(blueprint.expectedOutput) ?? "Completed workflow output.",
          soulTemplateSlug: readString(blueprint.soulTemplateSlug) ?? undefined,
          systemPrompt: readString(blueprint.systemPrompt) ?? undefined,
          soulContent: readString(blueprint.soulContent) ?? undefined,
          workspaceInstructions: readString(blueprint.workspaceInstructions) ?? undefined,
          userNotes: readString(blueprint.userNotes) ?? undefined,
          files: isRecord(blueprint.files)
            ? Object.fromEntries(
                Object.entries(blueprint.files)
                  .map(([name, content]) => [name, readString(content)] as const)
                  .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
              )
            : undefined,
        },
      };
    });
  }

  const requirementsById = new Map<string, WorkflowTemplateAgentRequirement>();
  for (const [index, step] of (template.steps ?? []).entries()) {
    if (step.stepType !== "agent_task") continue;
    const metadata = step.metadata as TemplateAgentMetadata;
    const id =
      readString(step.requirementId) ??
      readString(metadata?.requirementId) ??
      `agent-${index + 1}`;
    const role =
      readString(step.preferredRole) ??
      readString(metadata?.preferredRole) ??
      readString(step.name) ??
      "Workflow agent";
    const description =
      readString(metadata?.description) ??
      readString(metadata?.prompt) ??
      "Runs the agent-owned steps in this workflow template.";
    requirementsById.set(id, {
      id,
      label: role,
      role,
      description,
      runtime: readString(metadata?.runtime) ?? "openclaw",
      skills: readStringArray(metadata?.skills),
      defaultName: `${role} Agent`,
      emoji: readString(metadata?.emoji) ?? "🤖",
      prompt: readString(metadata?.prompt) ?? description,
      expectedOutput: readString(metadata?.expectedOutput) ?? "Completed workflow output.",
      agentBlueprint: {
        defaultName: `${role} Agent`,
        role,
        description,
        runtime: readString(metadata?.runtime) ?? "openclaw",
        emoji: readString(metadata?.emoji) ?? "🤖",
        skills: readStringArray(metadata?.skills),
        prompt: readString(metadata?.prompt) ?? description,
        expectedOutput: readString(metadata?.expectedOutput) ?? "Completed workflow output.",
        soulContent: readString(metadata?.soulContent) ?? description,
      },
    });
  }
  return Array.from(requirementsById.values());
}

export function templateHasAgentWorkflow(
  template: TemplateWithAgentHints | null | undefined,
  suggestedRoles: string[] = [],
): boolean {
  if (suggestedRoles.length > 0) return true;
  if (getTemplateAgentRequirements(template).length > 0) return true;
  if (collectTemplateAgentIds(template).length > 0) return true;

  return (template?.steps ?? []).some((step) => {
    const stepMetadata = step.metadata as TemplateAgentMetadata;
    return (
      step.stepType === "agent_task" ||
      Boolean(readString(step.preferredRole)) ||
      readStringArray(stepMetadata?.suggestedRoles).length > 0 ||
      readStringArray(stepMetadata?.roles).length > 0
    );
  });
}

export function resolveTemplateAgentDefaults(
  template: TemplateWithAgentHints | null | undefined,
  availableAgentIds: Iterable<string>,
): TemplateAgentDefaults {
  const available = new Set(availableAgentIds);
  const remembered = collectTemplateAgentIds(template);
  const crew = remembered.filter((id) => available.has(id));
  const metadata = template?.metadata as TemplateAgentMetadata;
  const rememberedLead =
    readString(metadata?.leadAgentId) ??
    template?.steps?.map((step) => readString(step.preferredAgentId)).find(Boolean) ??
    null;
  const leadAgentId = rememberedLead && crew.includes(rememberedLead) ? rememberedLead : crew[0] ?? null;

  return {
    crew,
    leadAgentId,
    missingAgentIds: remembered.filter((id) => !available.has(id)),
  };
}

export function buildTemplateAgentMetadata(
  metadata: TemplateAgentMetadata,
  {
    crew,
    leadAgentId,
    suggestedRoles,
    agentAssignments,
    agentRequirements,
    deliveryChannel,
  }: TemplateAgentBindingOptions,
): Record<string, unknown> {
  const requirements = agentRequirements ?? getTemplateAgentRequirements({ metadata });
  return {
    ...(metadata ?? {}),
    crew,
    leadAgentId: leadAgentId ?? null,
    suggestedRoles: suggestedRoles ?? [],
    ...(Object.keys(agentAssignments ?? {}).length > 0 ? { agentAssignments } : {}),
    ...(requirements.length > 0
      ? {
          agentRequirements: requirements,
          agentBlueprints: Object.fromEntries(
            requirements.map((requirement) => [
              requirement.id,
              requirement.agentBlueprint,
            ]),
          ),
        }
      : {}),
    ...(deliveryChannel ? { deliveryChannel } : {}),
  };
}

export function bindWorkflowAgentSteps(
  steps: BridgeWorkflowStep[],
  { crew, leadAgentId, agentAssignments }: TemplateAgentBindingOptions,
): BridgeWorkflowStep[] {
  const fallbackAgentId = leadAgentId ?? crew[0];
  return steps.map((step) => {
    if (step.stepType !== "agent_task") return step;
    const requirementId = readString(step.metadata?.requirementId);
    const assignedAgentId = requirementId ? readString(agentAssignments?.[requirementId]) : null;
    const preferredAgentId = assignedAgentId && crew.includes(assignedAgentId)
      ? assignedAgentId
      : step.preferredAgentId && crew.includes(step.preferredAgentId)
      ? step.preferredAgentId
      : fallbackAgentId;
    return {
      ...step,
      ...(preferredAgentId ? { preferredAgentId } : {}),
      metadata: {
        ...(step.metadata ?? {}),
        crew,
        leadAgentId: leadAgentId ?? null,
        ...(requirementId ? { requirementId } : {}),
        ...(assignedAgentId ? { assignedAgentId } : {}),
      },
    };
  });
}

function toBridgeStepId(templateId: string, seedId: string): string {
  return `${templateId}-${seedId}`;
}

export function createBridgeStepsFromTemplateSeeds(
  template: Pick<WorkflowTemplateSeed, "id" | "steps"> | null | undefined,
  agentAssignments: Record<string, string> = {},
  options: { deliveryChannel?: string } = {},
): BridgeWorkflowStep[] {
  if (!template?.steps?.length) return [];

  const stepIdBySeedId = new Map<string, string>(
    template.steps.map((step) => [step.id, toBridgeStepId(template.id, step.id)]),
  );

  return template.steps.map((seed: WorkflowTemplateStepSeed) => {
    const requirementId = readString(seed.requirementId) ?? readString(seed.metadata?.requirementId);
    const metadata = {
      ...(seed.metadata ?? {}),
      ...(requirementId ? { requirementId } : {}),
      ...(seed.stepType === "notification"
        ? { channel: options.deliveryChannel ?? readString(seed.metadata?.channel) ?? "mission_control" }
        : {}),
    };
    const assignedAgentId = requirementId ? readString(agentAssignments[requirementId]) : null;
    return {
      id: stepIdBySeedId.get(seed.id) ?? toBridgeStepId(template.id, seed.id),
      name: seed.name,
      stepType: seed.stepType,
      dependsOn: (seed.dependsOn ?? [])
        .map((dependency) => stepIdBySeedId.get(dependency) ?? toBridgeStepId(template.id, dependency)),
      position: seed.position,
      ...(seed.preferredRole ? { preferredRole: seed.preferredRole } : {}),
      ...(assignedAgentId ? { preferredAgentId: assignedAgentId } : {}),
      metadata,
    };
  });
}
