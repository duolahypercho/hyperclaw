import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export interface TerminalLine {
  text: string;
  type: "info" | "success" | "error" | "step";
}

interface DoctorTerminalContextType {
  isOpen: boolean;
  lines: TerminalLine[];
  isRunning: boolean;
  open: () => void;
  close: () => void;
  runDoctorFix: () => void;
}

const DoctorTerminalContext = createContext<DoctorTerminalContextType | undefined>(undefined);

export const useDoctorTerminal = () => {
  const ctx = useContext(DoctorTerminalContext);
  if (!ctx) throw new Error("useDoctorTerminal must be used within DoctorTerminalProvider");
  return ctx;
};

export const DoctorTerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);

  const addLine = useCallback((text: string, type: TerminalLine["type"] = "info") => {
    setLines((prev) => [...prev, { text, type }]);
  }, []);

  /** Emit multiple lines with a small staggered delay to feel "live". */
  const emitLines = useCallback((linesArr: TerminalLine[], delayMs = 60) => {
    linesArr.forEach((line, i) => {
      setTimeout(() => {
        setLines((prev) => [...prev, line]);
      }, i * delayMs);
    });
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    if (!runningRef.current) setIsOpen(false);
  }, []);

  const runDoctorFix = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLines([]);
    setIsOpen(true);
    setIsRunning(true);

    const finish = (success: boolean) => {
      runningRef.current = false;
      setIsRunning(false);
      window.dispatchEvent(new CustomEvent("openclaw-doctor-done", { detail: { success } }));
    };

    (async () => {
      addLine("$ openclaw doctor --fix", "info");
      addLine("Sending command to connector...", "step");

      try {
        const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
        const result = await bridgeInvoke("openclaw-doctor-fix");

        if (result && typeof result === "object") {
          const r = result as Record<string, any>;
          const outputLines: TerminalLine[] = [];

          // Emit stdout line by line
          const stdout = r.output || r.stdout || r.result;
          if (typeof stdout === "string") {
            stdout.split("\n").filter(Boolean).forEach((line: string) => {
              outputLines.push({ text: line, type: "info" });
            });
          }

          // Emit stderr line by line
          if (r.stderr && typeof r.stderr === "string") {
            r.stderr.split("\n").filter(Boolean).forEach((line: string) => {
              outputLines.push({ text: line, type: "info" });
            });
          }

          // Emit structured steps
          if (Array.isArray(r.steps)) {
            r.steps.forEach((step: any) => {
              const ok = step.status === "ok";
              outputLines.push({ text: `${ok ? "✓" : "✗"} ${step.name || step.step}`, type: ok ? "success" : "error" });
            });
          }

          // Stagger output so it feels live
          emitLines(outputLines, 50);

          // Final status after all lines have rendered
          const finalDelay = outputLines.length * 50 + 100;
          setTimeout(() => {
            if (r.success === false || r.error) {
              addLine(r.error || "Command failed", "error");
              finish(false);
            } else {
              addLine("Doctor fix completed.", "success");
              finish(true);
            }
          }, finalDelay);
        } else {
          addLine("Doctor fix completed.", "success");
          finish(true);
        }
      } catch (err: any) {
        addLine(`Error: ${err?.message || "Could not run openclaw doctor --fix."}`, "error");
        finish(false);
      }
    })();
  }, [addLine, emitLines]);

  return (
    <DoctorTerminalContext.Provider value={{ isOpen, lines, isRunning, open, close, runDoctorFix }}>
      {children}
    </DoctorTerminalContext.Provider>
  );
};
