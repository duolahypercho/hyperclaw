import { FC, SVGProps } from "react";

interface CopanionIconProps extends SVGProps<SVGSVGElement> {}

export const CopanionIcon: FC<CopanionIconProps> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="12"
    viewBox="0 0 24 9"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M4 0 A8 8 0 0 0 20 0" />
    <line x1="4" y1="0" x2="20" y2="0" />
  </svg>
);

export default CopanionIcon;
