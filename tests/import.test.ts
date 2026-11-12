import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "../lib/import";
const ids =
  "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222";
const header = "email,name,hostel,exam_id,centre_id\n";
test("imports normalize email and preserve quoted names", () => {
  const [r] = parseImport(
    header + 'STUDENT@EXAMPLE.COM,"Jain, Akshat",Uni 2,' + ids,
  );
  assert.equal(r.email, "student@example.com");
  assert.equal(r.name, "Jain, Akshat");
  assert.equal(r.hostel, "Uni 2");
  assert.equal("visible" in r, false);
  assert.equal("whatsapp" in r, false);
});
test("rejects malformed email, hostel and identifiers", () => {
  for (const row of [
    "bad,Name,Uni 1," + ids,
    "a@b.com,Name,Uni 3," + ids,
    "a@b.com,Name,Uni 1,wrong,wrong",
  ])
    assert.throws(() => parseImport(header + row), /Row 2/);
});
test("ignores imported consent and phone columns", () => {
  const [r] = parseImport(
    "email,name,hostel,exam_id,centre_id,visible,whatsapp\na@b.com,Name,Uni 1," +
      ids +
      ",true,919999999999",
  );
  assert.equal("visible" in r, false);
  assert.equal("whatsapp" in r, false);
});
test("rejects oversized imports", () =>
  assert.throws(
    () =>
      parseImport(
        header +
          Array(1001)
            .fill("a@b.com,Name,Uni 1," + ids)
            .join("\n"),
      ),
    /1000/,
  ));
test("empty CSV imports no records", () =>
  assert.deepEqual(parseImport(header), []));
test("raw Google Form questions map to verified centre IDs with an exam default", () => {
  const rows = parseImport(
    "Email Address,Full name,Hostel,Exam Centre\n STUDENT@EXAMPLE.COM ,Student, Uni 2 ,A verified centre",
    {
      columns: {
        email: "Email Address",
        name: "Full name",
        hostel: "Hostel",
        centre_id: "Exam Centre",
      },
      examId: ids.split(",")[0],
      centres: [{ id: ids.split(",")[1], name: "A verified centre" }],
    },
  );
  assert.equal(rows[0].email, "student@example.com");
  assert.equal(rows[0].centre_id, ids.split(",")[1]);
});
test("ambiguous centre names, unknown venues and missing mapped columns are rejected", () => {
  const options = {
    examId: ids.split(",")[0],
    centres: [
      { id: ids.split(",")[1], name: "Same name" },
      { id: "33333333-3333-4333-8333-333333333333", name: "Same name" },
    ],
  };
  assert.throws(
    () =>
      parseImport(
        "email,name,hostel,centre_id\na@b.com,A,Uni 1,Same name",
        options,
      ),
    /ambiguous/,
  );
  assert.throws(
    () =>
      parseImport(
        "email,name,hostel,centre_id\na@b.com,A,Uni 1,Unknown",
        options,
      ),
    /centre_id/,
  );
  assert.throws(() => parseImport("foo,bar\na,b"), /Choose a column/);
});
