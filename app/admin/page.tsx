"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient, configured } from "@/lib/supabase";
import { parseImport } from "@/lib/import";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Upload } from "lucide-react";
type Row = {
  id?: string;
  name?: string;
  email?: string;
  domain?: string;
  address?: string;
  exam_date?: string;
  active?: boolean;
};
export default function Admin() {
  const [allowed, setAllowed] = useState(false),
    [checked, setChecked] = useState(false),
    [message, setMessage] = useState(""),
    [tables, setTables] = useState<Record<string, Row[]>>({}),
    [preview, setPreview] = useState<ReturnType<typeof parseImport>>([]),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!configured) {
      setChecked(true);
      return;
    }
    const db = browserClient();
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
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function add(e: React.FormEvent<HTMLFormElement>, table: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    const { error } = await browserClient().from(table).insert(values);
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
    const { error } = await browserClient().from(t).delete().eq(key, r[key]!);
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
                  onClick={async () => {
                    const name = prompt("Exam name", r.name);
                    if (!name) return;
                    const date = prompt("Exam date (YYYY-MM-DD)", r.exam_date);
                    if (!date) return;
                    const { error } = await browserClient()
                      .from("exams")
                      .update({ name, exam_date: date })
                      .eq("id", r.id!);
                    setMessage(error ? error.message : "Exam updated.");
                    await load();
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const { error } = await browserClient()
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
                onClick={async () => {
                  const name = prompt("Centre name", r.name);
                  if (!name) return;
                  const address = prompt("Full address", r.address);
                  if (!address) return;
                  const { error } = await browserClient()
                    .from("centres")
                    .update({ name, address })
                    .eq("id", r.id!);
                  setMessage(error ? error.message : "Centre updated.");
                  await load();
                }}
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
        <p>Export Google Sheets as CSV. Required headers:</p>
        <pre>email,name,hostel,exam_id,centre_id</pre>
        <p>
          Use the exam and centre IDs shown above. Hostel must be Uni 1 or Uni
          2. Up to 1,000 rows. All imported records stay private. Existing
          registrations are preserved.
        </p>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              setPreview([]);
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1024 * 1024) {
                setMessage("File must be smaller than 1 MB.");
                return;
              }
              try {
                const rows = parseImport(await f.text());
                setPreview(rows);
                setMessage(`${rows.length} valid rows ready for import.`);
              } catch (error) {
                setMessage(
                  error instanceof Error ? error.message : "Invalid CSV",
                );
              }
            }}
          />
        </label>
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
                const { error } = await browserClient().rpc("import_form", {
                  rows: preview,
                });
                setBusy(false);
                setMessage(
                  error
                    ? error.message
                    : "Import complete. Duplicate exam/email pairs were skipped; every new record is private.",
                );
                if (!error) setPreview([]);
              }}
            >
              Import privately
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
