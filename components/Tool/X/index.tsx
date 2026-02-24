"use client";

import { TwitterAuth } from "./component/twitterAuth";
import Home from "./pages/home";
import Schedule from "./pages/schedule";
import DraftThread from "./pages/postList";
import TwitterThreadEditor from "./component/TwitterThreadEditor";
import { XLoading } from "./component/XLoading";
import { useX } from "./provider/xProvider";
import { InteractApp } from "@OS/InteractApp";
import { InteractContent } from "@OS/Provider/InteractContentProv";

export default function Component() {
  const { appSchema, isInitialLoading } = useX();

  // Show loading state while initial data is being fetched
  if (isInitialLoading) {
    return (
      <InteractApp appSchema={appSchema} className="p-3">
        <XLoading />
      </InteractApp>
    );
  }

  return (
    <InteractApp appSchema={appSchema} className="p-3">
      <InteractContent value="auth">
        <TwitterAuth />
      </InteractContent>
      <InteractContent value="home">
        <Home />
      </InteractContent>
      <InteractContent value="list">
        <DraftThread />
      </InteractContent>
      <InteractContent value="editor">
        <TwitterThreadEditor />
      </InteractContent>
      {/*       <InteractContent value="schedule">
        <Schedule />
      </InteractContent> */}
    </InteractApp>
  );
}
