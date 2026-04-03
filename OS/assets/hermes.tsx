import { FC, SVGProps } from "react";

interface HermesIconProps extends SVGProps<SVGSVGElement> {}

/** Winged helmet icon representing Hermes agent */
export const HermesIcon: FC<HermesIconProps> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Helmet dome */}
    <path d="M7 14 A5 5 0 0 1 17 14" />
    <line x1="7" y1="14" x2="17" y2="14" />
    {/* Left wing */}
    <path d="M7 12 Q4 10 2 7" />
    <path d="M7 13 Q5 11 3 9" />
    {/* Right wing */}
    <path d="M17 12 Q20 10 22 7" />
    <path d="M17 13 Q19 11 21 9" />
    {/* Visor detail */}
    <path d="M9 14 v2" />
    <path d="M15 14 v2" />
  </svg>
);

export default HermesIcon;
