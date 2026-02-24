import React from "react";

export const colorPalette: string[] = [
  "#FF5733", // Red-Orange
  "#33FF57", // Green
  "#3357FF", // Blue
  "#FF33A1", // Pink
  "#FFD700", // Gold
  "#8A2BE2", // BlueViolet
  "#FF4500", // OrangeRed
  "#20B2AA", // LightSeaGreen
  "#FF1493", // DeepPink
  "#00CED1", // DarkTurquoise
];

export const getRandomColorFromPalette = (): string => {
  const randomIndex = Math.floor(Math.random() * colorPalette.length);
  return colorPalette[randomIndex];
};

export const getColorFromLetter = (letter: string): string => {
  // Convert the letter to its ASCII code and calculate an index in the range [0, 9]
  const index = letter.charCodeAt(0) % 10;
  return colorPalette[index];
};

type avatarType = {
  name?: string;
  size?: number;
  fontSize?: string;
};

const Avatar = (props: avatarType) => {
  const h = props.size || 42;
  const w = props.size || 42;
  const fontSize = props.fontSize || "1.5rem";
  const color = props.name
    ? getColorFromLetter(props.name?.charAt(0))
    : getRandomColorFromPalette();
  return (
    <div
      className="flex cursor-pointer justify-center items-center rounded-full bg-secondary"
      style={{ height: h, width: w, backgroundColor: color }}
    >
      <span className="nonselect font-semibold" style={{ fontSize: fontSize }}>
        {props.name?.charAt(0)}
      </span>
    </div>
  );
};
export default Avatar;
