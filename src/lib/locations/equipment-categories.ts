/**
 * Optional "what is it about?" choices on the student form. Values are the
 * maintenance category names used for routing, so a choice is a direct hint
 * to the classifier. Equipment is never identified by QR code.
 */
export const EQUIPMENT_CATEGORIES = [
  { value: "Laundry Equipment", label: "Washing machine or dryer" },
  { value: "Kitchen Appliances", label: "Refrigerator or kitchen appliance" },
  { value: "Heating", label: "Heating" },
  { value: "Furniture", label: "Furniture" },
  { value: "Electrical", label: "Electrical problem" },
  { value: "Plumbing", label: "Plumbing" },
  { value: "Internet", label: "Internet connectivity" },
  { value: "General", label: "Other" },
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]["value"];
export const EQUIPMENT_CATEGORY_VALUES = EQUIPMENT_CATEGORIES.map((c) => c.value) as [EquipmentCategory, ...EquipmentCategory[]];

