import React, { memo, useMemo } from "react";
import {
  CopanionInterfaceProvider,
  CharacterState,
} from "@OS/AI/components/models/CopanionInterfaceProvider";
import { CopanionCharacter } from "@OS/AI/components/models/CopanionCharacter";
import { CopilotChat } from "@OS/AI/components/CopilotChat";

export const CopanionChat = () => {
  const renderChildren = ({
    characterState,
  }: {
    characterState: CharacterState;
  }) => {
    // Memoize the provider to prevent re-creation on every render
    const providerContent = useMemo(
      () => (
        <CopanionInterfaceProvider characterState={characterState}>
          <CopanionCharacter />
        </CopanionInterfaceProvider>
      ),
      [characterState]
    );

    return providerContent;
  };

  return <CopilotChat>{renderChildren}</CopilotChat>;
};
