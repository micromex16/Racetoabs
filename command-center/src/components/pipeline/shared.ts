export const STAGES = ["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  TARGET: "Target",
  CONTACTED: "Contacted",
  SAMPLE_SENT: "Sample Sent",
  DISCOVERY: "Discovery",
  RFQ: "RFQ",
  QUOTED: "Quoted",
  PILOT: "Pilot",
  CUSTOMER: "Customer",
};
export type Lane = "DATA_CENTER" | "AD" | "OTHER";
export const LANE_LABEL: Record<Lane, string> = { DATA_CENTER: "Data Center", AD: "A&D", OTHER: "Other" };
export const LANE_TONE: Record<Lane, "r3" | "r1" | "neutral"> = { DATA_CENTER: "r3", AD: "r1", OTHER: "neutral" };
