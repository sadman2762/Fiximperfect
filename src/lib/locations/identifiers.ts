/**
 * Generates the permanent identifiers of a new location. `qr_slug` is the
 * value encoded in the QR code (lower-case, URL-safe); `location_code` is the
 * human-readable label printed under it. Both are generated once, on
 * creation, and never change when the room is renamed or its equipment is
 * replaced — so printed labels keep working.
 */
function part(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function locationIdentifiers(input: { buildingCode: string; floor: number; roomNumber?: string | null; areaName: string }): {
  qrSlug: string;
  locationCode: string;
} {
  const b = part(input.buildingCode) || "bldg";
  const floor = input.floor < 0 ? `b${-input.floor}` : String(input.floor);
  const tail = input.roomNumber ? `room-${part(input.roomNumber)}` : `floor${floor}-${part(input.areaName) || "area"}`;
  const qrSlug = `${b}-${tail}`.slice(0, 72);
  const code = input.roomNumber ? `${b}-R${part(input.roomNumber)}` : `${b}-F${floor}-${part(input.areaName).split("-").slice(0, 2).join("-")}`;
  return { qrSlug, locationCode: code.toUpperCase().slice(0, 72) };
}

/** Appends -2, -3, … until `taken` reports the value free. */
export async function firstFree(base: string, taken: (candidate: string) => Promise<boolean>, sep = "-"): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}${sep}${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error("could not generate a unique identifier");
}
