package bridge

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const (
	teamManagedStart = "<!-- hyperclaw-team-mode:start -->"
	teamManagedEnd   = "<!-- hyperclaw-team-mode:end -->"
	teamSkillName    = "HyperClaw Team Mode"
)

type teamRole string

const (
	roleOrchestrator teamRole = "orchestrator"
	roleLeadManager  teamRole = "lead-manager"
	roleWorker       teamRole = "worker-executor"
)

type teamBehaviorContext struct {
	Identity         store.AgentIdentity
	Role             teamRole
	Projects         []store.Project
	LeadProjectIDs   map[string]bool
	MembersByProject map[string][]store.ProjectMember
}

func SyncTeamModeBehavior(s *store.Store, paths Paths) error {
	if s == nil {
		return nil
	}
	identities, err := s.ListAgentIdentities()
	if err != nil {
		return err
	}
	projects, err := s.ListProjects("")
	if err != nil {
		return err
	}

	membersByProject := make(map[string][]store.ProjectMember, len(projects))
	leadProjectIDsByAgent := map[string]map[string]bool{}
	memberProjectsByAgent := map[string][]store.Project{}
	for _, project := range projects {
		members, err := s.GetProjectMembers(project.ID)
		if err != nil {
			continue
		}
		membersByProject[project.ID] = members
		if project.TeamModeEnabled == false || strings.EqualFold(project.Status, "archived") {
			continue
		}
		if project.LeadAgentID != "" {
			if leadProjectIDsByAgent[project.LeadAgentID] == nil {
				leadProjectIDsByAgent[project.LeadAgentID] = map[string]bool{}
			}
			leadProjectIDsByAgent[project.LeadAgentID][project.ID] = true
			memberProjectsByAgent[project.LeadAgentID] = append(memberProjectsByAgent[project.LeadAgentID], project)
		}
		for _, member := range members {
			memberProjectsByAgent[member.AgentID] = append(memberProjectsByAgent[member.AgentID], project)
			if strings.EqualFold(member.Role, "lead") {
				if leadProjectIDsByAgent[member.AgentID] == nil {
					leadProjectIDsByAgent[member.AgentID] = map[string]bool{}
				}
				leadProjectIDsByAgent[member.AgentID][project.ID] = true
			}
		}
	}

	for _, identity := range identities {
		ctx := teamBehaviorContext{
			Identity:         identity,
			Projects:         dedupeProjects(memberProjectsByAgent[identity.ID]),
			LeadProjectIDs:   leadProjectIDsByAgent[identity.ID],
			MembersByProject: membersByProject,
		}
		switch {
		case strings.EqualFold(identity.ID, "main"), strings.EqualFold(identity.ID, "orchestrator"):
			ctx.Role = roleOrchestrator
		case len(ctx.LeadProjectIDs) > 0:
			ctx.Role = roleLeadManager
		case len(ctx.Projects) > 0:
			ctx.Role = roleWorker
		default:
			continue
		}
		if err := syncAgentTeamBehavior(paths, s, ctx); err != nil {
			return err
		}
	}

	return nil
}

func dedupeProjects(projects []store.Project) []store.Project {
	if len(projects) == 0 {
		return nil
	}
	seen := map[string]store.Project{}
	for _, project := range projects {
		seen[project.ID] = project
	}
	out := make([]store.Project, 0, len(seen))
	for _, project := range seen {
		out = append(out, project)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// isRuntimeInstalled returns true if the binary for the given runtime is present.
func isRuntimeInstalled(runtime string) bool {
	switch RuntimeType(runtime) {
	case RuntimeOpenClaw:
		return findOpenClawBinary() != ""
	case RuntimeHermes:
		return findHermesBinary() != ""
	case RuntimeClaude:
		return findClaudeBinary() != ""
	case RuntimeCodex:
		return findCodexBinary() != ""
	default:
		return false
	}
}

func syncAgentTeamBehavior(paths Paths, s *store.Store, ctx teamBehaviorContext) error {
	runtime := ctx.Identity.Runtime
	if runtime == "" {
		runtime = "openclaw"
	}

	// Only update agents whose directory already exists on disk.
	// Never auto-create — that's the job of setupAgent / onboarding.
	agentDir := paths.AgentDir(runtime, ctx.Identity.ID)
	if _, err := os.Stat(agentDir); os.IsNotExist(err) {
		// Fallback: legacy un-prefixed layout (pre-0.5.6)
		legacy := paths.LegacyAgentDir(ctx.Identity.ID)
		if _, lerr := os.Stat(legacy); lerr == nil {
			agentDir = legacy
		} else {
			return nil
		}
	}

	personality := LoadAgentPersonality(agentDir, ctx.Identity.ID)
	personality.Agents = upsertManagedBlock(personality.Agents, buildTeamAgentsBlock(ctx))
	personality.Tools = upsertManagedBlock(personality.Tools, buildTeamToolsBlock(ctx))
	personality.Heartbeat = upsertManagedBlock(personality.Heartbeat, buildTeamHeartbeatBlock(ctx))
	personality.Memory = upsertManagedBlock(personality.Memory, buildTeamMemoryBlock(ctx))

	// OpenClaw and Hermes have native directories — skip writing to
	// ~/.hyperclaw/agents/. Only Claude Code/Codex need files there.
	usesNativeHarness := runtime == string(RuntimeOpenClaw) || runtime == string(RuntimeHermes)
	if !usesNativeHarness {
		if err := SaveAgentPersonality(agentDir, personality); err != nil {
			return err
		}
	}

	if s != nil {
		if err := upsertManagedTeamSkill(s, ctx); err != nil {
			return err
		}
	}

	adapters := map[RuntimeType]RuntimeAdapter{
		RuntimeOpenClaw: NewOpenClawAdapter(paths),
		RuntimeHermes:   NewHermesAdapter(paths),
		RuntimeClaude:   NewClaudeCodeAdapter(paths),
		RuntimeCodex:    NewCodexAdapter(paths),
	}
	if adapter, ok := adapters[RuntimeType(runtime)]; ok {
		_ = adapter.SetupAgent(ctx.Identity.ID, personality)
	}
	if runtime == string(RuntimeClaude) {
		claudeMd := AssembleClaudeMd(personality)
		if claudeMd != "" {
			_ = os.WriteFile(filepath.Join(agentDir, "CLAUDE.md"), []byte(claudeMd), 0600)
		}
	}
	return nil
}

func upsertManagedBlock(existing, body string) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return strings.TrimSpace(existing)
	}
	block := teamManagedStart + "\n" + body + "\n" + teamManagedEnd
	existing = strings.TrimSpace(existing)
	if existing == "" {
		return block
	}
	if start := strings.Index(existing, teamManagedStart); start >= 0 {
		if end := strings.Index(existing, teamManagedEnd); end >= start {
			end += len(teamManagedEnd)
			updated := strings.TrimSpace(existing[:start] + block + existing[end:])
			return strings.TrimSpace(updated)
		}
	}
	return strings.TrimSpace(existing + "\n\n" + block)
}

func upsertManagedTeamSkill(s *store.Store, ctx teamBehaviorContext) error {
	skills, err := s.ListAgentSkills(ctx.Identity.ID)
	if err != nil {
		return err
	}
	content := buildTeamSkillContent(ctx)
	for _, skill := range skills {
		if skill.Name == teamSkillName {
			if skill.Content == content && skill.Enabled {
				return nil
			}
			if err := s.UpdateAgentSkill(skill.ID, teamSkillName, "Managed HyperClaw Team Mode operating guide", content, []string{"team-mode", string(ctx.Role)}); err != nil {
				return err
			}
			if !skill.Enabled {
				if err := s.ToggleAgentSkill(skill.ID, true); err != nil {
					return err
				}
			}
			return nil
		}
	}
	_, err = s.AddAgentSkill(ctx.Identity.ID, teamSkillName, "Managed HyperClaw Team Mode operating guide", content, "custom", "", "HyperClaw", "1", []string{"team-mode", string(ctx.Role)})
	return err
}

func buildTeamSkillContent(ctx teamBehaviorContext) string {
	return strings.TrimSpace(fmt.Sprintf(`# %s

Role: %s

Use HyperClaw project state as the source of truth for project membership, workflows, tasks, approvals, and reports.

When the user asks you to organize work:
1. Inspect the target project and members.
2. Create or refine a workflow template if needed.
3. Start or update a workflow run.
4. Delegate work using project membership only.
5. Report concise status upward and request human approval for real gates.
`, teamSkillName, ctx.Role))
}

func buildTeamAgentsBlock(ctx teamBehaviorContext) string {
	lines := []string{
		"# HyperClaw Team Mode",
		"",
		fmt.Sprintf("You are operating in `%s` mode.", ctx.Role),
		"",
		"Use HyperClaw as the authoritative control plane for:",
		"- projects and project members",
		"- workflow templates and workflow runs",
		"- task creation, updates, and delegation",
		"- human approval gates",
		"- progress and blocker reports",
		"",
		"Rules:",
		"- Work inside explicit project boundaries.",
		"- Only delegate work to members of the current project.",
		"- If the user asks to add teammates or promote a lead, update the project through HyperClaw.",
		"- Prefer workflows over ad-hoc task lists when the work has repeatable steps.",
		"- Pause for approvals when the workflow or user intent requires it.",
	}
	if len(ctx.Projects) > 0 {
		lines = append(lines, "", "Active projects:")
		for _, project := range ctx.Projects {
			role := "member"
			if ctx.LeadProjectIDs[project.ID] {
				role = "lead"
			}
			lines = append(lines, fmt.Sprintf("- `%s` (%s): %s", project.Name, role, strings.TrimSpace(project.Description)))
			members := ctx.MembersByProject[project.ID]
			if len(members) > 0 {
				memberLines := make([]string, 0, len(members))
				for _, member := range members {
					memberLines = append(memberLines, fmt.Sprintf("%s:%s", member.AgentID, member.Role))
				}
				sort.Strings(memberLines)
				lines = append(lines, fmt.Sprintf("  roster: %s", strings.Join(memberLines, ", ")))
			}
		}
	}
	if ctx.Role == roleOrchestrator {
		lines = append(lines, "", "As orchestrator, route user requests to the right project, create workflows when needed, and assign or update project leads.")
	}
	if ctx.Role == roleLeadManager {
		lines = append(lines, "", "As a lead, translate user requests into workflow runs or concrete tasks, then assign work to your project members.")
	}
	if ctx.Role == roleWorker {
		lines = append(lines, "", "As a worker, execute assigned steps, suggest workflow improvements when useful, and report blockers early.")
	}
	return strings.Join(lines, "\n")
}

func buildTeamToolsBlock(ctx teamBehaviorContext) string {
	lines := []string{
		"# HyperClaw Team Actions",
		"",
		"HyperClaw's legacy team integration is retired. Do not configure or call `hyperclaw-team`.",
		"",
		"When your runtime exposes built-in HyperClaw actions, call `hyperclaw-tool-call` with a stable tool name and arguments. Use these actions for agent identity, knowledge, project, and workflow changes.",
		"If built-in actions are not available in your runtime, explain the exact HyperClaw change the user should make and ask them to confirm in the app.",
		"",
		"Action policy:",
		"- Read state before writing: use `hyperclaw.agents.list`, `hyperclaw.projects.list`, and `hyperclaw.workflows.list_runs` before assigning or changing work.",
		"- Use `hyperclaw.knowledge.read` before answering from company knowledge; use `hyperclaw.knowledge.write` only when the user asks you to save or update knowledge.",
		"- When the user describes a repeatable process, create a workflow template with `hyperclaw.workflows.create_from_prompt` before starting a run.",
		"- Destructive actions such as `hyperclaw.agents.delete`, `hyperclaw.projects.remove_member`, and `hyperclaw.workflows.cancel_run` require explicit user intent and `confirmed: true`.",
	}
	switch ctx.Role {
	case roleOrchestrator:
		lines = append(lines,
			"",
			"Orchestrator guidance:",
			"- Create projects with `hyperclaw.projects.create` when a request has a new goal, customer, product area, or delivery track.",
			"- Create agents with `hyperclaw.agents.create` only when there is a durable role missing from the team.",
			"- Assign leads with `hyperclaw.projects.update` and add members with `hyperclaw.projects.add_member` after reading the current roster.",
			"- Turn broad operating requests into workflow templates, then start runs once the project and lead are clear.",
		)
	case roleLeadManager:
		lines = append(lines,
			"",
			"Lead guidance:",
			"- Keep project status and project information current with `hyperclaw.projects.update`.",
			"- Add contributors with `hyperclaw.projects.add_member` when the work needs another agent's durable participation.",
			"- Start workflow runs with `hyperclaw.workflows.start_run` and report blockers through the project/workflow state.",
			"- Save useful project facts or decisions into knowledge with `hyperclaw.knowledge.write`.",
		)
	case roleWorker:
		lines = append(lines,
			"",
			"Worker guidance:",
			"- Prefer read actions: inspect `hyperclaw.projects.get`, `hyperclaw.workflows.get_run`, and knowledge docs before doing work.",
			"- Update status only when you own the work or the user asks for a report.",
			"- Do not create agents or reorganize project membership unless a lead or the user explicitly asks.",
			"- If blocked, describe the blocker and the exact project/workflow update the lead should make.",
		)
	default:
		lines = append(lines,
			"",
			"Default guidance:",
			"- Use read actions first, then make the smallest write needed to satisfy the user's request.",
		)
	}
	return strings.Join(lines, "\n")
}

func buildTeamHeartbeatBlock(ctx teamBehaviorContext) string {
	lines := []string{
		"# HyperClaw Team Heartbeat",
		"",
		"Every heartbeat:",
		"1. List your active projects and running workflow runs.",
		"2. Review blockers, pending approvals, and stalled tasks.",
		"3. Take the next concrete action through HyperClaw when actions are available.",
		"4. Submit a concise report if there was meaningful progress or a blocker.",
	}
	switch ctx.Role {
	case roleOrchestrator:
		lines = append(lines,
			"5. Triage new user requests into a project.",
			"6. Assign or rebalance project leads if a project is missing ownership.",
			"7. Create workflow templates from natural language requests when helpful.",
		)
	case roleLeadManager:
		lines = append(lines,
			"5. Break project work into workflow steps or tasks.",
			"6. Delegate only to members of the active project.",
			"7. Request approval whenever a workflow gate requires human review.",
		)
	default:
		lines = append(lines,
			"5. Pull assigned tasks and execute the highest-priority item.",
			"6. Update task status as you progress.",
			"7. Report blockers with specific missing inputs or approvals.",
		)
	}
	return strings.Join(lines, "\n")
}

func buildTeamMemoryBlock(ctx teamBehaviorContext) string {
	lines := []string{
		"# HyperClaw Team Snapshot",
		"",
		fmt.Sprintf("Managed role: %s", ctx.Role),
	}
	if len(ctx.Projects) == 0 {
		lines = append(lines, "No active projects assigned.")
		return strings.Join(lines, "\n")
	}
	lines = append(lines, "Assigned projects:")
	for _, project := range ctx.Projects {
		role := "member"
		if ctx.LeadProjectIDs[project.ID] {
			role = "lead"
		}
		lines = append(lines, fmt.Sprintf("- %s [%s]", project.Name, role))
	}
	return strings.Join(lines, "\n")
}
