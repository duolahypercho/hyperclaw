import Image from "next/image";
import { getSession, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import ProfileIcon from "../ProfileIcon";
import { useInterim } from "../../Providers/InterimProv";
import { useUser } from "../../Providers/UserProv";

const UserPic = (props:{show?: boolean}) => {
  const { data } = useSession(); 
  const { mobileScreen } = useInterim();
  const { userInfo, status } = useUser();
  return (
    <div className="userPic nonselect" style={{ borderRadius: `${props.show?"20%":""}` }}
    >
      <div className="wrapper">
      <ProfileIcon
        type="user"
        user={{ _id: `${data?.user.userId || ""}`, profilePic: `${userInfo.profilePic || ""}`, username: `${userInfo.username || ""}` }}
        channel={userInfo.channel || data?.user.channel}
        size={mobileScreen? 32 : undefined}
        />
      </div>
    </div>
  );
};

export default UserPic;
