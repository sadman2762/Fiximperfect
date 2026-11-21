import type { SafetyLevel } from "@/types/domain";

/**
 * One-tap emergency presets on the student report form. Each text is written so
 * the deterministic safety rules classify it (see tests/unit/safety-rules.test.ts),
 * so an emergency is escalated even if the AI is unavailable.
 */
export interface EmergencyPreset {
  id: string;
  label: string;
  icon: string;
  text: string;
  level: Extract<SafetyLevel, "critical" | "elevated">;
}

export const EMERGENCY_PRESETS: EmergencyPreset[] = [
  { id: "fire", label: "Fire or smoke", icon: "🔥", text: "There is smoke here, possibly a fire.", level: "critical" },
  { id: "water-electric", label: "Water near electricity", icon: "⚡", text: "There is water near an electrical socket.", level: "critical" },
  { id: "sparks", label: "Sparks or a socket went bang", icon: "💥", text: "A socket is sparking and it went bang.", level: "critical" },
  { id: "gas", label: "Gas smell", icon: "💨", text: "There is a strong smell of gas.", level: "critical" },
  { id: "lift", label: "Someone stuck in the lift", icon: "🛗", text: "Someone is stuck in the lift.", level: "critical" },
  { id: "earthquake", label: "Earthquake or shaking", icon: "🌐", text: "The whole building is shaking.", level: "critical" },
  { id: "flood", label: "Flooding", icon: "🌊", text: "Water is pouring across the whole floor.", level: "critical" },
  { id: "power", label: "Power cut", icon: "🔌", text: "Power cut: the whole floor has no electricity.", level: "elevated" },
];
