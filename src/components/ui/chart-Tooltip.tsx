import React from "react";

interface HyperchoChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: string | number;
    color?: string;
    fill?: string;
    payload?: Record<string, unknown>;
    dataKey?: string;
    name?: string;
  }>;
  label?: string | number;
  // Custom props
  title?: string | ((label: string | number, payload?: any) => string);
  valueLabel?: string;
  valueFormatter?: (value: string | number) => string | number;
  labelFormatter?: (label: string | number, payload?: any) => string;
  className?: string;
}

// Custom tooltip component matching the image style
const HyperchoChartTooltip = ({
  active,
  payload,
  label,
  title,
  valueLabel = "Value",
  valueFormatter,
  labelFormatter,
  className,
}: HyperchoChartTooltipProps) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Format the header/title
  const formatTitle = (): string => {
    if (title) {
      if (typeof title === "function") {
        return title(label || "", payload[0]?.payload);
      }
      return title;
    }

    // Default formatting if no title provided
    if (labelFormatter) {
      return labelFormatter(label || "", payload[0]?.payload);
    }

    // Fallback to default date formatting
    const payloadData = payload[0]?.payload;
    if (payloadData?.date) {
      const [year, month, day] = String(payloadData.date)
        .split("-")
        .map(Number);
      const date = new Date(year, month - 1, day);
      const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
      const monthName = date.toLocaleDateString("en-US", { month: "short" });
      return `${dayName}, ${monthName} ${day}`;
    }

    return String(label || "");
  };

  // Format the value
  const formatValue = (): string | number => {
    const data = payload[0];
    const value = data?.value || 0;

    if (valueFormatter) {
      return valueFormatter(value);
    }

    // Default formatting for numbers
    if (typeof value === "number") {
      return value >= 60
        ? `${Math.floor(value / 60)}h ${value % 60}m`
        : `${value}m`;
    }

    return value;
  };

  const data = payload[0];
  const color = data?.color || data?.fill || "hsl(var(--accent))";

  const formattedTitle = formatTitle();

  return (
    <div
      className={`bg-card border border-border border-solid rounded-lg px-3 py-2.5 shadow-xl min-w-[140px] ${
        className || ""
      }`}
    >
      {/* Title/Header at top */}
      {formattedTitle && (
        <div className="text-foreground text-xs font-medium mb-2.5">
          {formattedTitle}
        </div>
      )}

      {/* Data row with colored indicator */}
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-[3px] shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-muted-foreground font-medium text-xs flex-1">
          {valueLabel}
        </span>
        <span className="text-foreground text-xs font-medium tabular-nums">
          {formatValue()}
        </span>
      </div>
    </div>
  );
};

export default HyperchoChartTooltip;
