import Link from "next/link";
import { TbTools } from "react-icons/tb";
const CreatorBtn: React.FC = () => {
  const studioURL = process.env.NEXT_PUBLIC_STUDIO_URL || "https://business.hypercho.com";
  
  return (
    <Link href={studioURL} style={{ textDecoration:"none"}}>
      <button className="lightOne createstudio" style={{ cursor: "pointer" }}>
        <TbTools className="icon" />
          <span>Create</span>
      </button>
    </Link>
  );
};

export default CreatorBtn;
