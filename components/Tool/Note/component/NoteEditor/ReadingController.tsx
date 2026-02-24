import { useRef, useState } from "react";
import { Slider } from "@nextui-org/slider";
import { CirclePlay } from "lucide-react";

interface ReadingControllerProps {
  handleThumbClick: (readingLevel: string) => void;
}

export const getTooltipContent = (val: number) => {
  if (val <= 0.1) return "Kindergarten";
  if (val <= 0.3) return "Elementary School";
  if (val <= 0.4) return "Middle School";
  if (val <= 0.6) return "Current";
  if (val <= 0.7) return "High School";
  if (val <= 0.8) return "College";
  if (val <= 1) return "Graduate School";
  return "Current";
};

export function ReadingController({
  handleThumbClick,
}: ReadingControllerProps) {
  const [value, setValue] = useState(0.52);
  const [showSubmit, setShowSubmit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex flex-col justify-center items-center h-[348px] w-full">
      <Slider
        size="lg"
        step={0.14}
        maxValue={1}
        minValue={0.1}
        orientation="vertical"
        aria-label="Reading Level"
        value={value}
        showSteps={true}
        showTooltip={true}
        onChange={(val) => {
          const newValue = Array.isArray(val) ? val[0] : val;
          setValue(newValue);
          if (newValue === 0.52) {
            setShowSubmit(false);
            return;
          }
          // Only show submit if not dragging
          if (!isDragging) {
            setShowSubmit(true);
          }
        }}
        tooltipProps={{
          content: [getTooltipContent(value)], // Dynamically change tooltip content
        }}
        classNames={{
          track: "h-full bg-transparent rounded", // Customize track styles
          thumb: "border-2 border-white rounded-full shadow",
          step: "h-2 rounded-full",
          trackWrapper: "h-full py-6 rounded-full",
          filler: "bg-transparent",
        }}
        renderThumb={(props) => (
          <div
            {...props}
            className="group p-1 bg-accent border-small border-default-200 dark:border-default-400/50 shadow-medium rounded-full data-[dragging=true]:cursor-grabbing left-1/2 overflow-hidden"
            onPointerDown={() => {
              // Add delay before updating states
              setTimeout(() => {
                setShowSubmit(false);
                setIsDragging(true);
              }, 500);
            }}
            onPointerUp={() => {
              // Add small delay before showing submit button
              setTimeout(() => {
                setIsDragging(false);
                // Show submit button after drag ends if not at default value
                if (value !== 0.52) {
                  setShowSubmit(true);
                }
              }, 100);
            }}
          >
            <div className="relative w-5 h-5">
              <span
                className={`absolute inset-0 transition-all duration-500 ease-in-out bg-accent-foreground shadow-small rounded-full block group-data-[dragging=true]:scale-80
                ${
                  showSubmit
                    ? "opacity-0 scale-75 rotate-180"
                    : "opacity-100 scale-100 rotate-0"
                }`}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDragging || !showSubmit) return;
                  handleThumbClick(getTooltipContent(value));
                  setShowSubmit(false);
                }}
                className={`absolute inset-0 transition-all duration-500 ease-in-out bg-transparent rounded-full group-data-[dragging=true]:scale-80 hover:bg-accent hover:scale-110 active:scale-95 flex items-center justify-center hover:shadow-lg
                ${
                  showSubmit
                    ? "opacity-100 pointer-events-auto scale-100 rotate-0 cursor-pointer"
                    : "opacity-0 pointer-events-none scale-75 rotate-180 cursor-grab"
                }`}
              >
                <CirclePlay className="w-full h-full transition-transform duration-300 ease-in-out text-accent fill-accent-foreground" />
              </button>
            </div>
          </div>
        )}
      />
    </div>
  );
}
