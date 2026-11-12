import { z } from "zod";
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const registrationSchema = z.object({
  email: emailSchema,
  exam_id: z.uuid(),
  centre_id: z.uuid(),
  name: z.string().trim().min(1, "Enter your name.").max(80),
  hostel: z.enum(["Uni 1", "Uni 2"]),
  departure: z
    .union([
      z.literal(""),
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    ])
    .transform((v) => v || null),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/[\s+()-]/g, ""))
    .refine(
      (v) => !v || /^[1-9][0-9]{7,14}$/.test(v),
      "Enter a valid WhatsApp number with country code.",
    )
    .transform((v) => v || null),
  visible: z.boolean(),
  going: z.boolean(),
});
export const centreSchema = z.object({
  name: z.string().trim().min(1, "Enter a centre name.").max(160),
  address: z.string().trim().min(1, "Enter the full address.").max(500),
});
export function safeReturnPath(value: string | undefined | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  )
    return "/";
  try {
    const u = new URL(value, "https://centremate.invalid");
    if (
      u.origin !== "https://centremate.invalid" ||
      !(
        u.pathname === "/" ||
        u.pathname === "/admin" ||
        /^\/centre\/[0-9a-f-]{36}$/.test(u.pathname)
      )
    )
      return "/";
    u.searchParams.delete("code");
    u.searchParams.delete("error");
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}
export function isReturning(
  until: string | null | undefined,
  now = Date.now(),
) {
  return !!until && new Date(until).getTime() > now;
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "Something went wrong. Please try again.";
}
