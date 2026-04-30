"use client";

import React, { ReactElement } from "react";
import {
  Provider,
  Root,
  Trigger,
  Content,
  Arrow,
  Portal,
} from "@radix-ui/react-tooltip";
import { cn } from "$/utils";

type TooltipSide = "top" | "right" | "bottom" | "left";

type HyperchoTooltipProps = {
  children: ReactElement;
  value: string;
  side?: TooltipSide;
  className?: string;
};

function HyperchoTooltip({
  children,
  value,
  side = "bottom",
  className,
}: HyperchoTooltipProps) {
  return (
    <Provider>
      <Root delayDuration={100} disableHoverableContent={true}>
        <Trigger asChild>
          {children}
        </Trigger>
        <Portal>
          <Content
            className={cn(
              "backdrop-blur-sm font-medium bg-popover text-foreground/70 text-xs max-w-[210px] font-hypercho data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none px-3 py-[6px] text-font-active z-[1000] border border-solid border-primary/30 rounded-md",
              className
            )}
            sideOffset={5}
            side={side}
          >
            {value}
            <Arrow
              className="fill-popover backdrop-blur-sm z-50"
              style={{
                stroke: "hsl(var(--primary) / 0.3)",
                strokeWidth: 1,
              }}
            />
          </Content>
        </Portal>
      </Root>
    </Provider>
  );
}

HyperchoTooltip.displayName = "HyperchoTooltip";

export default HyperchoTooltip;
