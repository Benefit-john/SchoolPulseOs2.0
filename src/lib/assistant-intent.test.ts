import assert from "node:assert/strict";
import test from "node:test";
import { detectAssistantIntent } from "./assistant-intent.ts";

test("understands attendance summaries and follow-up lists", () => {
  assert.deepEqual(detectAssistantIntent("How many students are absent today?"), {
    type: "attendance-summary",
  });
  assert.deepEqual(detectAssistantIntent("Show me students marked late"), {
    type: "attendance-list",
    status: "late",
  });
  assert.deepEqual(detectAssistantIntent("Which ones?", "How many students were absent today?"), {
    type: "attendance-list",
    status: "absent",
  });
});

test("distinguishes fee totals from student lists", () => {
  assert.deepEqual(detectAssistantIntent("How much fees are outstanding?"), {
    type: "fee-summary",
  });
  assert.deepEqual(detectAssistantIntent("Prepare a list of students with unpaid fees"), {
    type: "fee-list",
  });
});

test("extracts academic term, subject, and score threshold", () => {
  assert.deepEqual(detectAssistantIntent("Which students scored below 40% in Mathematics?"), {
    type: "academic-low-scores",
    threshold: 40,
    subject: "mathematics",
  });
  assert.deepEqual(detectAssistantIntent("Generate first-term academic performance report"), {
    type: "academic-summary",
    term: "Term 1",
  });
});

test("understands staff counts, visitor counts, and greetings", () => {
  assert.deepEqual(detectAssistantIntent("How many teachers are currently employed?"), {
    type: "staff-count",
    staffKind: "teacher",
  });
  assert.deepEqual(detectAssistantIntent("How many visitors are on campus?"), {
    type: "visitor-count",
  });
  assert.deepEqual(detectAssistantIntent("Good morning"), { type: "greeting" });
  assert.deepEqual(detectAssistantIntent("Hi, how many visitors are on campus?"), {
    type: "visitor-count",
  });
});
