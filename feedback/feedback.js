const params = new URLSearchParams(window.location.search);
const requestedSessionId = params.get("session_id")?.trim() ?? "";
const storedReceipt = readJson("agentville:lastReceipt");
const sessionId = requestedSessionId || storedReceipt?.sessionId || "";

const sessionNode = document.querySelector("#feedback-session-id");
const statusNode = document.querySelector("#feedback-session-status");
const form = document.querySelector("#feedback-form");
const confirmation = document.querySelector("#feedback-confirmation");
const downloadButton = document.querySelector("#download-feedback");
let latestFeedback = null;

sessionNode.textContent = sessionId || "Missing session ID";
if (!sessionId) {
  statusNode.textContent = "Complete the farm mission first so its receipt can be attached.";
  form.querySelector("button[type='submit']").disabled = true;
} else if (storedReceipt?.sessionId === sessionId) {
  statusNode.textContent = "Matches the PASS receipt stored by this browser.";
} else {
  statusNode.textContent = "Preserved from the feedback link. Receipt not found in this browser.";
}

const saved = sessionId ? readJson(`agentville:feedback:${sessionId}`) : null;
if (saved) {
  hydrateForm(saved);
  latestFeedback = saved;
  confirmation.hidden = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!sessionId) return;

  const data = new FormData(form);
  latestFeedback = {
    schema: "agentville.feedback.v1",
    sessionId,
    submittedAt: new Date().toISOString(),
    clarity: Number(data.get("clarity")),
    learned: String(data.get("learned") ?? "").trim(),
    friction: String(data.get("friction") ?? "").trim(),
    evidenceConsent: data.get("evidenceConsent") === "on",
    receiptVerdict: storedReceipt?.sessionId === sessionId ? storedReceipt.verdict : "unavailable",
  };

  localStorage.setItem(`agentville:feedback:${sessionId}`, JSON.stringify(latestFeedback));
  confirmation.hidden = false;
  confirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

downloadButton.addEventListener("click", () => {
  if (!latestFeedback) return;
  const blob = new Blob([`${JSON.stringify(latestFeedback, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agentville-feedback-${sessionId}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function hydrateForm(value) {
  const rating = form.querySelector(`input[name="clarity"][value="${value.clarity}"]`);
  if (rating) rating.checked = true;
  form.elements.learned.value = value.learned ?? "";
  form.elements.friction.value = value.friction ?? "";
  form.elements.evidenceConsent.checked = Boolean(value.evidenceConsent);
}

window.render_game_to_text = () =>
  JSON.stringify({
    page: "feedback",
    sessionId,
    receiptMatched: storedReceipt?.sessionId === sessionId,
    feedbackSaved: Boolean(latestFeedback),
  });
