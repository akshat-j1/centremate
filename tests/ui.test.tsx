import { test, before, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fixture, examId, centreId, registrationId } from "./helpers/client";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: `https://centremate.example/centre/${centreId}?exam=${examId}`,
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLDialogElement: dom.window.HTMLDialogElement,
  FormData: dom.window.FormData,
  location: dom.window.location,
  history: dom.window.history,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
let render: typeof import("@testing-library/react").render;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let waitFor: typeof import("@testing-library/react").waitFor;
let within: typeof import("@testing-library/react").within;
let cleanup: typeof import("@testing-library/react").cleanup;
let CentreMate: typeof import("../components/centremate").default;
let AdminPanel: typeof import("../components/admin-panel").default;
before(async () => {
  ({ render, fireEvent, waitFor, within, cleanup } =
    await import("@testing-library/react"));

  (await import("@testing-library/dom")).configure({ defaultHidden: true });
  ({ default: CentreMate } = await import("../components/centremate"));

  ({ default: AdminPanel } = await import("../components/admin-panel"));
});
afterEach(() => cleanup());
after(() => dom.window.close());
test("registration form shows validation and server errors inside the dialog, then saves private plans", async () => {
  const f = fixture();
  const ui = render(<CentreMate centreId={centreId} client={f.client} />);

  const join = await ui.findByRole("button", { name: /Join this centre/ });
  await waitFor(() =>
    assert.equal((join as HTMLButtonElement).disabled, false),
  );
  fireEvent.click(join);
  const dialog = ui.getByRole("dialog");
  const form = dialog.querySelector("form")!;
  fireEvent.change(within(dialog).getByLabelText("Your name"), {
    target: { value: "   " },
  });
  fireEvent.submit(form);
  await within(dialog).findByRole("alert");
  assert.match(
    within(dialog).getByRole("alert").textContent!,
    /Enter your name/,
  );
  fireEvent.change(within(dialog).getByLabelText("Your name"), {
    target: { value: "Student" },
  });
  fireEvent.change(within(dialog).getByLabelText("Hostel"), {
    target: { value: "Uni 2" },
  });
  f.state.failSave = true;
  fireEvent.submit(form);
  await waitFor(() =>
    assert.match(
      within(dialog).getByRole("alert").textContent!,
      /Test save failed/,
    ),
  );
  f.state.failSave = false;
  fireEvent.submit(form);
  await waitFor(() => assert.equal(Boolean(ui.queryByRole("dialog")), false));
  const saved = f.state.calls
    .filter((c) => c.name === "registrations:upsert")
    .at(-1)!.args as Record<string, unknown>;
  assert.equal(saved.hostel, "Uni 2");
  assert.equal(saved.visible, false);
  assert.equal(saved.whatsapp, null);
  assert.equal(saved.exam_id, examId);
});
test("both hostels share one centre and return status uses the protected RPC", async () => {
  const f = fixture({ registered: true });
  const ui = render(<CentreMate centreId={centreId} client={f.client} />);
  await ui.findByText("Student One");
  await ui.findByText("Student Two");
  fireEvent.click(ui.getByRole("button", { name: /Ready to Return/ }));
  await waitFor(() =>
    assert.ok(f.state.calls.some((c) => c.name === "set_return_status")),
  );
  assert.deepEqual(
    f.state.calls.find((c) => c.name === "set_return_status")!.args,
    { p_registration: registrationId, p_ready: true },
  );
  fireEvent.click(ui.getByRole("button", { name: /^Returning/ }));
  await waitFor(() =>
    assert.equal(Boolean(ui.queryByText("Student One")), false),
  );
  assert.ok(ui.getByText("Student Two"));
});
test("Google sign-in stores the selected centre without changing the OAuth callback URL", async () => {
  const f = fixture({ signedOut: true });
  const ui = render(<CentreMate centreId={centreId} client={f.client} />);
  const join = await ui.findByRole("button", { name: /Join this centre/ });
  await waitFor(() =>
    assert.equal((join as HTMLButtonElement).disabled, false),
  );
  fireEvent.click(join);
  await waitFor(() => assert.ok(f.state.calls.some((c) => c.name === "oauth")));
  assert.match(decodeURIComponent(document.cookie), new RegExp(centreId));
  assert.deepEqual(f.state.calls.find((c) => c.name === "oauth")!.args, {
    provider: "google",
    options: { redirectTo: "https://centremate.example/auth/callback" },
  });
});
test("admin maps a raw Form CSV, previews it, and imports using the protected RPC", async () => {
  const f = fixture();
  const ui = render(<AdminPanel client={f.client} />);
  await ui.findByText("CentreMate admin");
  const csv =
    "Email Address,Full name,Hostel,Exam Centre\nstudent@example.com,Student,Uni 2,Test centre";
  const file = new dom.window.File([csv], "responses.csv", {
    type: "text/csv",
  });
  Object.defineProperty(file, "text", { value: async () => csv });
  fireEvent.change(ui.getByLabelText("CSV file"), {
    target: { files: [file] },
  });
  await ui.findByText("Validate and preview");
  fireEvent.change(ui.getByLabelText("Default exam"), {
    target: { value: examId },
  });
  fireEvent.click(ui.getByRole("button", { name: "Validate and preview" }));
  await ui.findByRole("button", { name: "Import privately" });
  fireEvent.click(ui.getByRole("button", { name: "Import privately" }));
  await waitFor(() =>
    assert.ok(f.state.calls.some((c) => c.name === "import_form")),
  );
  const args = f.state.calls.find((c) => c.name === "import_form")!.args as {
    rows: Record<string, unknown>[];
  };
  assert.equal(args.rows[0].centre_id, centreId);
  assert.equal(args.rows[0].exam_id, examId);
  assert.equal("visible" in args.rows[0], false);
  assert.equal("whatsapp" in args.rows[0], false);
});
