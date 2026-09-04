// Turns a stored normalizedType ("double_standard") into display text
// ("Double Standard") - used by YourHotelSummary and anywhere else that
// needs to show a room type to a visitor rather than the internal slug.
// No invented detail beyond what's actually in rooms.normalizedType.
export function humanizeRoomType(normalizedType: string): string {
  return normalizedType
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
