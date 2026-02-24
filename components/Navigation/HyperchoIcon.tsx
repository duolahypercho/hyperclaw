import React from "react";
import { cn } from "$/utils";
import Image from "next/image";

type Props = { className?: string };

const HyperchoIcon = ({ className }: Props) => {
  return (
    <Image
      src="/Logopic.png"
      alt="Hypercho"
      width={100}
      height={100}
      priority
      className={cn(
        "logo w-auto h-[1.6em] my-0 mx-[0.3em] rounded ",
        className
      )}
    />
  );
};

export default React.memo(HyperchoIcon);
