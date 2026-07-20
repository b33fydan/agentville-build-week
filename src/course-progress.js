import { MISSION_IDS } from "./mission-registry.js";

// The registry is the single source of course order; this reducer remains
// independent of UI and browser storage.
export const COURSE_MISSION_IDS = MISSION_IDS;

const MISSION_INDEX = new Map(
  COURSE_MISSION_IDS.map((missionId, index) => [missionId, index]),
);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function issueProgress({ activeMissionId, unlockedMissionIds, passedMissionIds }) {
  const progress = deepFreeze({
    activeMissionId,
    unlockedMissionIds: [...unlockedMissionIds],
    passedMissionIds: [...passedMissionIds],
  });
  return progress;
}

function requireProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    throw new TypeError("A course progress record is required.");
  }

  const { activeMissionId, unlockedMissionIds, passedMissionIds } = progress;
  requireMissionId(activeMissionId);
  if (!Array.isArray(unlockedMissionIds) || !Array.isArray(passedMissionIds)) {
    throw new TypeError("Course progress mission lists must be arrays.");
  }

  const unlockedPrefix = COURSE_MISSION_IDS.slice(0, unlockedMissionIds.length);
  const passedPrefix = COURSE_MISSION_IDS.slice(0, passedMissionIds.length);
  const expectedUnlockedCount = Math.min(passedMissionIds.length + 1, COURSE_MISSION_IDS.length);
  if (
    unlockedMissionIds.length < 1 ||
    unlockedMissionIds.length > COURSE_MISSION_IDS.length ||
    passedMissionIds.length > COURSE_MISSION_IDS.length ||
    unlockedMissionIds.length !== expectedUnlockedCount ||
    unlockedMissionIds.some((missionId, index) => missionId !== unlockedPrefix[index]) ||
    passedMissionIds.some((missionId, index) => missionId !== passedPrefix[index]) ||
    !unlockedMissionIds.includes(activeMissionId)
  ) {
    throw new RangeError("Course progress does not follow the ordered mission sequence.");
  }

  return progress;
}

function requireMissionId(missionId) {
  if (typeof missionId !== "string" || !MISSION_INDEX.has(missionId)) {
    throw new RangeError(`Unknown mission id: ${String(missionId)}`);
  }
  return missionId;
}

function requireReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new TypeError("A mission receipt object is required.");
  }

  const missionId = requireMissionId(receipt.missionId);
  if (receipt.verdict !== "PASS" && receipt.verdict !== "FAIL") {
    throw new TypeError('Receipt verdict must be exactly "PASS" or "FAIL".');
  }

  return { missionId, verdict: receipt.verdict };
}

export function createCourseProgress() {
  return issueProgress({
    activeMissionId: COURSE_MISSION_IDS[0],
    unlockedMissionIds: [COURSE_MISSION_IDS[0]],
    passedMissionIds: [],
  });
}

export function isMissionUnlocked(progress, missionId) {
  const current = requireProgress(progress);
  const exactMissionId = requireMissionId(missionId);
  return current.unlockedMissionIds.includes(exactMissionId);
}

export function selectMission(progress, missionId) {
  const current = requireProgress(progress);
  const exactMissionId = requireMissionId(missionId);

  if (!current.unlockedMissionIds.includes(exactMissionId)) {
    throw new RangeError(`Mission is locked: ${exactMissionId}`);
  }
  if (current.activeMissionId === exactMissionId) return current;

  return issueProgress({
    activeMissionId: exactMissionId,
    unlockedMissionIds: current.unlockedMissionIds,
    passedMissionIds: current.passedMissionIds,
  });
}

export function recordMissionReceipt(progress, receipt) {
  const current = requireProgress(progress);
  const { missionId, verdict } = requireReceipt(receipt);

  if (verdict === "PASS" && current.passedMissionIds.includes(missionId)) {
    return current;
  }
  if (!current.unlockedMissionIds.includes(missionId)) {
    throw new RangeError(`Mission is locked: ${missionId}`);
  }
  if (current.activeMissionId !== missionId) {
    throw new RangeError(
      `Cannot record ${missionId} while ${current.activeMissionId} is active.`,
    );
  }
  if (verdict === "FAIL") return current;

  const missionIndex = MISSION_INDEX.get(missionId);
  const nextId = COURSE_MISSION_IDS[missionIndex + 1] ?? null;
  const unlockedMissionIds = nextId
    ? [...current.unlockedMissionIds, nextId]
    : current.unlockedMissionIds;

  return issueProgress({
    activeMissionId: current.activeMissionId,
    unlockedMissionIds,
    passedMissionIds: [...current.passedMissionIds, missionId],
  });
}

export function nextMissionId(progress, missionId) {
  const current = requireProgress(progress);
  const exactMissionId = requireMissionId(missionId);
  const nextId = COURSE_MISSION_IDS[MISSION_INDEX.get(exactMissionId) + 1] ?? null;
  return nextId && current.unlockedMissionIds.includes(nextId) ? nextId : null;
}
