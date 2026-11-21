import "server-only";
import { z } from "zod";
import { SETTING_BOUNDS, type AppSettings } from "@/lib/settings";

const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "amount with up to 2 decimals")
  .or(z.literal("").transform(() => null))
  .nullable()
  .optional();
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("").transform(() => null)).nullable().optional();
const phone = z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/, "E.164 format, e.g. +447700900123").or(z.literal("").transform(() => null)).nullable().optional();

/** Validation schemas for administrator-managed entities. Table names are fixed here, never taken from input. */
export const ADMIN_ENTITIES = {
  buildings: {
    table: "buildings",
    schema: z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/), address: optText(300) }),
  },
  locations: {
    table: "locations",
    schema: z.object({
      building_id: z.string().uuid(),
      floor: z.coerce.number().int().min(-5).max(100),
      /** Room number for rooms ("204"); empty for shared spaces. */
      room_number: z.string().trim().max(20).regex(/^[A-Za-z0-9 .-]*$/, "letters, digits, spaces, dots and dashes").optional().nullable().transform((v) => v || null),
      /** Display name; defaults to "Room <number>" for rooms. */
      area_name: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
      location_type: z.enum(["laundry", "kitchen", "corridor", "bathroom", "common_room", "bedroom", "technical", "other"]),
    }),
  },
  assets: {
    table: "assets",
    schema: z.object({
      asset_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),
      asset_name: z.string().trim().min(2).max(120),
      category: z.string().trim().min(2).max(60),
      manufacturer: optText(120),
      model: optText(120),
      building_id: z.string().uuid(),
      location_id: z.string().uuid(),
      installation_date: date,
      purchase_date: date,
      purchase_cost: money,
      replacement_cost: money,
      currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"),
      expected_useful_life_years: z.coerce.number().int().min(1).max(100).nullable().optional(),
      condition: z.enum(["new", "good", "fair", "poor", "critical"]).default("good"),
      operational_status: z.enum(["operational", "degraded", "out_of_service", "retired"]).default("operational"),
    }),
  },
  teams: {
    table: "maintenance_teams",
    schema: z.object({
      team_name: z.string().trim().min(2).max(120),
      description: optText(500),
      responsible_categories: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
      is_manual_review_queue: z.boolean().default(false),
    }),
  },
  categories: {
    table: "categories",
    schema: z.object({
      name: z.string().trim().min(2).max(60),
      description: optText(300),
      default_team_id: z.string().uuid().nullable().optional(),
      default_priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    }),
  },
  routing_rules: {
    table: "routing_rules",
    schema: z.object({ category_id: z.string().uuid(), building_id: z.string().uuid().nullable().optional(), team_id: z.string().uuid() }),
  },
  contacts: {
    table: "emergency_contacts",
    schema: z
      .object({
        building_id: z.string().uuid(),
        contact_role: z.enum(["primary_caretaker", "secondary_caretaker", "backup_maintenance"]),
        escalation_order: z.coerce.number().int().min(1).max(10),
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().or(z.literal("").transform(() => null)).nullable().optional(),
        phone,
      })
      .refine((v) => v.email || v.phone, "Provide an email or a phone number"),
  },
} as const;

export type AdminEntity = keyof typeof ADMIN_ENTITIES;

export const StaffCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(["caretaker", "maintenance_staff", "administrator", "management"]),
  phone,
  building_access: z.array(z.string().uuid()).default([]),
  team_ids: z.array(z.string().uuid()).default([]),
  password: z.string().min(12, "at least 12 characters").max(128),
});

export const StaffUpdateSchema = StaffCreateSchema.omit({ email: true, password: true }).partial().extend({ is_active: z.boolean().optional() });

export const SettingsSchema = z.object(
  Object.fromEntries(
    (Object.keys(SETTING_BOUNDS) as (keyof AppSettings)[]).map((k) => [k, z.coerce.number().min(SETTING_BOUNDS[k][0]).max(SETTING_BOUNDS[k][1]).optional()]),
  ) as Record<keyof AppSettings, z.ZodOptional<z.ZodCoercedNumber>>,
).refine(
  (v) => v.duplicate_auto_link_threshold === undefined || v.duplicate_review_threshold === undefined || v.duplicate_review_threshold < v.duplicate_auto_link_threshold,
  "The review threshold must be lower than the auto-link threshold",
);

