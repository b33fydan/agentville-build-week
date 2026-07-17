import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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
      mission: "Repair the East Channel",
      builtAt: new Date().toISOString(),
      runtime: "static",
    },
    null,
    2,
  )}\n`,
);

console.log(`Built static site at ${dist}`);
