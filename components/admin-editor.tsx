"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { z } from "zod";
import { Button } from "./ui/button";
import { browserClient } from "@/lib/supabase";
import { centreSchema, errorMessage } from "@/lib/workflows";
export function AdminEditor({
  client,
  table,
  row,
  onClose,
  onSaved,
}: {
  client: ReturnType<typeof browserClient>;
  table: "exams" | "centres";
  row: { id?: string; name?: string; address?: string; exam_date?: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal-overlay"
      aria-label={table === "exams" ? "Edit exam" : "Edit centre"}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="modal-close"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2>Edit {table === "exams" ? "exam" : "centre"}</h2>
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const f = Object.fromEntries(new FormData(e.currentTarget));
            const result = (
              table === "exams"
                ? z.object({
                    name: z.string().trim().min(1).max(120),
                    exam_date: z.iso.date(),
                  })
                : centreSchema
            ).safeParse(f);
            if (!result.success) {
              setError(result.error.issues[0].message);
              return;
            }
            setBusy(true);
            try {
              const { error } = await client
                .from(table)
                .update(result.data)
                .eq("id", row.id!);
              if (error) throw error;
              await onSaved();
              onClose();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Name
            <input
              name="name"
              required
              maxLength={table === "exams" ? 120 : 160}
              defaultValue={row.name}
            />
          </label>
          {table === "exams" ? (
            <label>
              Exam date
              <input
                name="exam_date"
                type="date"
                required
                defaultValue={row.exam_date}
              />
            </label>
          ) : (
            <label>
              Full address
              <textarea
                name="address"
                required
                maxLength={500}
                defaultValue={row.address}
              />
            </label>
          )}
          <Button disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </form>
      </section>
    </dialog>
  );
}
