import React from "react";
import Link from "next/link";
import HyperchoIcon from "./HyperchoIcon";

const Logo = () => {
  return (
    <Link href={`/`} style={{ textDecoration: "none" }}>
      <div className="flex h-full items-center cursor-pointer">
        <HyperchoIcon />
        <p className="text-[1.2em] tracking-[0.1px] text-primary font-semibold font-General-Sans">
          Hyperclaw
        </p>
      </div>
    </Link>
  );
};

export default Logo;
