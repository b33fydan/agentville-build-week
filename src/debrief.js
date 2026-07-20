import { getMissionDefinition } from "./mission-registry.js";

export function createLearningRecap(receipt, { failedReceipt = null } = {}) {
  if (!receipt || receipt.verdict !== "PASS" || !receipt.missionId) return null;

  let mission;
  try {
    mission = getMissionDefinition(receipt.missionId);
  } catch {
    return null;
  }

  const repairedProgram = mission.language.guidedProgram.map((command, index) =>
    index === mission.language.repair.line - 1
      ? mission.language.repair.to
      : command,
  );
  const repairedAfterFailure = Boolean(
    failedReceipt?.verdict === "FAIL" &&
      failedReceipt.missionId === receipt.missionId &&
      failedReceipt.sessionId === receipt.sessionId &&
      failedReceipt.beforeKey === receipt.beforeKey &&
      arraysMatch(failedReceipt.program, mission.language.guidedProgram) &&
      arraysMatch(receipt.program, repairedProgram) &&
      receiptMatchesProgram(failedReceipt, mission.language.guidedProgram) &&
      receiptMatchesProgram(receipt, repairedProgram) &&
      failedReceipt.selectedAction ===
        (mission.id === "repair-east-channel"
          ? mission.language.bindings[mission.language.guidedProgram[1]].selectedAction
          : null) &&
      failedReceipt.executedAction === failedReceipt.selectedAction &&
      receipt.selectedAction ===
        mission.language.bindings[repairedProgram[1]].selectedAction &&
      receipt.executedAction === receipt.selectedAction,
  );
  const alreadySatisfied = Boolean(
    receipt.selectedAction === null &&
      receipt.executedAction === null &&
      receipt.beforeKey === receipt.afterKey,
  );
  const path = repairedAfterFailure
    ? "repair"
    : alreadySatisfied
      ? "already-satisfied"
      : "direct";

  const repairKind =
    mission.language.repair.phase === "observe" ? "observation" : "decision";
  const takeawayTitle =
    mission.id === "storm-watch"
      ? "You debugged an agent’s timing."
      : `You debugged an agent’s ${repairKind}.`;

  const phases = mission.language.phases.map((phase, index) => ({
    phase,
    command: receipt.program[index],
    explanation:
      alreadySatisfied
        ? alreadySatisfiedExplanation(phase, receipt)
        : mission.teaching.debrief.phaseExplanations[phase],
  }));

  return deepFreeze({
    missionId: mission.id,
    path,
    title: alreadySatisfied
      ? "The goal was already satisfied."
      : mission.teaching.debrief.title,
    summary: alreadySatisfied
      ? `Bert observed ${mission.name}, found the decision condition was false, made no unnecessary change, and Verify still proved the goal.`
      : repairedAfterFailure
        ? mission.teaching.debrief.summary
        : `Your four-line program completed ${mission.name} and proved the result from the evidence it actually produced.`,
    intro:
      "The lines form a loop: read scoped evidence, choose a response, carry it out, then check the world.",
    phases,
    takeaway: alreadySatisfied
      ? {
          title: "You verified before changing anything.",
          explanation:
            "A safe agent can discover that its condition is false, skip the action, and still prove the goal is already met.",
        }
      : {
          title: repairedAfterFailure
            ? takeawayTitle
            : "You built a working agent loop.",
          explanation: repairedAfterFailure
            ? mission.teaching.coach.repairSuccess.explanation
            : "You connected observation evidence to a bounded response, carried it out, and checked the real result.",
        },
    learner: {
      diagnosedFailure: repairedAfterFailure,
      changedLine: repairedAfterFailure ? mission.language.repair.line : null,
      changedPhase: repairedAfterFailure ? mission.language.repair.phase : null,
      from: repairedAfterFailure ? mission.language.repair.from : null,
      to: receipt.program[mission.language.repair.line - 1],
      preservedPhases: mission.language.phases.filter(
        (phase) => phase !== mission.language.repair.phase,
      ),
    },
    result: {
      before: receipt.before,
      after: receipt.after,
      worldChanged: receipt.beforeKey !== receipt.afterKey,
      ...legacyResult(mission.id, receipt),
    },
  });
}

function alreadySatisfiedExplanation(phase, receipt) {
  if (phase === "observe") return receipt.observation;
  if (phase === "decide") {
    return `Checked “${receipt.condition}”; it was false, so no response was selected.`;
  }
  if (phase === "act") {
    return "No response was selected, so Bert correctly left the farm unchanged.";
  }
  return `Checked the world and received ${receipt.verdict}.`;
}

function legacyResult(missionId, receipt) {
  if (missionId !== "repair-east-channel") return {};
  return {
    blockageBefore: receipt.before.irrigationBlocked,
    blockageAfter: receipt.after.irrigationBlocked,
    waterReleased: receipt.after.waterReleased === true,
    tomatoBedsWateredBefore: receipt.before.tomatoBedsWatered,
    tomatoBedsWateredAfter: receipt.after.tomatoBedsWatered,
    tomatoBedsTotal: receipt.after.tomatoBedsTotal,
  };
}

function arraysMatch(left, right) {
  return Boolean(
    Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index]),
  );
}

function receiptMatchesProgram(receipt, program) {
  return Boolean(
    receipt?.observationCommand === program[0] &&
      receipt?.decision === program[1] &&
      receipt?.action === program[2] &&
      receipt?.verify === program[3] &&
      receipt?.source === program.join("\n"),
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
