import React, {
  ReactNode,
  RefObject,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "$/utils";

interface dropdownType {
  value: string;
  display: string;
}

export interface exportedValue {
  dropdownStatusRef: RefObject<HTMLDivElement>;
  dropdownMenuRef: RefObject<HTMLDivElement>;
  showStatusDropdown: boolean;
  isRight:boolean;
  setShowStatusDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  curStatus: dropdownType;
  arrayDropdown: dropdownType[];
  handleClick: (item: dropdownType) => void;
}

const initialState = {
  dropdownStatusRef: { current: null },
  dropdownMenuRef: { current: null },
  showStatusDropdown: false,
  setShowStatusDropdown: () => {},
  curStatus: {
    value: "",
    display: "",
  },
  arrayDropdown: [],
  handleClick: () => {},
  isRight: false,
};

export const HyperDropdownContext = createContext<exportedValue>(initialState);

export const HyperDropdown = ({
  children,
  arrayDropdown,
  curValue,
  onClickFunction,
  className,
}: {
  children: ReactNode;
  arrayDropdown: dropdownType[];
  curValue: string;
  onClickFunction: (value: string) => void;
  className?: string;
}) => {
  const dropdownStatusRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);
  const [curStatus, setCurStatus] = useState<dropdownType>(
    arrayDropdown.find((item) => item.value === curValue) ||
      arrayDropdown[0] || { value: "", display: "" }
  );
  const [isRight, setIsRight] = useState<boolean>(true);

  //Close status dropdown bar if user click outside the dropdown
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

  const handleClick = (item: dropdownType) => {
    setShowStatusDropdown(false);
    if (item.value === curStatus.value) return;
    setCurStatus(item);
    onClickFunction(item.value);
  };

  useEffect(() => {
    if (dropdownMenuRef.current) {
      const rect = dropdownMenuRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      if ((rect.right+rect.width) > windowWidth) {
        setIsRight(false);
      } else {
        setIsRight(true);
      }
    }
  }, []);
  const value: exportedValue = {
    dropdownStatusRef,
    dropdownMenuRef,
    showStatusDropdown,
    setShowStatusDropdown,
    curStatus,
    arrayDropdown,
    handleClick,
    isRight
  };

  return (
    <HyperDropdownContext.Provider value={value}>
      <div
        className={cn(`HyperchoDropdownMenuContainer`, className)}
        ref={dropdownStatusRef}
      >
        {children}
      </div>
    </HyperDropdownContext.Provider>
  );
};

export function useDropdownMenu() {
  return useContext(HyperDropdownContext);
}
