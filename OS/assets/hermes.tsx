import Image, { ImageProps } from "next/image";
import { FC } from "react";

interface HermesIconProps extends Omit<ImageProps, "src" | "alt"> {
  size?: number;
}

/** Hermes agent icon */
export const HermesIcon: FC<HermesIconProps> = ({ size = 24, ...props }) => (
  <Image
    src="/assets/hermes-agent.png"
    alt="Hermes"
    width={size}
    height={size}
    {...props}
  />
);

export default HermesIcon;
