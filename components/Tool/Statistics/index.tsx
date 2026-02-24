import React from "react";
import { InteractApp } from "@OS/InteractApp";
import { useStatistics } from "./provider/statisticsProvider";
import StatisticsContainer from "./components/StatisticsContainer";

const Statistics = () => {
  const { appSchema } = useStatistics();
  return (
    <InteractApp appSchema={appSchema}>
      <StatisticsContainer />
    </InteractApp>
  );
};

export default Statistics;
