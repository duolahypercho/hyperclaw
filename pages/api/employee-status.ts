import type { NextApiRequest, NextApiResponse } from "next";
import type { EmployeeStatus } from "$/components/PixelOffice/types";

const AGENT_IDS = [
  "jarvis",
  "atlas",
  "scribe",
  "clawd",
  "pixel",
  "nova",
  "vibe",
  "sentinel",
  "trendy",
];

const NAMES: Record<string, string> = {
  jarvis: "JARVIS",
  atlas: "ATLAS",
  scribe: "SCRIBE",
  clawd: "CLAWD",
  pixel: "PIXEL",
  nova: "NOVA",
  vibe: "VIBE",
  sentinel: "SENTINEL",
  trendy: "TRENDY",
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const employees: EmployeeStatus[] = AGENT_IDS.map((id) => ({
    id,
    name: NAMES[id] ?? id.toUpperCase(),
    status: id === "jarvis" ? "working" : Math.random() > 0.7 ? "working" : "idle",
  }));

  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(200).json({ employees });
}
