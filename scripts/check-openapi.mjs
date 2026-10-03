import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("docker", [
  "run", "--rm", "--pull", "never", "--network", "none",
  "--env", "COMMUNITY_ENVIRONMENT=test",
  "--mount", `type=bind,source=${resolve(root, "backend")},target=/app,readonly`,
  "--mount", `type=bind,source=${resolve(root, "packages")},target=/contracts,readonly`,
  "community-platform-tests", "python3", "-m", "app.cli", "check-openapi",
], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

if (result.error) console.error(`OpenAPI check could not start Docker: ${result.error.code ?? result.error.message}`);
process.exitCode = result.status ?? 1;