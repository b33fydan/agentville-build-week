const COMMANDS = Object.freeze({
  observe: "observe irrigation",
  decide: "decide if irrigation is blocked",
  verify: "verify tomatoes are watered",
});

export function createLearningRecap(receipt, { failureSeen = false } = {}) {
  if (!receipt || receipt.verdict !== "PASS") return null;

  const dryBeds = receipt.before.tomatoBedsDry;
  const wateredBeds = receipt.after.tomatoBedsWatered;
  const totalBeds = receipt.after.tomatoBedsTotal;
  const repairedAfterFailure = Boolean(failureSeen);

  return deepFreeze({
    path: repairedAfterFailure ? "repair" : "direct",
    title: "You fixed the cause—and proved it.",
    summary: repairedAfterFailure
      ? "You used the failed result as a clue and changed line 3 from “water tomatoes” to “clear blockage.”"
      : "You chose “clear blockage” on line 3, so Bert fixed the cause before checking the result.",
    intro: "Each line had one job. Together, they turned evidence into a checked result.",
    phases: [
      {
        phase: "observe",
        command: COMMANDS.observe,
        explanation: `Found a blocked channel and ${dryBeds} dry beds.`,
      },
      {
        phase: "decide",
        command: COMMANDS.decide,
        explanation: "Named the blockage as the first problem.",
      },
      {
        phase: "act",
        command: receipt.action,
        explanation: "Cleared the debris, so water could flow.",
      },
      {
        phase: "verify",
        command: COMMANDS.verify,
        explanation: `Checked the farm: ${wateredBeds} of ${totalBeds} beds watered.`,
      },
    ],
    takeaway: repairedAfterFailure
      ? {
          title: "You just debugged an agent.",
          explanation: "You read the evidence, repaired one line, reran the plan, and checked the result. That’s an agent loop: look, choose, do, check.",
        }
      : {
          title: "You built a working agent loop.",
          explanation: "You turned what Bert observed into the right action, then checked the result. That’s an agent loop: look, choose, do, check.",
        },
    learner: {
      diagnosedFailure: repairedAfterFailure,
      changedLine: 3,
      from: repairedAfterFailure ? "act water tomatoes" : null,
      to: receipt.action,
      preservedPhases: ["observe", "decide", "verify"],
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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
