import Papa from "papaparse";
import { z } from "zod";
export const importRow = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().min(1).max(80),
  hostel: z.enum(["Uni 1", "Uni 2"]),
  exam_id: z.uuid(),
  centre_id: z.uuid(),
});
export function parseImport(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length)
    throw new Error("Invalid CSV: " + parsed.errors[0].message);
  if (parsed.data.length > 1000)
    throw new Error("Maximum 1000 rows per import.");
  return parsed.data.map((r, i) => {
    const result = importRow.safeParse(r);
    if (!result.success)
      throw new Error(
        `Row ${i + 2}: ${result.error.issues.map((x) => x.path.join(".") + " " + x.message).join(", ")}`,
      );
    return result.data;
  });
}
