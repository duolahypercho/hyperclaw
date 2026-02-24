import React from "react";
import { InteractApp } from "@OS/InteractApp";
import { useAurum } from "./provider/aurumProvider";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import IdeaValidator from "./pages/ideaValidator";
import HomeContainer from "./pages/home";

const Index = () => {
  const { appSchema } = useAurum();

  return (
    <InteractApp appSchema={appSchema}>
      <InteractContent value="aurum-home-item">
        <HomeContainer />
      </InteractContent>
      <InteractContent value="aurum-idea-report-item">
        <IdeaValidator />
      </InteractContent>
    </InteractApp>
  );
};

export default Index;
