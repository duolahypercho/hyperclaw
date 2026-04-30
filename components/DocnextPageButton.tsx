import { useRouter } from "next/navigation";
import React from "react";
import { FaArrowRightLong, FaArrowLeftLong } from "react-icons/fa6";

interface DocsNextPageButtonNPProps {
  type: "next" | "previous";
  link: string;
  text: string;
}

interface DocnextPageButtonBothProps {
  type: "both";
  linkPrev: string;
  textPrev: string;
  linkNext: string;
  textNext: string;
}

type DocsNextPageButtonProps = DocsNextPageButtonNPProps | DocnextPageButtonBothProps;

export const DocsNextPageButton = (props:DocsNextPageButtonProps) => {
  const { push } = useRouter();

  return (
    <>
      {props.type === "next" && (
        <div
          className="nextPageButtonContainer"
          style={{ justifyContent: "flex-end" }}
        >
          <div
            className="nextPageButton"
            onClick={() => {
              push(props.link);
            }}
          >
            <span className="text">{props.text}</span>
            <FaArrowRightLong className="icon" />
          </div>
        </div>
      )}
      {props.type === "previous" && (
        <div
          className="nextPageButtonContainer"
          style={{ justifyContent: "flex-start" }}
        >
          <div
            className="nextPageButton"
            onClick={() => {
              push(props.link);
            }}
          >
            <FaArrowLeftLong className="icon" />
            <span className="text">{props.text}</span>
          </div>
        </div>
      )}
      {props.type === "both" && (
        <div
          className="nextPageButtonContainer"
          style={{ justifyContent: "space-between" }}
        >
          <div
            className="nextPageButton"
            onClick={() => {
              push(props.linkPrev);
            }}
          >
            <FaArrowLeftLong className="icon" />
            <span className="text">{props.textPrev}</span>
          </div>
          <div
            className="nextPageButton"
            onClick={() => {
              push(props.linkNext);
            }}
          >
            <span className="text">{props.textNext}</span>
            <FaArrowRightLong className="icon" />
          </div>
        </div>
      )}
    </>
  );
};
