import Papa from "papaparse";
import { z } from "zod";
import { emailSchema } from "./workflows";
export const importRow = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(80),
  hostel: z
    .string()
    .trim()
    .pipe(z.enum(["Uni 1", "Uni 2"])),
  exam_id: z.uuid(),
  centre_id: z.uuid(),
});
export type ImportField = "email" | "name" | "hostel" | "exam_id" | "centre_id";
export type ImportOptions = {
  columns?: Partial<Record<ImportField, string>>;
  examId?: string;
  centreId?: string;
  centres?: Array<{ id: string; name: string }>;
};
export function inspectCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(
    csv.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    },
  );
  if (parsed.errors.length)
    throw new Error("Invalid CSV: " + parsed.errors[0].message);
  if (parsed.data.length > 1000)
    throw new Error("Maximum 1000 rows per import.");
  const fields = parsed.meta.fields ?? [];
  if (new Set(fields.map((h) => h.toLowerCase())).size !== fields.length)
    throw new Error("Column headers must be unique.");
  return { headers: fields, rows: parsed.data };
}
export function parseImport(csv: string, options: ImportOptions = {}) {
  const parsed = inspectCsv(csv);
  const required: ImportField[] = [
    "email",
    "name",
    "hostel",
    "exam_id",
    "centre_id",
  ];
  const column = (field: ImportField) =>
    options.columns?.[field] ??
    parsed.headers.find((h) => h.toLowerCase() === field);
  for (const f of required) {
    if (
      !column(f) &&
      !(f === "exam_id" && options.examId) &&
      !(f === "centre_id" && options.centreId)
    )
      throw new Error(`Choose a column or default for ${f}.`);
  }
  return parsed.rows.map((r, i) => {
    const row = Object.fromEntries(
      required.map((f) => [f, r[column(f) ?? ""]?.trim() ?? ""]),
    );
    if (!row.exam_id) row.exam_id = options.examId ?? "";
    if (!row.centre_id) row.centre_id = options.centreId ?? "";
    if (!z.uuid().safeParse(row.centre_id).success && options.centres) {
      const matches = options.centres.filter(
        (c) => c.name.toLowerCase() === row.centre_id.toLowerCase(),
      );
      if (matches.length === 1) row.centre_id = matches[0].id;
      else if (matches.length > 1)
        throw new Error(`Row ${i + 2}: centre name is ambiguous; use its ID.`);
    }
    const result = importRow.safeParse(row);
    if (!result.success)
      throw new Error(
        `Row ${i + 2}: ${result.error.issues.map((x) => x.path.join(".") + " " + x.message).join(", ")}`,
      );
    if (
      options.centres &&
      !options.centres.some((c) => c.id === result.data.centre_id)
    )
      throw new Error(`Row ${i + 2}: centre is not in the verified directory.`);
    return result.data;
  });
}
export function suggestColumns(
  headers: string[],
): Partial<Record<ImportField, string>> {
  const aliases: Record<ImportField, string[]> = {
    email: ["email", "email address", "student email"],
    name: ["name", "full name", "your name", "student name"],
    hostel: ["hostel", "your hostel", "hostel name"],
    exam_id: ["exam_id", "exam id"],
    centre_id: [
      "centre_id",
      "centre id",
      "exam centre",
      "exam center",
      "centre",
      "center",
    ],
  };
  return Object.fromEntries(
    Object.entries(aliases)
      .map(([field, names]) => [
        field,
        headers.find((h) => names.includes(h.trim().toLowerCase())),
      ])
      .filter(([, value]) => value),
  );
}
