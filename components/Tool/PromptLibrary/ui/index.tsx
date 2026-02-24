"use client";

import { InteractApp } from "@OS/InteractApp";
import { usePromptLibrary } from "$/components/Tool/PromptLibrary/provider/PromptProv";
import PromptOptimizer from "$/components/Tool/PromptLibrary/ui/PromptOptimizer";
import PromptHistory from "$/components/Tool/PromptLibrary/ui/PromptHistory";
import PromptLibrary from "$/components/Tool/PromptLibrary/ui/PromptLibrary";
import PromptChat from "$/components/Tool/PromptLibrary/ui/PromptChat";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import { HistoryProvider } from "../provider/HistoryProv";

export default function Component() {
  const { appSchema } = usePromptLibrary();


  return (
    <InteractApp appSchema={appSchema} className="p-3">
      <InteractContent value="explore" publicTab>
        <PromptLibrary />
      </InteractContent>
      <InteractContent value="chat">
        <PromptChat />
      </InteractContent>
      <InteractContent value="playground">
        <PromptOptimizer />
      </InteractContent>
      <InteractContent value="history">
        <HistoryProvider>
          <PromptHistory />
        </HistoryProvider>
      </InteractContent>
    </InteractApp>
  );
}
