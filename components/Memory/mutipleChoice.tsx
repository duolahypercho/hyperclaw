import React, { useEffect, useRef, useState } from "react";
import { MdOutlineKeyboardArrowDown } from "react-icons/md";
import TextareaAutosize from "react-textarea-autosize";
import { MdEdit, MdDelete } from "react-icons/md";
import DropdownFunction from "./dropdownFunction";

interface SinglePropertiesProps {
  type: "longQuestion" | "shortQuestion" | "boolean" | "multipleChoice";
  name: string;
  description: string;
  value: string;
  boolean: boolean;
  option: string[];
  showPreview: boolean;
}

interface mutipleChoiceQuestionProps {
  item: SinglePropertiesProps;
  setMemory: React.Dispatch<React.SetStateAction<SinglePropertiesProps[]>>;
  index: number;
  onMemoryUpdate: (name: string, content: string) => void;
}

interface DropdownLinkDataProps {
  setShowDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  item: SinglePropertiesProps;
  addFunction: (type: string) => void;
  setMemory: React.Dispatch<React.SetStateAction<SinglePropertiesProps[]>>;
  index: number;
}

const DropdownLinkData = (props: DropdownLinkDataProps) => {
  const { setShowDropdown, item, addFunction, setMemory, index } = props;

  return (
    <>
      {item.option.map((value: string, optionIndex: number) => {
        return (
          <DropdownFunction
            value={value}
            setShowDropdown={setShowDropdown}
            addFunction={addFunction}
            setMemory={setMemory}
            index={index}
            optionIndex={optionIndex}
            item={item}
            key={`type_${value}`}
          />
        );
      })}
    </>
  );
};

const MutipleChoice = (props: mutipleChoiceQuestionProps) => {
  const { item, index, setMemory, onMemoryUpdate } = props;
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);
  const dropdownStatusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownStatusRef.current &&
        !dropdownStatusRef.current.contains(e.target as Node)
      ) {
        setShowStatusDropdown(!showStatusDropdown);
        return () => {
          document.removeEventListener("click", handleClick);
        };
      }
    };

    if (showStatusDropdown) {
      document.addEventListener("click", handleClick);
      //focus on the dropdown field
    }
  }, [showStatusDropdown]);
  return (
    <>
      <div className="singlePrompt" key={index}>
        <div className="clickable nonselect">
          <span className="role">{item.name}</span>
        </div>
        <div className="typingContainer" ref={dropdownStatusRef}>
          {/*container to show dropdown container*/}
          <div className="dropdownContainer">
            {/*button when click it will show dropdown box*/}
            <div
              className="dropdownButton"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            >
              <div className={item.type && "inputActive"}>
                <span className="nonselect">{item.value}</span>
              </div>
              <MdOutlineKeyboardArrowDown size={21} className="arrowDown" />
            </div>
            <div
              className={`dropdownMenu ${
                showStatusDropdown && "dropdownMenu_open"
              } dropdownGrid customeScrollbar`}
            >
              {/* dropdown box*/}
              <div className="dropdownLinks">
                <DropdownLinkData
                  setShowDropdown={setShowStatusDropdown}
                  item={item}
                  index={index}
                  addFunction={async (type: string) => {
                    setMemory((prev) => {
                      return prev.map((item, i) => {
                        if (i === index) {
                          return { ...item, value: type };
                        }
                        return item;
                      });
                    });

                    await onMemoryUpdate(item.name, type);
                  }}
                  setMemory={setMemory}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="hint">
        <span>{item.description}</span>
        <span>{item.boolean ? "On" : "Off"}</span>
      </div>
    </>
  );
};

export default MutipleChoice;
