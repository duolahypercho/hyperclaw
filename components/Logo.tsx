import React from "react";
import Image from "next/image";
import Avatar from "./Avatar";
import { getMediaUrl } from "../utils";

interface LogoProps {
  src: string;
  alt: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ src, alt, size = 80 }) => {
  if (src === "") {
    return (
      <div style={{ width: size, height: size }}>
        <Avatar name={alt} size={size} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size }}>
      <Image
        src={getMediaUrl(src)}
        alt={alt}
        width={size}
        height={size}
        objectFit="contain"
        className="rounded-lg"
      />
    </div>
  );
};

export default Logo;
