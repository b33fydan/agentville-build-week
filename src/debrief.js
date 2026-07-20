import { DECISION_BINDINGS } from "./compiler.js";

const COMMANDS = Object.freeze({
  observe: "observe the east channel",
  symptomDecision: "decide water the tomatoes when the beds are dry",
  causeDecision: "decide clear the blockage when the water is blocked",
  act: "act on the decision",
  verify: "verify every tomato bed is watered",
});

export function createLearningRecap(receipt, { failedReceipt = null } = {}) {
  if (!receipt || receipt.verdict !== "PASS") return null;

  const dryBeds = receipt.before.tomatoBedsDry;
  const wateredBeds = receipt.after.tomatoBedsWatered;
  const totalBeds = receipt.after.tomatoBedsTotal;
  const decisionCondition = DECISION_BINDINGS[receipt.decision]?.condition;
  const alreadySatisfied = Boolean(
    receipt.selectedAction === null &&
      receipt.executedAction === null &&
      receipt.before.irrigationBlocked === false &&
      receipt.before.waterReleased === true &&
      receipt.before.tomatoBedsWatered === totalBeds &&
      snapshotsMatch(receipt.before, receipt.after),
  );
  const repairedAfterFailure = Boolean(
    !alreadySatisfied &&
    failedReceipt?.verdict === "FAIL" &&
      failedReceipt.mission === receipt.mission &&
      failedReceipt.sessionId === receipt.sessionId &&
      failedReceipt.decision === COMMANDS.symptomDecision &&
      failedReceipt.selectedAction === "water tomatoes" &&
      failedReceipt.action === COMMANDS.act &&
      failedReceipt.executedAction === "water tomatoes" &&
      receipt.decision === COMMANDS.causeDecision &&
      receipt.selectedAction === "clear blockage" &&
      receipt.action === COMMANDS.act &&
      receipt.executedAction === "clear blockage" &&
      snapshotsMatch(failedReceipt.after, receipt.before),
  );
  const path = repairedAfterFailure
    ? "repair"
    : alreadySatisfied
      ? "already-satisfied"
      : "direct";

  return deepFreeze({
    path,
    title: repairedAfterFailure
      ? "You changed the decision—and fixed the cause."
      : alreadySatisfied
        ? "The goal was already satisfied."
        : "You chose the cause—and proved it.",
    summary: repairedAfterFailure
      ? "Your first decision treated the dry beds. You repaired line 2 to clear the blockage, Bert carried out the new choice, and verification proved the farm changed."
      : alreadySatisfied
        ? `The channel was already clear and all ${totalBeds} beds were watered. The condition was false, so Bert correctly took no action before Verify confirmed the result.`
        : `You chose to clear the blockage when it was blocked. Bert carried out that decision, and verification proved all ${totalBeds} beds were watered.`,
    intro: "The lines form a loop: read evidence, choose a response, carry it out, then check the world.",
    phases: [
      {
        phase: "observe",
        command: COMMANDS.observe,
        explanation: alreadySatisfied
          ? `Reported clear irrigation and all ${totalBeds} beds already watered.`
          : `Reported stopped water, visible debris, and ${dryBeds} dry beds.`,
      },
      {
        phase: "decide",
        command: receipt.decision,
        explanation: alreadySatisfied
          ? `Checked “${decisionCondition ?? "the decision condition"}”; it was false, so no response was selected.`
          : "Chose the cause—the blockage—over the dry-bed symptom.",
      },
      {
        phase: "act",
        command: COMMANDS.act,
        explanation: alreadySatisfied
          ? "No response was selected, so Bert correctly left the farm unchanged."
          : `Carried out that choice by ${receipt.executedAction === "clear blockage" ? "clearing debris; water flowed" : receipt.executedAction}.`,
      },
      {
        phase: "verify",
        command: COMMANDS.verify,
        explanation: `Checked the farm: ${wateredBeds} of ${totalBeds} beds watered.`,
      },
    ],
    takeaway: repairedAfterFailure
      ? {
          title: "You debugged an agent’s decision.",
          explanation: "You kept the evidence, action step, and success check. You changed Bert’s response, reran the loop, and verified the result.",
        }
      : alreadySatisfied
        ? {
            title: "You verified before changing anything.",
            explanation: "A safe agent can discover that its condition is false, skip the action, and still prove the goal is already met.",
          }
        : {
            title: "You built a working agent loop.",
            explanation: "You turned Bert’s observation into a bounded choice, carried it out, and checked the result: look, choose, do, check.",
          },
    learner: {
      diagnosedFailure: repairedAfterFailure,
      changedLine: repairedAfterFailure ? 2 : null,
      from: repairedAfterFailure ? failedReceipt.decision : null,
      to: receipt.decision,
      preservedPhases: ["observe", "act", "verify"],
    },
    result: {
      blockageBefore: receipt.before.irrigationBlocked,
      blockageAfter: receipt.after.irrigationBlocked,
      waterReleased: receipt.after.waterReleased === true,
      tomatoBedsWateredBefore: receipt.before.tomatoBedsWatered,
      tomatoBedsWateredAfter: wateredBeds,
      tomatoBedsTotal: totalBeds,
    },
  });
}

function snapshotsMatch(left, right) {
  return Boolean(
    left &&
      right &&
      left.irrigationBlocked === right.irrigationBlocked &&
      left.waterReleased === right.waterReleased &&
      left.tomatoBedsWatered === right.tomatoBedsWatered &&
      left.tomatoBedsDry === right.tomatoBedsDry &&
      left.tomatoBedsTotal === right.tomatoBedsTotal,
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
