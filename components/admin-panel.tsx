"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient, configured } from "@/lib/supabase";
import {
  parseImport,
  inspectCsv,
  suggestColumns,
  type ImportField,
} from "@/lib/import";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Upload } from "lucide-react";
import { AdminEditor } from "./admin-editor";
import { centreSchema, errorMessage } from "@/lib/workflows";
type Row = {
  id?: string;
  name?: string;
  email?: string;
  domain?: string;
  address?: string;
  exam_date?: string;
  active?: boolean;
};
const defaultClient = configured ? browserClient() : null;
export default function AdminPanel({
  client = defaultClient,
}: {
  client?: ReturnType<typeof browserClient> | null;
}) {
  const db = client;
  const [allowed, setAllowed] = useState(false),
    [checked, setChecked] = useState(false),
    [message, setMessage] = useState(""),
    [tables, setTables] = useState<Record<string, Row[]>>({}),
    [preview, setPreview] = useState<ReturnType<typeof parseImport>>([]),
    [busy, setBusy] = useState(false),
    [csv, setCsv] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [columns, setColumns] = useState<Partial<Record<ImportField, string>>>({}),
    [importExam, setImportExam] = useState(""),
    [importCentre, setImportCentre] = useState(""),
    [editing, setEditing] = useState<{
      table: "exams" | "centres";
      row: Row;
    } | null>(null);
  const load = useCallback(async () => {
    if (!db) {
      setChecked(true);
      return;
    }

    const { data } = await db.rpc("is_admin");
    setAllowed(!!data);
    setChecked(true);
    if (data) {
      const names = [
        "exams",
        "centres",
        "allowed_domains",
        "email_exceptions",
        "centre_requests",
      ];
      const result: Record<string, Row[]> = {};
      for (const t of names) {
        const { data: r, error } = await db.from(t).select("*");
        if (error) setMessage(error.message);
        result[t] = r || [];
      }
      setTables(result);
    }
  }, [db]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function add(e: React.FormEvent<HTMLFormElement>, table: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    for (const key of Object.keys(values))
      if (typeof values[key] === "string")
        values[key] = String(values[key]).trim();
    if (table === "allowed_domains" || table === "email_exceptions")
      for (const key of Object.keys(values))
        values[key] = String(values[key]).toLowerCase();
    setBusy(true);
    const { error } = await db!.from(table).insert(values);
    setBusy(false);
    setMessage(error ? error.message : "Saved.");
    if (!error) {
      form.reset();
      await load();
    }
  }
  async function remove(t: string, r: Row) {
    if (
      !confirm(
        "Delete this item? Exams and centres also delete linked registrations.",
      )
    )
      return;
    const key = r.id ? "id" : r.domain ? "domain" : "email";
    const { error } = await db!.from(t).delete().eq(key, r[key]!);
    setMessage(error ? error.message : "Deleted.");
    await load();
  }
  if (!checked) return <main className="admin">Checking admin access…</main>;
  if (!allowed)
    return (
      <main className="admin">
        <a href="/">← Back to CentreMate</a>
        <h1>Admin access required</h1>
        <p>
          Sign in with an approved admin account. Admin privileges are checked
          by the database on every operation.
        </p>
        {!configured && (
          <p>Connect the Supabase project before setting up administrators.</p>
        )}
      </main>
    );
  return (
    <main className="admin">
      <a className="back" href="/">
        <ArrowLeft size={16} /> Back to CentreMate
      </a>
      <h1>CentreMate admin</h1>
      <p>
        <ShieldCheck size={17} style={{ display: "inline" }} /> Manage verified
        centres, exams and access. No dates or venues are pre-populated.
      </p>
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
      <section>
        <h2>Exams</h2>
        <form onSubmit={(e) => add(e, "exams")}>
          <label>
            Exam name
            <input name="name" required maxLength={120} />
          </label>
          <label>
            Exam date
            <input name="exam_date" type="date" required />
          </label>
          <Button disabled={busy}>Add exam</Button>
        </form>
        <ul>
          {tables.exams?.map((r) => (
            <li key={r.id}>
              <b>{r.name}</b> · {r.exam_date} ·{" "}
              {r.active ? "Active" : "Archived"}
              <br />
              <small>ID: {r.id}</small>
              <div className="inline">
                <Button
                  variant="outline"
                  onClick={() => setEditing({ table: "exams", row: r })}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const { error } = await db!
                      .from("exams")
                      .update({ active: !r.active })
                      .eq("id", r.id!);
                    setMessage(error ? error.message : "Updated.");
                    await load();
                  }}
                >
                  {r.active ? "Archive" : "Activate"}
                </Button>
                <button onClick={() => remove("exams", r)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Centres</h2>
        <form onSubmit={(e) => add(e, "centres")}>
          <label>
            Verified centre name
            <input name="name" required maxLength={160} />
          </label>
          <label>
            Full address
            <textarea name="address" required maxLength={500} />
          </label>
          <Button disabled={busy}>Add centre</Button>
        </form>
        <ul>
          {tables.centres?.map((r) => (
            <li key={r.id}>
              <b>{r.name}</b>
              <p>{r.address}</p>
              <small>ID: {r.id}</small>
              <Button
                variant="outline"
                onClick={() => setEditing({ table: "centres", row: r })}
              >
                Edit
              </Button>
              <button onClick={() => remove("centres", r)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Centre requests</h2>
        <p>
          Verify each request against official exam information before adding it
          above.
        </p>
        <ul>
          {tables.centre_requests?.map((r) => (
            <li key={r.id}>
              <b>{r.name}</b> · {r.address}
              <p>{r.email}</p>
              <Button
                disabled={busy}
                variant="outline"
                onClick={async () => {
                  if (
                    !confirm(
                      "Confirm this name and address match the official centre information?",
                    )
                  )
                    return;
                  const parsed = centreSchema.safeParse({
                    name: r.name,
                    address: r.address,
                  });
                  if (!parsed.success) {
                    setMessage(parsed.error.issues[0].message);
                    return;
                  }
                  setBusy(true);
                  try {
                    const saved = await db!
                      .from("centres")
                      .upsert(parsed.data, { onConflict: "name,address" });
                    if (saved.error) throw saved.error;
                    const resolved = await db!
                      .from("centre_requests")
                      .delete()
                      .eq("id", r.id!);
                    if (resolved.error) throw resolved.error;
                    setMessage("Verified centre added and request resolved.");
                    await load();
                  } catch (error) {
                    setMessage(errorMessage(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Add verified centre
              </Button>
              <button onClick={() => remove("centre_requests", r)}>
                Dismiss resolved request
              </button>
            </li>
          ))}
        </ul>
      </section>
      {["allowed_domains", "email_exceptions"].map((t) => (
        <section key={t}>
          <h2>
            {t === "allowed_domains"
              ? "Approved email domains"
              : "Individual email exceptions"}
          </h2>
          <p>
            {t === "allowed_domains"
              ? "Use exact lowercase domains, without @. Ownership must be verified through Google sign-in."
              : "Use a verified student email for access outside the domain allowlist."}
          </p>
          <form onSubmit={(e) => add(e, t)}>
            <label>
              {t === "allowed_domains" ? "Domain" : "Email"}
              <input
                name={t === "allowed_domains" ? "domain" : "email"}
                type={t === "allowed_domains" ? "text" : "email"}
                required
                pattern={t === "allowed_domains" ? "[a-z0-9.-]+" : undefined}
              />
            </label>
            <Button disabled={busy}>Approve</Button>
          </form>
          <ul>
            {tables[t]?.map((r) => (
              <li key={r.domain ?? r.email}>
                {r.domain ?? r.email}
                <button onClick={() => remove(t, r)}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h2>
          <Upload size={22} style={{ display: "inline" }} /> Import Google Form
          responses
        </h2>
        <p>
          Upload a Google Form response CSV, map its question columns, and
          validate before importing. New records stay private. Existing
          students’ choices are preserved.
        </p>
        <a
          className="text-link"
          download="centremate-import.csv"
          href={
            "data:text/csv;charset=utf-8," +
            encodeURIComponent("email,name,hostel,exam_id,centre_id\n")
          }
        >
          Download empty CSV template
        </a>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              setPreview([]);
              setCsv("");
              setHeaders([]);
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1024 * 1024) {
                setMessage("File must be smaller than 1 MB.");
                return;
              }
              try {
                const text = await f.text();
                const inspected = inspectCsv(text);
                if (!inspected.rows.length)
                  throw new Error("The CSV has no response rows.");
                setHeaders(inspected.headers);
                setColumns(suggestColumns(inspected.headers));
                setCsv(text);
                setMessage(
                  `${inspected.rows.length} rows loaded. Choose the mappings below, then validate.`,
                );
              } catch (error) {
                setMessage(errorMessage(error));
              }
            }}
          />
        </label>
        {!!headers.length && (
          <div className="import-mapping">
            <div className="form-row">
              <label>
                Default exam
                <select
                  value={importExam}
                  onChange={(e) => {
                    setImportExam(e.target.value);
                    setPreview([]);
                  }}
                >
                  <option value="">Use the CSV exam ID</option>
                  {tables.exams?.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name} · {exam.exam_date}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default centre
                <select
                  value={importCentre}
                  onChange={(e) => {
                    setImportCentre(e.target.value);
                    setPreview([]);
                  }}
                >
                  <option value="">Use the CSV centre</option>
                  {tables.centres?.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.name} — {centre.address}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(
              [
                "email",
                "name",
                "hostel",
                "exam_id",
                "centre_id",
              ] as ImportField[]
            ).map((field) => (
              <label key={field}>
                {
                  {
                    email: "Student email",
                    name: "Student name",
                    hostel: "Hostel",
                    exam_id: "Exam ID",
                    centre_id: "Centre name or ID",
                  }[field]
                }
                <select
                  value={columns[field] ?? ""}
                  onChange={(e) => {
                    setColumns((prev) => ({
                      ...prev,
                      [field]: e.target.value,
                    }));
                    setPreview([]);
                  }}
                >
                  <option value="">
                    {field === "exam_id" || field === "centre_id"
                      ? "Use the selected default"
                      : "Choose CSV column"}
                  </option>
                  {headers.map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
            <p>
              Hostel values must be Uni 1 or Uni 2. Centre names must match a
              unique verified directory entry. Phone numbers and imported
              consent are always ignored.
            </p>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                try {
                  const rows = parseImport(csv, {
                    columns,
                    examId: importExam,
                    centreId: importCentre,
                    centres: (tables.centres ?? []).map((c) => ({
                      id: c.id!,
                      name: c.name!,
                    })),
                  });
                  const ids = new Set(tables.exams?.map((e) => e.id));
                  if (rows.some((r) => !ids.has(r.exam_id)))
                    throw new Error(
                      "An exam ID is not in the configured exam list.",
                    );
                  setPreview(rows);
                  setMessage(
                    `${rows.length} valid rows ready for private import.`,
                  );
                } catch (error) {
                  setPreview([]);
                  setMessage(errorMessage(error));
                }
              }}
            >
              Validate and preview
            </Button>
          </div>
        )}
        {preview.length > 0 && (
          <>
            <p>{preview.length} validated rows. Preview of first 5:</p>
            <pre>
              {preview
                .slice(0, 5)
                .map((r) => `${r.name} · ${r.hostel} · ${r.email}`)
                .join("\n")}
            </pre>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const { data: inserted, error } = await db!.rpc("import_form", {
                  rows: preview,
                });
                setBusy(false);
                setMessage(
                  error
                    ? error.message
                    : `${inserted} imported privately; ${preview.length - Number(inserted)} existing or duplicate rows skipped.`,
                );
                if (!error) setPreview([]);
              }}
            >
              Import privately
            </Button>
          </>
        )}
      </section>
      <section>
        <h2>Automatic Google Sheets sync</h2>
        <p>
          Use the Apps Script in the CentreMate repository. It supports
          question-column mapping, an exam default, verified centre ID mappings,
          and either a Form-submit or scheduled trigger. All records remain
          private and duplicate imports are skipped.
        </p>
        <p>
          Set CENTREMATE_URL and CENTREMATE_SECRET in Apps Script Properties.
          The secret must match the server’s FORM_SYNC_SECRET. Keep credentials
          out of Sheet cells and source code.
        </p>
        <a
          className="text-link"
          href="https://github.com/akshat-j1/centremate/blob/main/scripts/google-sheets-sync.gs"
          target="_blank"
          rel="noreferrer"
        >
          Open sync script and setup instructions ↗
        </a>
      </section>
      {editing && (
        <AdminEditor
          {...editing}
          client={db!}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </main>
  );
}
