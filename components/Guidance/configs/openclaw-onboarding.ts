import { GuidanceConfig } from "../types";

export const openclawOnboardingConfig: GuidanceConfig = {
  id: "openclaw-onboarding",
  storageKey: "openclaw-onboarding-completed",
  showSkipButton: true,
  showProgress: true,
  steps: [
    {
      id: "widget-agent-status",
      target: "[data-guidance='widget-agent-status']",
      title: "Your Agents",
      description:
        "This is your agent status board. See which agents are running, idle, or errored — all in real time. Click any agent to start a conversation.",
      position: "top",
      offset: { x: 0, y: 0 },
      skipIfNotFound: true,
      beforeStep: async () => {
        if (window.location.pathname !== "/dashboard") {
          window.location.href = "/dashboard";
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      },
    },
    {
      id: "widget-gateway-chat",
      target: "[data-guidance='widget-gateway-chat']",
      title: "Chat with Agents",
      description:
        "Talk directly to any of your OpenClaw agents from here. Ask questions, give instructions, or check on their progress.",
      position: "top",
      offset: { x: 0, y: 0 },
      skipIfNotFound: true,
    },
    {
      id: "widget-crons",
      target: "[data-guidance='widget-crons']",
      title: "Scheduled Jobs",
      description:
        "Set up recurring automation. Cron jobs run your agents on a schedule — perfect for monitoring, reports, or periodic tasks.",
      position: "top",
      offset: { x: 0, y: 0 },
      skipIfNotFound: true,
    },
    {
      id: "navbar-tools-openclaw",
      target: "[data-guidance='navbar-tools']",
      title: "All OpenClaw Tools",
      description:
        "Find the full Agent Manager, Intelligence database, and documentation browser under Tools. This is where you configure and manage everything.",
      position: "bottom",
      offset: { x: 0, y: 0 },
    },
    {
      id: "openclaw-ready",
      target: "body",
      title: "You're Ready!",
      description:
        "Your OpenClaw setup is complete. Your agents are connected and ready to work. Explore the dashboard, chat with an agent, or create your first task.",
      position: "center",
      offset: { x: 0, y: 0 },
    },
  ],
};
