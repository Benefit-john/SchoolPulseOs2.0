import assert from "node:assert/strict";
import test from "node:test";
import {
  matchImportedStudent,
  parseOcrResults,
  parseResultMatrix,
  parseScore,
} from "./result-import.ts";

const roster = [
  { dbId: "student-1", code: "SP001", name: "Ada Okafor" },
  { dbId: "student-2", code: "SP002", name: "Musa Bello" },
];

test("parses numeric scores, percentages, and marks out of a maximum", () => {
  assert.equal(parseScore("87.5"), 87.5);
  assert.equal(parseScore("90%"), 90);
  assert.equal(parseScore("18/20"), 90);
  assert.equal(parseScore(""), null);
  assert.equal(parseScore("101"), null);
});

test("imports spreadsheet rows and matches students by name or student code", () => {
  const rows = parseResultMatrix(
    [
      ["Student Name", "Subject", "Score", "Term", "Grade"],
      ["Ada Okafor", "Mathematics", "87", "Term 2", "A"],
      ["SP002", "English", "18/20", "", "B+"],
    ],
    roster,
    "Term 1",
  );
  assert.deepEqual(
    rows.map(({ studentId, subject, score, term, grade }) => ({
      studentId,
      subject,
      score,
      term,
      grade,
    })),
    [
      {
        studentId: "student-1",
        subject: "Mathematics",
        score: 87,
        term: "Term 2",
        grade: "A",
      },
      {
        studentId: "student-2",
        subject: "English",
        score: 90,
        term: "Term 1",
        grade: "B+",
      },
    ],
  );
});

test("leaves ambiguous student names unmatched for human review", () => {
  const duplicates = [
    { dbId: "student-1", name: "Alex Kim" },
    { dbId: "student-2", name: "Alex Kim" },
  ];
  assert.equal(matchImportedStudent("Alex Kim", duplicates), "");
});

test("reads a photographed report card with student name and aligned columns", () => {
  const rows = parseOcrResults(
    "Student Name: Ada Okafor\nSubject       Score  Grade\nMathematics   87     A\nEnglish       92     A",
    roster,
    "Term 1",
  );
  assert.deepEqual(
    rows.map(({ studentId, subject, score, grade }) => ({ studentId, subject, score, grade })),
    [
      { studentId: "student-1", subject: "Mathematics", score: 87, grade: "A" },
      { studentId: "student-1", subject: "English", score: 92, grade: "A" },
    ],
  );
});

test("reads spreadsheet exports where the student label is above the results table", () => {
  const rows = parseResultMatrix(
    [["Student Name", "Ada Okafor"], [], ["Subject", "Marks Obtained"], ["Science", "18/20"]],
    roster,
    "Term 1",
  );
  assert.equal(rows[0]?.studentId, "student-1");
  assert.equal(rows[0]?.score, 90);
});
