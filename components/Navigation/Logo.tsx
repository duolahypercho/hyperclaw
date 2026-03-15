import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import HyperchoIcon from "./HyperchoIcon";

const Logo = () => {
  const { pathname } = useRouter();
  const isLanding = pathname === "/";

  return (
    <Link href={`/`} style={{ textDecoration: "none" }}>
      <div className="flex h-full items-center cursor-pointer">
        <HyperchoIcon />
        <p className={`text-[1.2em] tracking-[0.1px] font-semibold font-General-Sans ${isLanding ? "text-white" : "text-primary"}`}>
          Hyperclaw
        </p>
      </div>
    </Link>
  );
};

export default Logo;
