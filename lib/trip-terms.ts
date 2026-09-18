/**
 * S83 ([[d147]]) — the car a trip asks for, as one comparable string. A Business may now change
 * the car (and so the price) of a trip still in the Pool, so the Driver's page sends back the
 * car it showed, and accept refuses when it no longer matches.
 */
export function carKey(m: {
  category: string;
  required_body_type: string | null;
  required_make: string | null;
  required_model: string | null;
}): string {
  return [m.category, m.required_body_type ?? "", m.required_make ?? "", m.required_model ?? ""].join("|");
}
