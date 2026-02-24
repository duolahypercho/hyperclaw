import React from "react";
import { PomodoroProvider } from "./pomoProvider";
import PomodoroContainer from "./pomodoro";

const Pomodoro = () => {
  return (
    <PomodoroProvider>
      <PomodoroContainer />
    </PomodoroProvider>
  );
};

export default Pomodoro;
