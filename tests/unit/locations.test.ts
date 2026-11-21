import { describe, expect, it } from "vitest";
import { locationIdentifiers, firstFree } from "@/lib/locations/identifiers";
import { floorAndPlace, fullLocation, placeName } from "@/lib/locations/label";
import { ReportSubmissionSchema } from "@/lib/validations/schemas";
import { EQUIPMENT_CATEGORIES } from "@/lib/locations/equipment-categories";

describe("location identifiers", () => {
  it("generates a room QR slug and printed code from building and room number", () => {
    expect(locationIdentifiers({ buildingCode: "KOS-B", floor: 2, roomNumber: "204", areaName: "Room 204" })).toEqual({ qrSlug: "kos-b-room-204", locationCode: "KOS-B-R204" });
  });
  it("generates shared-space identifiers from floor and name", () => {
    expect(locationIdentifiers({ buildingCode: "RIV", floor: 0, areaName: "Ground Floor Kitchen" })).toEqual({ qrSlug: "riv-floor0-ground-floor-kitchen", locationCode: "RIV-F0-GROUND-FLOOR" });
    expect(locationIdentifiers({ buildingCode: "RIV", floor: -1, areaName: "Bike Storage" }).qrSlug).toBe("riv-floorb1-bike-storage");
  });
  it("always produces values the database constraints accept", () => {
    const ids = locationIdentifiers({ buildingCode: "Kós B", floor: 3, roomNumber: "3.14 A", areaName: "Ünnepi Szoba" });
    expect(ids.qrSlug).toMatch(/^[a-z0-9-]{3,80}$/);
    expect(ids.locationCode).toMatch(/^[A-Z0-9-]{2,80}$/);
  });
  it("adds a suffix when an identifier is taken", async () => {
    const taken = new Set(["kos-b-room-204", "kos-b-room-204-2"]);
    expect(await firstFree("kos-b-room-204", async (v) => taken.has(v))).toBe("kos-b-room-204-3");
  });
});

describe("location labels", () => {
  it("labels rooms by number and shared spaces by name", () => {
    expect(placeName({ floor: 2, area_name: "Room 204", room_number: "204" })).toBe("Room 204");
    expect(floorAndPlace({ floor: 2, area_name: "Laundry Room", room_number: null })).toBe("Floor 2 · Laundry Room");
    expect(fullLocation("Kossuth Dorm B", { floor: 2, area_name: "x", room_number: "204" })).toBe("Kossuth Dorm B — Floor 2 — Room 204");
  });
});

describe("report submission input", () => {
  const base = { qrSlug: "kossuth-b-room-204", description: "Broken", reporterName: "A", reporterEmail: "a@example.com" };
  it("accepts every offered equipment category, or none", () => {
    for (const c of EQUIPMENT_CATEGORIES) expect(ReportSubmissionSchema.safeParse({ ...base, equipmentCategory: c.value }).success).toBe(true);
    expect(ReportSubmissionSchema.safeParse({ ...base, equipmentCategory: null }).success).toBe(true);
    expect(ReportSubmissionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects unknown categories and never accepts location or equipment IDs from the browser", () => {
    expect(ReportSubmissionSchema.safeParse({ ...base, equipmentCategory: "Spaceship" }).success).toBe(false);
    const parsed = ReportSubmissionSchema.parse({ ...base, locationId: "x", assetId: "y", buildingId: "z" });
    expect(parsed).not.toHaveProperty("locationId");
    expect(parsed).not.toHaveProperty("assetId");
  });
});

