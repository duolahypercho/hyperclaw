import React, { useState } from "react";
import { MdEdit, MdDelete, MdCheck } from "react-icons/md";
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

interface DropdownFunctionProps {
  value: string;
  setShowDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  addFunction: (type: string) => void;
  setMemory: React.Dispatch<React.SetStateAction<SinglePropertiesProps[]>>;
  index: number;
  optionIndex: number;
  item: SinglePropertiesProps;
}

const DropdownFunction = (props: DropdownFunctionProps) => {
  const {
    value,
    setShowDropdown,
    addFunction,
    item,
  } = props;
  return (
    <li
      className={`link ${
        value.toLocaleLowerCase() === item.value.toLocaleLowerCase()
          ? "linkActive"
          : ""
      }`}
      key={`type_${value}`}
      onClick={() => {
        addFunction(value);
        setShowDropdown(false);
      }}
    >
      <span>{`${value}`}</span>
    </li>
  );
};

export default DropdownFunction;
