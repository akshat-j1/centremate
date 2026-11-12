import type { browserClient } from "../../lib/supabase";
export const examId = "11111111-1111-4111-8111-111111111111";
export const centreId = "22222222-2222-4222-8222-222222222222";
export const registrationId = "33333333-3333-4333-8333-333333333333";
type Row = Record<string, unknown>;
export function fixture(
  options: { registered?: boolean; signedOut?: boolean } = {},
) {
  const tables: Record<string, Row[]> = {
    exams: [
      {
        id: examId,
        name: "Test examination",
        exam_date: "2099-01-01",
        active: true,
      },
    ],
    centres: [{ id: centreId, name: "Test centre", address: "Test address" }],
    registrations: options.registered
      ? [
          {
            id: registrationId,
            exam_id: examId,
            centre_id: centreId,
            email: "student@example.com",
            name: "Test Student",
            hostel: "Uni 1",
            visible: true,
            going: true,
            ready_until: null,
            departure: null,
            whatsapp: null,
            source: "website",
          },
        ]
      : [],
    allowed_domains: [],
    email_exceptions: [],
    centre_requests: [],
  };
  const mates = [
    {
      id: "first",
      name: "Student One",
      hostel: "Uni 1",
      departure: "07:00",
      going: true,
      ready_until: null,
      has_contact: false,
    },
    {
      id: "second",
      name: "Student Two",
      hostel: "Uni 2",
      departure: "07:30",
      going: false,
      ready_until: new Date(Date.now() + 3600000).toISOString(),
      has_contact: false,
    },
  ];
  const state = {
    tables,
    mates,
    calls: [] as { name: string; args: unknown }[],
    failSave: false,
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.signedOut
            ? null
            : {
                id: "user",
                email: "student@example.com",
                user_metadata: { full_name: "Test Student" },
              },
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      signInWithOAuth: async (args: unknown) => {
        state.calls.push({ name: "oauth", args });
        return { error: null };
      },
    },
    from(table: string) {
      let action = "select";
      let payload: Row | Row[] = {};
      const filters: [string, unknown][] = [];
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        insert(row: Row) {
          action = "insert";
          payload = row;
          return query;
        },
        upsert(row: Row) {
          action = "upsert";
          payload = row;
          return query;
        },
        update(row: Row) {
          action = "update";
          payload = row;
          return query;
        },
        delete() {
          action = "delete";
          return query;
        },
        then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
          const rows = state.tables[table] ?? [];
          const matches = (r: Row) =>
            filters.every(([column, value]) => r[column] === value);
          if (action !== "select") {
            state.calls.push({ name: table + ":" + action, args: payload });
            if (state.failSave)
              return resolve({
                data: null,
                error: { message: "Test save failed" },
              });
            if (action === "upsert" || action === "insert") {
              const existing = rows.find((r) =>
                table === "registrations"
                  ? r.exam_id === (payload as Row).exam_id &&
                    r.email === (payload as Row).email
                  : false,
              );
              if (existing) Object.assign(existing, payload);
              else rows.push({ id: registrationId, ...payload });
            }
            if (action === "update")
              rows
                .filter(matches)
                .forEach((row) => Object.assign(row, payload));
            if (action === "delete")
              state.tables[table] = rows.filter((row) => !matches(row));
          }
          const result = (state.tables[table] ?? []).filter(matches);
          return resolve({
            data: single ? (result[0] ?? null) : result,
            error: null,
          });
        },
      };
      let single = false;
      return query;
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      state.calls.push({ name, args });
      if (name === "is_admin" || name === "is_approved")
        return { data: true, error: null };
      if (name === "directory") return { data: mates, error: null };
      if (name === "centre_counts")
        return {
          data: [{ centre_id: centreId, total: mates.length }],
          error: null,
        };
      if (name === "import_form")
        return { data: (args.rows as Row[]).length, error: null };
      if (name === "set_return_status") {
        state.tables.registrations[0].ready_until = args.p_ready
          ? new Date(Date.now() + 7200000).toISOString()
          : null;
        return { data: state.tables.registrations[0].ready_until, error: null };
      }
      return { data: null, error: null };
    },
  };
  return {
    client: client as unknown as ReturnType<typeof browserClient>,
    state,
  };
}
