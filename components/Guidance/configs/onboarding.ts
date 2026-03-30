import { GuidanceConfig } from "../types";

export const onboardingConfig: GuidanceConfig = {
  id: "copanion-onboarding",
  storageKey: "copanion-onboarding-completed",
  showSkipButton: true,
  showProgress: true,
  steps: [
    {
      id: "navbar-home",
      target: "[data-guidance='navbar-home']",
      title: "Welcome to Hyperclaw! 👋",
      description:
        "This is your home button. Click it to toggle the sidebar or navigate to the dashboard.",
      position: "bottom",
      offset: { x: 0, y: 0 },
    },
    {
      id: "navbar-tools",
      target: "[data-guidance='navbar-tools']",
      title: "Your Tools",
      description:
        "Explore all your available tools here. If you prefer, launch any tool directly—no need to enter the main dashboard.",
      position: "bottom",
      offset: { x: 0, y: 0 },
    },
    {
      id: "navbar-dock",
      target: "[data-guidance='navbar-dock']",
      title: "Dock Tools",
      description:
        "Quick access to frequently used features. These tools stay accessible from anywhere.",
      position: "bottom",
      offset: { x: -10, y: 0 },
    },
    {
      id: "navbar-user",
      target: "[data-guidance='navbar-user']",
      title: "Your Profile",
      description:
        "Access your profile, settings, and account options from here.",
      position: "bottom",
      offset: { x: 0, y: -10 },
    },
    {
      id: "sidebar",
      target: "[data-guidance='sidebar']",
      title: "Todo Sidebar",
      description:
        "Your task management hub. Keep track of todos, notes, and organize your workflow. Toggle it with the home button.",
      position: "right",
      offset: { x: 10, y: 0 },
      skipIfNotFound: true,
      beforeStep: async () => {
        // Ensure we're on dashboard and sidebar is open
        if (window.location.pathname !== "/dashboard") {
          window.location.href = "/dashboard";
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        // Dispatch event to open sidebar if closed
        window.dispatchEvent(
          new CustomEvent("todo-sidebar-toggle", {
            detail: { isOpen: true },
          })
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      },
    },
    {
      id: "center-display",
      target: "[data-guidance='center-display']",
      title: "Main Workspace",
      description:
        "This is your main workspace where your tools and content appear. Navigate between different tools using the navbar.",
      position: "right",
      offset: { x: 0, y: 0 },
      skipIfNotFound: true,
    }
  ],
  onComplete: () => {
  },
  onSkip: () => {
  },
};
