import React from "react";
import { CircleHelp } from "lucide-react";
import {
  Provider,
  Root,
  Trigger,
  Content,
  Arrow,
  Portal,
} from "@radix-ui/react-tooltip";

const HyperchoHint = ({ value }: { value: string }) => {
  return (
    <Provider>
      <Root delayDuration={300} disableHoverableContent={true}>
        <Trigger asChild>
          <button
            type="button"
            className="focus:outline-none select-none pointer-events-auto cursor-help"
            tabIndex={-1}
          >
            <CircleHelp className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        </Trigger>
        <Portal>
          <Content
            className="backdrop-blur-sm bg-background/90 text-xs font-medium max-w-[210px] font-hypercho data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none px-3 py-[6px] text-font-active z-[1000] border border-solid border-primary/10 rounded-md"
            sideOffset={5}
            side="bottom"
          >
            <span>{value}</span>
            <Arrow
              className="fill-background backdrop-blur"
              style={{
                stroke: "hsl(var(--border))",
                strokeWidth: 1.5,
              }}
            />
          </Content>
        </Portal>
      </Root>
    </Provider>
  );
};

export default HyperchoHint;
