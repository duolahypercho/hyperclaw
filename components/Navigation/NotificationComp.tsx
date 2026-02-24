import React from "react";
import { BsBell } from "react-icons/bs";

const NotificationComp = () => {
  return (
    <div className="notify">
      <div className="redDot"></div>
      <BsBell className="icon" />
    </div>
  );
};

export default NotificationComp;
