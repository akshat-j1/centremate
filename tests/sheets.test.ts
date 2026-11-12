import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function sheetRows(values: unknown[][], config: object) {
  const context = {};
  runInNewContext(
    readFileSync("scripts/google-sheets-sync.gs", "utf8"),
    context,
  );
  const rows = (
    context as { centreMateRows: (v: unknown[][], c: object) => unknown }
  ).centreMateRows(values, config);
  return JSON.parse(JSON.stringify(rows));
}
test("Apps Script maps Form columns and centre names without transmitting contact or consent", () => {
  const rows = sheetRows(
    [
      ["Email Address", "Full name", "Hostel", "Venue", "WhatsApp", "Consent"],
      [" A@B.COM ", "A", "Uni 1", "Main Centre", "919999999999", "Yes"],
    ],
    {
      columns: {
        email: "Email Address",
        name: "Full name",
        hostel: "Hostel",
        centre_id: "Venue",
      },
      examId: "exam-id",
      centreIds: { "Main Centre": "centre-id" },
    },
  );
  assert.deepEqual(rows, [
    {
      email: "a@b.com",
      name: "A",
      hostel: "Uni 1",
      exam_id: "exam-id",
      centre_id: "centre-id",
    },
  ]);
});
test("Apps Script ignores empty rows and rejects missing required data", () => {
  assert.deepEqual(
    sheetRows(
      [
        ["email", "name", "hostel", "exam_id", "centre_id"],
        ["", "", "", "", ""],
      ],
      {},
    ),
    [],
  );
  assert.throws(
    () => sheetRows([["email"], ["a@b.com"]], {}),
    /Missing required field/,
  );
});
