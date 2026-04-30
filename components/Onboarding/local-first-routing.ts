export type GuidedDeviceChoice = "local" | "remote" | null | undefined;

export function canUseRemoteOnboarding(status: string): boolean {
  return status === "authenticated";
}

export function normalizeGuidedDeviceChoice<TState extends { deviceChoice?: GuidedDeviceChoice }>(
  state: TState,
  canUseLocalConnectorBootstrap: boolean,
  allowRemoteOnboarding = true,
): TState {
  if (!allowRemoteOnboarding && state.deviceChoice === "remote") {
    return {
      ...state,
      deviceChoice: undefined,
    };
  }

  if (canUseLocalConnectorBootstrap || state.deviceChoice !== "local") {
    return state;
  }

  return {
    ...state,
    deviceChoice: undefined,
  };
}
