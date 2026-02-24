import React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface TweetAvatarProps {
  profileImageUrl: string;
  username: string;
}

export const TweetAvatar = React.memo<TweetAvatarProps>(
  function TweetAvatar({ profileImageUrl, username }) {
    return (
      <Avatar className="w-10 h-10 z-[30]">
        <AvatarImage
          src={
            profileImageUrl ||
            "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"
          }
          alt="Profile"
        />
        <AvatarFallback>
          {username?.charAt(0).toUpperCase() || "X"}
        </AvatarFallback>
      </Avatar>
    );
  },
  // custom comparator: re‐render only if URL or username changes
  (prev, next) =>
    prev.profileImageUrl === next.profileImageUrl &&
    prev.username === next.username
);
