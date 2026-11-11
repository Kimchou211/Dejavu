import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const configPath = resolve(root, ".wrangler.local.jsonc");
const config = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));
const localVarsPath = resolve(root, existsSync(resolve(root, ".dev.vars")) ? ".dev.vars" : ".env");
const localVars = existsSync(localVarsPath) ? readFileSync(localVarsPath, "utf8") : "";
const twelveDataValue = localVars.match(/^\s*TWELVEDATA_API_KEY\s*=\s*(.*?)\s*$/m)?.[1] ?? "";
const twelveDataKey = twelveDataValue.replace(/^(['"])(.*)\1$/, "$2");

if (twelveDataKey && !config.secrets.required.includes("TWELVEDATA_API_KEY")) {
  config.secrets.required.push("TWELVEDATA_API_KEY");
}

writeFileSync(configPath, JSON.stringify(config, null, 2));
try {
  const wranglerPath = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(process.execPath, [
    wranglerPath,
    "dev",
    "--config", configPath,
    "--ip", "127.0.0.1",
    "--port", "8787",
    "--var", "LOCAL_AUTH_BYPASS:true",
    "--local",
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(configPath, { force: true });
}
