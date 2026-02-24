import { useSession } from "next-auth/react";
import React from "react";
import UserPic from "./UserPic";
const UserModal = () => {
  const session = useSession();
  if (session.status !== "authenticated") return null;
  return (
    <div className="Usermodal">
      <UserPic />
      <div className="content">
        <p>{session.data.user.Firstname}</p>
        <p>{session.data.user.email}</p>
      </div>
    </div>
  );
};

export default UserModal;
