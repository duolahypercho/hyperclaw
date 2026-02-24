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
  showStatusDropdown: boolean;
  setShowStatusDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  isRight:boolean;
}

const initialState = {
  dropdownStatusRef: { current: null },
  showStatusDropdown: false,
  setShowStatusDropdown: () => {},
  isRight:true,
};

export const HyperDropdownSubMenuContext = createContext<exportedValue>(initialState);

export const HyperDropdownSubMenu = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const dropdownStatusRef = useRef<HTMLDivElement>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);
  const [isRight, setIsRight] = useState<boolean>(true);

  useEffect(() => {
    const handleMouseEnter = () => {
      if (dropdownStatusRef.current) {
        const rect = dropdownStatusRef.current.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        if ((rect.right+rect.width) > windowWidth) {
          setIsRight(false);
        } else {
          setIsRight(true);
        }

        setShowStatusDropdown(true);
      }
    };

    const handleMouseLeave = () => {
      setShowStatusDropdown(false);
    };

    const dropdown = dropdownStatusRef.current;
    dropdown?.addEventListener('mouseenter', handleMouseEnter);
    dropdown?.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      dropdown?.removeEventListener('mouseenter', handleMouseEnter);
      dropdown?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const value: exportedValue = {
    dropdownStatusRef,
    showStatusDropdown,
    setShowStatusDropdown,
    isRight,
  };

  return (
    <HyperDropdownSubMenuContext.Provider value={value}>
      <div className={cn("HyperchoSubDropdownMenuContainer",className)} ref={dropdownStatusRef}>
        {children}
      </div>
    </HyperDropdownSubMenuContext.Provider>
  );
};

export function useDropdownSubMenu() {
  return useContext(HyperDropdownSubMenuContext);
}
