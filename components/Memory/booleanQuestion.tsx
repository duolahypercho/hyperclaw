import React from "react";
import IOSSwitch from "../Switch";

interface SinglePropertiesProps {
  type: "longQuestion" | "shortQuestion" | "boolean" | "multipleChoice";
  name: string;
  description: string;
  value: string;
  boolean: boolean;
  option: string[];
  showPreview: boolean;
}

interface booleanQuestionProps {
  item: SinglePropertiesProps;
  setMemory: React.Dispatch<React.SetStateAction<SinglePropertiesProps[]>>;
  index: number;
  onMemoryUpdate: (name: string, content: string) => void;
}
const BooleanQuestion = (props: booleanQuestionProps) => {
  const { item, index, setMemory, onMemoryUpdate } = props;

  return (
    <>
      <div className="singlePrompt" key={index}>
        <div className="clickable nonselect">
          <span className="role">{item.name}</span>
        </div>
        <div className="switchContainer">
          <IOSSwitch
            checked={item.boolean ? true : false}
            onChange={() => {
              setMemory((prev) => {
                return prev.map((item, i) => {
                  if (i === index) {
                    return { ...item, boolean: !item.boolean };
                  }
                  return item;
                });
              });
            }}
            
          />
        </div>
      </div>
      <div className="hint">
        <span>{item.description}</span>
        <span>{item.boolean ? "On" : "Off"}</span>
      </div>
    </>
  );
};

export default BooleanQuestion;
