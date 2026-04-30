import React from "react";
import TextareaAutosize from "react-textarea-autosize";

interface SinglePropertiesProps {
  type: "longQuestion" | "shortQuestion" | "boolean" | "multipleChoice";
  name: string;
  description: string;
  value: string;
  boolean: boolean;
  option: string[];
  showPreview: boolean;
}

interface shortQuestionProps {
  item: SinglePropertiesProps;
  setMemory: React.Dispatch<React.SetStateAction<SinglePropertiesProps[]>>;
  index: number;
  onMemoryUpdate: (name: string, content: string) => void;
}

const ShortQuestion = (props: shortQuestionProps) => {
  const { item, index, setMemory, onMemoryUpdate } = props;

  return (
    <>
      <div className="singlePrompt" key={index}>
        <div className="clickable nonselect">
          <span className="role">{item.name}</span>
        </div>
        <div className="typingContainer">
          <div className="typingTextarea">
            <TextareaAutosize
              className="inputBox customeScrollbar"
              placeholder={"Default Value"}
              minRows={1}
              maxRows={5}
              value={item.value}
              onChange={(e) => {
                setMemory((prev) => {
                  return prev.map((item, i) => {
                    if (i === index) {
                      return { ...item, value: e.target.value };
                    }
                    return item;
                  });
                });
              }}
              onBlur={ async (e) => {
                await onMemoryUpdate(item.name, e.target.value);
              }}
              maxLength={300}
            />
          </div>
        </div>
      </div>
      <div className="hint">
        <span>{item.description}</span>
        <span className={`${item.value.length === 30 && "error"}`}>
          {item.value.length}/30
        </span>
      </div>
    </>
  );
};

export default ShortQuestion;
