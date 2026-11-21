export const STAFF_ROLES = ["caretaker", "maintenance_staff", "administrator", "management"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const TICKET_STATUSES = [
  "submitted",
  "needs_review",
  "assigned",
  "in_progress",
  "waiting_for_parts",
  "resolved",
  "reopened",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SAFETY_LEVELS = ["none", "low", "elevated", "critical"] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export type AiMode = "live" | "mock";

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  building_access: string[];
  is_active: boolean;
}

export interface Building {
  id: string;
  name: string;
  code: string;
  address: string | null;
}

export interface LocationRow {
  id: string;
  building_id: string;
  floor: number;
  area_name: string;
  qr_slug: string;
  location_type: string;
}

export interface AssetRow {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  building_id: string;
  location_id: string;
  qr_slug: string | null;
  installation_date: string | null;
  purchase_date: string | null;
  purchase_cost: string | null;
  replacement_cost: string | null;
  currency: string;
  expected_useful_life_years: number | null;
  condition: string;
  operational_status: string;
}

export interface TicketRow {
  id: string;
  ticket_number: string;
  building_id: string;
  location_id: string;
  asset_id: string | null;
  category: string;
  subcategory: string | null;
  title: string;
  description: string;
  priority: Priority;
  priority_reason: string | null;
  safety_level: SafetyLevel;
  safety_reason: string | null;
  escalation_status: "none" | "pending" | "alerting" | "acknowledged" | "exhausted";
  status: TicketStatus;
  needs_review_reason: string | null;
  assigned_team_id: string | null;
  assigned_to: string | null;
  routing_reason: string | null;
  resolved_at: string | null;
  resolution_verified: boolean;
  verified_at: string | null;
  closed_at: string | null;
  reopened_count: number;
  merged_into: string | null;
  ai_mode: "live" | "mock" | "manual";
  created_at: string;
  updated_at: string;
}

/** Location context resolved server-side from a QR slug. Never from the browser. */
export interface QrContext {
  kind: "asset" | "location";
  slug: string;
  building: Building;
  location: LocationRow;
  asset: AssetRow | null;
  /** Assets at this location a student may optionally pick from (location QR codes). */
  locationAssets: Pick<AssetRow, "id" | "asset_code" | "asset_name" | "category">[];
}
