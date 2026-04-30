import Avatar from "./Avatar";
import Image from "next/image";
import { FaUserAlt } from "react-icons/fa";
import React, { memo } from "react";
import { getMediaUrl } from "../utils";
import { ChannelMini, User } from "../types/services";

const ProfileIcon = ({
  type,
  channel,
  user,
  size,
  fontSize,
}: {
  type: string;
  channel?: ChannelMini;
  user?: User;
  size?: number;
  fontSize?: string;
}) => {
  if (type === "channel" && channel) {
    if (channel.channelPic)
      return (
        <Image
          src={getMediaUrl(channel.channelPic)}
          loading="eager"
          width={size || 32}
          height={size || 32}
          className="image"
          title={`${channel?.channelName}`}
          alt={`${channel?.channelName} pic`}
          style={{
            width: "100%",
            height: "100%",
          }}
          unoptimized
        />
      );
    return (
      <div className="picPlaceholder" title={`${channel?.channelName}`}>
        <FaUserAlt className="icon2" color="#fff" />
      </div>
    );
  } else if (type === "hypercho") {
    return (
      <Image
        src="/favicon-32x32.ico"
        loading="eager"
        width={size || 32}
        height={size || 32}
        className="image"
        title="Hypercho"
        alt="Hypercho pic"
        style={{
          width: "100%",
          height: "100%",
        }}
        unoptimized
      />
    );
  }
  //if its a user
  else {
    if (!user?.username)
      return (
        <div className="picPlaceholder">
          <FaUserAlt className="icon2" color="#fff" />
        </div>
      );
    if (user?.profilePic && user?.profilePic !== "1")
      return (
        <Image
          loading="eager"
          src={getMediaUrl(user?.profilePic)}
          alt="user_image"
          width={size || 32}
          height={size || 32}
          className="image"
          style={{
            width: "100%",
            height: "100%",
          }}
          unoptimized
        />
      );
    return (
      <div className="picPlaceholder">
        <Avatar name={user?.username} size={size} fontSize={fontSize} />
      </div>
    );
  }
};

export default memo(ProfileIcon);
