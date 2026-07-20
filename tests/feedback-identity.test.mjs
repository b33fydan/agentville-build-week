import test from "node:test";
import assert from "node:assert/strict";

import {
  FEEDBACK_SCHEMA,
  createFeedbackRecord,
  feedbackMatchesIdentity,
  feedbackStorageKey,
  receiptMatchesIdentity,
  receiptStorageKey,
  resolveFeedbackIdentity,
  selectMatchingReceipt,
} from "../feedback/feedback.js";

const exactReceipt = {
  missionId: "mission-02",
  missionName: "Storm Watch",
  sessionId: "AVBW-02-ABC123",
  verdict: "PASS",
};

test("feedback identity is composite and never fills a partial query from the last receipt", () => {
  assert.deepEqual(
    resolveFeedbackIdentity({
      requestedMissionId: " mission-02 ",
      requestedSessionId: " AVBW-02-ABC123 ",
      lastReceipt: exactReceipt,
    }),
    {
      missionId: "mission-02",
      sessionId: "AVBW-02-ABC123",
      complete: true,
      source: "query",
    },
  );

  assert.deepEqual(
    resolveFeedbackIdentity({ requestedSessionId: "AVBW-02-ABC123", lastReceipt: exactReceipt }),
    {
      missionId: "",
      sessionId: "AVBW-02-ABC123",
      complete: false,
      source: "query",
    },
  );
});

test("feedback identity can use both IDs from the last receipt when the query is empty", () => {
  assert.deepEqual(resolveFeedbackIdentity({ lastReceipt: exactReceipt }), {
    missionId: "mission-02",
    sessionId: "AVBW-02-ABC123",
    complete: true,
    source: "last-receipt",
  });
});

test("receipt selection prefers the composite key and rejects session-only matches", () => {
  const identity = resolveFeedbackIdentity({
    requestedMissionId: "mission-02",
    requestedSessionId: "AVBW-02-ABC123",
  });
  const wrongMission = { ...exactReceipt, missionId: "mission-01" };
  const fallback = { ...exactReceipt, missionName: "Fallback copy" };

  assert.equal(receiptMatchesIdentity(wrongMission, identity), false);
  assert.equal(selectMatchingReceipt({ identity, compositeReceipt: wrongMission, lastReceipt: null }), null);
  assert.equal(
    selectMatchingReceipt({ identity, compositeReceipt: wrongMission, lastReceipt: fallback }),
    fallback,
  );
  assert.equal(
    selectMatchingReceipt({ identity, compositeReceipt: exactReceipt, lastReceipt: fallback }),
    exactReceipt,
  );
  assert.equal(receiptStorageKey(identity.missionId, identity.sessionId), "agentville:receipt:mission-02:AVBW-02-ABC123");
});

test("schema v2 feedback records retain mission, session, and receipt evidence", () => {
  const identity = resolveFeedbackIdentity({
    requestedMissionId: exactReceipt.missionId,
    requestedSessionId: exactReceipt.sessionId,
  });
  const record = createFeedbackRecord({
    identity,
    missionName: exactReceipt.missionName,
    receipt: exactReceipt,
    submittedAt: "2026-07-20T22:00:00.000Z",
    clarity: "5",
    learned: "  The trigger must fire before harm.  ",
    friction: "  The condition. ",
    evidenceConsent: true,
  });

  assert.deepEqual(record, {
    schema: FEEDBACK_SCHEMA,
    missionId: "mission-02",
    missionName: "Storm Watch",
    sessionId: "AVBW-02-ABC123",
    submittedAt: "2026-07-20T22:00:00.000Z",
    clarity: 5,
    learned: "The trigger must fire before harm.",
    friction: "The condition.",
    evidenceConsent: true,
    receiptVerdict: "PASS",
  });
  assert.equal(feedbackMatchesIdentity(record, identity), true);
  assert.equal(feedbackStorageKey(identity.missionId, identity.sessionId), "agentville:feedback:mission-02:AVBW-02-ABC123");
  assert.equal(feedbackMatchesIdentity({ ...record, missionId: "mission-01" }, identity), false);
  assert.equal(feedbackMatchesIdentity({ ...record, schema: "agentville.feedback.v1" }, identity), false);
});

test("feedback remains saveable without a local receipt but records unavailable evidence", () => {
  const identity = resolveFeedbackIdentity({
    requestedMissionId: "mission-03",
    requestedSessionId: "AVBW-03-NORECEIPT",
  });
  const record = createFeedbackRecord({
    identity,
    missionName: "",
    receipt: exactReceipt,
    submittedAt: "2026-07-20T22:01:00.000Z",
    clarity: 3,
    learned: "Observation controls evidence.",
    friction: "",
    evidenceConsent: false,
  });

  assert.equal(record.receiptVerdict, "unavailable");
  assert.equal(record.missionId, "mission-03");
  assert.equal(record.sessionId, "AVBW-03-NORECEIPT");
});
