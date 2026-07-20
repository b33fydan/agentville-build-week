import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listMissionDefinitions } from "../src/mission-registry.js";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ["index.html", "src", "feedback"]) {
  await cp(resolve(root, entry), resolve(dist, entry), { recursive: true });
}

await writeFile(
  resolve(dist, "build-meta.json"),
  `${JSON.stringify(
    {
      product: "AgentVille: Build Week Edition",
      missions: listMissionDefinitions().map(({ id, name }) => ({ id, name })),
      missionCount: listMissionDefinitions().length,
      builtAt: new Date().toISOString(),
      runtime: "static",
    },
    null,
    2,
  )}\n`,
);

console.log(`Built static site at ${dist}`);
