export const FEEDBACK_SCHEMA = "agentville.feedback.v2";

export function normalizeIdentityPart(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function receiptStorageKey(missionId, sessionId) {
  return `agentville:receipt:${normalizeIdentityPart(missionId)}:${normalizeIdentityPart(sessionId)}`;
}

export function feedbackStorageKey(missionId, sessionId) {
  return `agentville:feedback:${normalizeIdentityPart(missionId)}:${normalizeIdentityPart(sessionId)}`;
}

export function resolveFeedbackIdentity({ requestedMissionId, requestedSessionId, lastReceipt } = {}) {
  const missionId = normalizeIdentityPart(requestedMissionId);
  const sessionId = normalizeIdentityPart(requestedSessionId);
  const hasQueryIdentity = Boolean(missionId || sessionId);

  if (hasQueryIdentity) {
    return {
      missionId,
      sessionId,
      complete: Boolean(missionId && sessionId),
      source: "query",
    };
  }

  const fallbackMissionId = normalizeIdentityPart(lastReceipt?.missionId);
  const fallbackSessionId = normalizeIdentityPart(lastReceipt?.sessionId);
  return {
    missionId: fallbackMissionId,
    sessionId: fallbackSessionId,
    complete: Boolean(fallbackMissionId && fallbackSessionId),
    source: fallbackMissionId || fallbackSessionId ? "last-receipt" : "missing",
  };
}

export function receiptMatchesIdentity(receipt, identity) {
  if (!receipt || !identity?.complete) return false;
  return (
    normalizeIdentityPart(receipt.missionId) === identity.missionId &&
    normalizeIdentityPart(receipt.sessionId) === identity.sessionId
  );
}

export function selectMatchingReceipt({ identity, compositeReceipt, lastReceipt } = {}) {
  if (receiptMatchesIdentity(compositeReceipt, identity)) return compositeReceipt;
  if (receiptMatchesIdentity(lastReceipt, identity)) return lastReceipt;
  return null;
}

export function feedbackMatchesIdentity(feedback, identity) {
  if (!feedback || feedback.schema !== FEEDBACK_SCHEMA || !identity?.complete) return false;
  return (
    normalizeIdentityPart(feedback.missionId) === identity.missionId &&
    normalizeIdentityPart(feedback.sessionId) === identity.sessionId
  );
}

export function missionNameFromReceipt(receipt) {
  return normalizeIdentityPart(receipt?.missionName ?? receipt?.mission);
}

export function createFeedbackRecord({
  identity,
  missionName = "",
  receipt = null,
  submittedAt,
  clarity,
  learned,
  friction,
  evidenceConsent,
}) {
  if (!identity?.complete) return null;

  return {
    schema: FEEDBACK_SCHEMA,
    missionId: identity.missionId,
    missionName: normalizeIdentityPart(missionName),
    sessionId: identity.sessionId,
    submittedAt,
    clarity: Number(clarity),
    learned: String(learned ?? "").trim(),
    friction: String(friction ?? "").trim(),
    evidenceConsent: Boolean(evidenceConsent),
    receiptVerdict: receiptMatchesIdentity(receipt, identity)
      ? normalizeIdentityPart(receipt.verdict) || "unavailable"
      : "unavailable",
  };
}

export function initFeedbackPage() {
  const params = new URLSearchParams(window.location.search);
  const lastReceipt = readJson("agentville:lastReceipt");
  const identity = resolveFeedbackIdentity({
    requestedMissionId: params.get("mission_id"),
    requestedSessionId: params.get("session_id"),
    lastReceipt,
  });

  const compositeReceipt = identity.complete
    ? readJson(receiptStorageKey(identity.missionId, identity.sessionId))
    : null;
  const receipt = selectMatchingReceipt({ identity, compositeReceipt, lastReceipt });
  const savedCandidate = identity.complete
    ? readJson(feedbackStorageKey(identity.missionId, identity.sessionId))
    : null;
  const saved = feedbackMatchesIdentity(savedCandidate, identity) ? savedCandidate : null;
  const missionName = missionNameFromReceipt(receipt) || normalizeIdentityPart(saved?.missionName);

  const missionNode = document.querySelector("#feedback-mission-id");
  const missionNameNode = document.querySelector("#feedback-mission-name");
  const sessionNode = document.querySelector("#feedback-session-id");
  const statusNode = document.querySelector("#feedback-session-status");
  const verdictNode = document.querySelector("#feedback-receipt-verdict");
  const form = document.querySelector("#feedback-form");
  const confirmation = document.querySelector("#feedback-confirmation");
  const downloadButton = document.querySelector("#download-feedback");
  const submitButton = form.querySelector("button[type='submit']");
  let latestFeedback = saved;

  missionNode.textContent = identity.missionId || "Missing mission ID";
  missionNameNode.textContent = missionName || "Mission name unavailable";
  sessionNode.textContent = identity.sessionId || "Missing session ID";
  verdictNode.textContent = receipt
    ? `${normalizeIdentityPart(receipt.verdict) || "UNKNOWN"} receipt`
    : "Receipt unavailable";
  verdictNode.dataset.matched = String(Boolean(receipt));

  if (!identity.complete) {
    statusNode.textContent = identity.source === "query"
      ? "This feedback link is incomplete. Return to the mission receipt and open feedback again."
      : "Complete a farm mission first so its mission and session IDs can be attached.";
    submitButton.disabled = true;
  } else if (receipt) {
    statusNode.textContent = "The mission and session both match this browser's verification receipt.";
  } else {
    statusNode.textContent = "Mission and session preserved from the link. A matching receipt was not found in this browser.";
  }

  if (saved) {
    hydrateForm(form, saved);
    confirmation.hidden = false;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!identity.complete) return;

    const data = new FormData(form);
    latestFeedback = createFeedbackRecord({
      identity,
      missionName,
      receipt,
      submittedAt: new Date().toISOString(),
      clarity: data.get("clarity"),
      learned: data.get("learned"),
      friction: data.get("friction"),
      evidenceConsent: data.get("evidenceConsent") === "on",
    });

    writeJson(feedbackStorageKey(identity.missionId, identity.sessionId), latestFeedback);
    confirmation.hidden = false;
    confirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  downloadButton.addEventListener("click", () => {
    if (!latestFeedback) return;
    const blob = new Blob([`${JSON.stringify(latestFeedback, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agentville-feedback-${safeFilenamePart(identity.missionId)}-${safeFilenamePart(identity.sessionId)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  window.render_game_to_text = () =>
    JSON.stringify({
      page: "feedback",
      schema: FEEDBACK_SCHEMA,
      missionId: identity.missionId,
      missionName,
      sessionId: identity.sessionId,
      receiptMatched: Boolean(receipt),
      receiptVerdict: receipt
        ? normalizeIdentityPart(receipt.verdict) || "unavailable"
        : "unavailable",
      feedbackSaved: Boolean(latestFeedback),
    });
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function hydrateForm(form, value) {
  const rating = form.querySelector(`input[name="clarity"][value="${value.clarity}"]`);
  if (rating) rating.checked = true;
  form.elements.learned.value = value.learned ?? "";
  form.elements.friction.value = value.friction ?? "";
  form.elements.evidenceConsent.checked = Boolean(value.evidenceConsent);
}

function safeFilenamePart(value) {
  return normalizeIdentityPart(value).replace(/[^a-zA-Z0-9_-]+/g, "-") || "missing";
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initFeedbackPage();
}
