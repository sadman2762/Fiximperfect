/** Human-readable location labels shared by staff and student screens and e-mails. */
export interface LocationLike {
  floor: number;
  area_name: string;
  room_number?: string | null;
}

/** "Room 204" for rooms, otherwise the shared-space name ("Laundry Room"). */
export function placeName(l: LocationLike): string {
  return l.room_number ? `Room ${l.room_number}` : l.area_name;
}

/** "Floor 2 · Room 204" */
export function floorAndPlace(l: LocationLike): string {
  return `Floor ${l.floor} · ${placeName(l)}`;
}

/** "Kossuth Dorm B — Floor 2 — Room 204" */
export function fullLocation(building: string, l: LocationLike): string {
  return `${building} — Floor ${l.floor} — ${placeName(l)}`;
}
