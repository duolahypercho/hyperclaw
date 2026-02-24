import React, { useEffect, useRef, useState } from "react";
import { FaAngleDown } from "react-icons/fa";
import LongQuestion from "./longQuestion";
import ShortQuestion from "./shortQuestion";
import BooleanQuestion from "./booleanQuestion";
import MutipleChoice from "./mutipleChoice";
import { memoryType } from "../../types/services";

interface MemoryFormProps {
  item: memoryType;
  setMemory: React.Dispatch<React.SetStateAction<memoryType[]>>;
  index: number;
  onMemoryUpdate: (name: string, content: string) => void;
}

const MemoryForm = (props: MemoryFormProps) => {
  const { item, index, setMemory, onMemoryUpdate } = props;
  return (
    <div className={`accordion accordionActive`}>
      <div className="previewPrompt">
        {item.type === "longQuestion" && (
          <LongQuestion
            item={item}
            setMemory={setMemory}
            index={index}
            onMemoryUpdate={onMemoryUpdate}
          />
        )}
        {item.type === "shortQuestion" && (
          <ShortQuestion
            item={item}
            setMemory={setMemory}
            index={index}
            onMemoryUpdate={onMemoryUpdate}
          />
        )}
        {item.type === "boolean" && (
          <BooleanQuestion
            item={item}
            setMemory={setMemory}
            index={index}
            onMemoryUpdate={onMemoryUpdate}
          />
        )}
        {item.type === "multipleChoice" && (
          <MutipleChoice
            item={item}
            setMemory={setMemory}
            index={index}
            onMemoryUpdate={onMemoryUpdate}
          />
        )}
      </div>
    </div>
  );
};

export default MemoryForm;
