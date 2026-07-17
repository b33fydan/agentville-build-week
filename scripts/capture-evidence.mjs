import { parseSmokeArgs, runBrowserSmoke } from "./smoke-browser.mjs";

const options = parseSmokeArgs();
const result = await runBrowserSmoke({
  ...options,
  invocation: "capture",
});

if (result.ok) {
  console.log(`Evidence capture PASS · ${result.reportPath}`);
} else {
  console.error(`Evidence capture FAIL · ${result.reportPath}`);
  if (result.runnerError) console.error(result.runnerError.stack ?? result.runnerError.message);
  process.exitCode = 1;
}
