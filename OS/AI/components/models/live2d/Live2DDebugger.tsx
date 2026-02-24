"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Smile,
  Volume2,
  Info,
  X,
  Mic,
  MicOff,
  Brain,
} from "lucide-react";
import { useCopanionInterface } from "@OS/AI/components/models/CopanionInterfaceProvider";

interface Live2DDebuggerProps {
  model: any;
  className?: string;
  onClose?: () => void;
}

export const Live2DDebugger: React.FC<Live2DDebuggerProps> = ({
  model,
  className = "",
  onClose,
}) => {
  const [availableMotions, setAvailableMotions] = useState<string[]>([]);
  const [availableExpressions, setAvailableExpressions] = useState<string[]>(
    []
  );

  // Use CopanionInterface context for ActionController
  const {
    isIdle,
    isTalking,
    currentAction,
    actionQueue,
    actionHistory,
    activeActions,
    startIdle,
    startTalking,
    stopTalking,
    executeMotion,
    changeExpression,
    playSound,
    clearQueue,
    clearHistory,
    startThinking,
    stopThinking,
  } = useCopanionInterface();

  const testMotion = (motionGroup: string, index: number = 0) => {
    executeMotion(motionGroup, index, 3000);
    onClose?.(); // Close popover to see the animation
  };

  const testExpression = (expression: string) => {
    changeExpression(expression, 2000);
    onClose?.(); // Close popover to see the expression
  };

  const testSound = (soundId: string) => {
    playSound(soundId, 2000);
    onClose?.(); // Close popover to see the result
  };

  const toggleTalking = () => {
    if (isTalking) {
      stopTalking();
    } else {
      startTalking();
    }
  };

  const toggleThinking = () => {
    if (activeActions.thinking) {
      stopThinking();
    } else {
      startThinking(3000); // 3 second intervals
    }
  };

  const loadModelInfo = () => {
    if (model) {
      const motions = model.getAvailableMotions?.() || [];
      const expressions = model.getAvailableExpressions?.() || [];
      setAvailableMotions(motions);
      setAvailableExpressions(expressions);
    }
  };

  React.useEffect(() => {
    if (model) {
      loadModelInfo();
    }
  }, [model]);

  if (!model) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4" />
          <h3 className="font-semibold">Live2D Debugger</h3>
        </div>
        <p className="text-muted-foreground">No model loaded</p>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4" />
          <h3 className="font-semibold">Live2D Debugger</h3>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      <div className="space-y-4">
        {/* Model Status */}
        <div className="flex items-center gap-2">
          <Badge variant="outline">Model Ready</Badge>
          <Button size="sm" variant="outline" onClick={loadModelInfo}>
            Refresh Info
          </Button>
        </div>

        {/* ActionController State */}
        <div className="p-2 bg-muted rounded text-xs">
          <strong>ActionController State:</strong>
          <div className="flex gap-2 items-center mt-1">
            <Badge
              variant={isIdle ? "default" : "secondary"}
              className="text-xs"
            >
              {isIdle ? "Idle" : "Active"}
            </Badge>
            <Badge
              variant={isTalking ? "destructive" : "outline"}
              className="text-xs"
            >
              {isTalking ? "Talking" : "Silent"}
            </Badge>
            <Badge
              variant={activeActions.thinking ? "destructive" : "outline"}
              className="text-xs"
            >
              {activeActions.thinking ? "Thinking" : "Not Thinking"}
            </Badge>
            {currentAction && (
              <span className="text-xs text-muted-foreground">
                Current: {currentAction.action.type}
              </span>
            )}
            {actionQueue.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Queue: {actionQueue.length}
              </span>
            )}
          </div>
        </div>

        {/* Available Motions */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Play className="w-3 h-3" />
            Motions ({availableMotions.length})
          </h4>
          <div className="flex flex-row flex-wrap gap-1">
            {availableMotions.map((motion) => {
              // Get motion count for this group
              const motionCount = model?.motionGroups?.[motion]?.length || 1;
              return (
                <div key={motion} className="flex flex-wrap gap-1">
                  {Array.from({ length: motionCount }, (_, index) => (
                    <Button
                      key={`${motion}-${index}`}
                      size="sm"
                      variant="outline"
                      onClick={() => testMotion(motion, index)}
                      className="text-xs h-6 px-2"
                    >
                      {motionCount > 1 ? `${motion}[${index}]` : motion}
                    </Button>
                  ))}
                </div>
              );
            })}
            {availableMotions.length === 0 && (
              <Badge variant="secondary" className="text-xs h-6">
                No motions available
              </Badge>
            )}
          </div>
        </div>

        {/* Available Expressions */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Smile className="w-3 h-3" />
            Expressions ({availableExpressions.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {availableExpressions.map((expression) => (
              <Button
                key={expression}
                size="sm"
                variant="outline"
                onClick={() => testExpression(expression)}
                className="text-xs h-6 px-2"
              >
                {expression}
              </Button>
            ))}
            {availableExpressions.length === 0 && (
              <Badge variant="secondary" className="text-xs h-6">
                No expressions available
              </Badge>
            )}
          </div>
        </div>

        {/* Character State Controls */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            Character State
          </h4>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isTalking ? "destructive" : "default"}
              onClick={toggleTalking}
              className="text-xs h-6 px-3"
            >
              {isTalking ? (
                <>
                  <MicOff className="w-3 h-3 mr-1" />
                  Stop Talking
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3 mr-1" />
                  Start Talking
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant={activeActions.thinking ? "destructive" : "default"}
              onClick={toggleThinking}
              className="text-xs h-6 px-3"
            >
              {activeActions.thinking ? (
                <>
                  <Brain className="w-3 h-3 mr-1" />
                  Stop Thinking
                </>
              ) : (
                <>
                  <Brain className="w-3 h-3 mr-1" />
                  Start Thinking
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Test Sounds */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Volume2 className="w-3 h-3" />
            Test Sounds
          </h4>
          <div className="flex flex-wrap gap-1">
            {["hello", "goodbye", "thinking", "happy", "sad"].map((sound) => (
              <Button
                key={sound}
                size="sm"
                variant="outline"
                onClick={() => testSound(sound)}
                className="text-xs h-6 px-2"
              >
                {sound}
              </Button>
            ))}
          </div>
        </div>

        {/* Advanced Testing */}
        <div>
          <h4 className="text-sm font-medium mb-2">Advanced Testing</h4>
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => startIdle(3000)}
              className="text-xs h-6 px-2"
            >
              Force Idle
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearQueue}
              className="text-xs h-6 px-2"
            >
              Clear Queue
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearHistory}
              className="text-xs h-6 px-2"
            >
              Clear History
            </Button>
          </div>
        </div>

        {/* Action History */}
        {actionHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">
              Action History ({actionHistory.length})
            </h4>
            <div className="max-h-24 overflow-y-auto space-y-1">
              {actionHistory.slice(0, 5).map((action) => (
                <div
                  key={action.id}
                  className="text-xs text-muted-foreground flex justify-between"
                >
                  <span>{action.action.type}</span>
                  <span className="text-xs opacity-70">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model Methods Debug */}
        <div className="p-2 bg-muted rounded text-xs">
          <strong>Methods:</strong>
          <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
            <span>
              executeMotion:{" "}
              {typeof model.executeMotion === "function" ? "✅" : "❌"}
            </span>
            <span>
              executeMotionLoop:{" "}
              {typeof model.executeMotionLoop === "function" ? "✅" : "❌"}
            </span>
            <span>
              stopMotionLoop:{" "}
              {typeof model.stopMotionLoop === "function" ? "✅" : "❌"}
            </span>
            <span>
              isMotionLooping:{" "}
              {typeof model.isMotionLooping === "function" ? "✅" : "❌"}
            </span>
            <span>
              changeExpression:{" "}
              {typeof model.changeExpression === "function" ? "✅" : "❌"}
            </span>
            <span>
              playSound: {typeof model.playSound === "function" ? "✅" : "❌"}
            </span>
            <span>
              getMotions:{" "}
              {typeof model.getAvailableMotions === "function" ? "✅" : "❌"}
            </span>
            <span>
              getExpressions:{" "}
              {typeof model.getAvailableExpressions === "function"
                ? "✅"
                : "❌"}
            </span>
            <span>
              startTalking:{" "}
              {typeof model.startTalking === "function" ? "✅" : "❌"}
            </span>
            <span>
              stopTalking:{" "}
              {typeof model.stopTalking === "function" ? "✅" : "❌"}
            </span>
            <span>
              isCurrentlyTalking:{" "}
              {typeof model.isCurrentlyTalking === "function" ? "✅" : "❌"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
