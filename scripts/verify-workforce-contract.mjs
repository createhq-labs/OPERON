import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name)) files.push(path);
  }
}
walk(sourceRoot);

const checks = [
  [/\.from\(["']notifications["']\)/, "default-schema notifications query"],
  [/\bsupabase\.from\(["']users["']\)/, "unscoped users query"],
  [/\.from\(["']documents["']\)\.delete\(/, "hard document delete"],
  [/\.from\(["']resources["']\)\.delete\(/, "hard resource delete"],
  [/allowed_team_names/, "free-text team visibility"],
];
const failures = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of checks) if (pattern.test(text)) failures.push(`${relative(root, file)}: ${label}`);
  if (!file.includes(`${join("app", "api")}`) && !file.endsWith("supabaseAdmin.ts") && text.includes("SUPABASE_SERVICE_ROLE_KEY")) failures.push(`${relative(root, file)}: service-role credential referenced by browser-capable code`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Workforce contract scan passed across ${files.length} source files.`);
