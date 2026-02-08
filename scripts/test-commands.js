const assert = require("assert");
const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");

const outDir = path.join(__dirname, "..", ".tmp-tests");

fs.rmSync(outDir, { recursive: true, force: true });
execSync(
  [
    "node_modules/.bin/tsc",
    "--module commonjs",
    "--target es2020",
    "--outDir",
    outDir,
    "src/commands/create-event.ts",
    "src/commands/list-events.ts",
    "src/commands/index.ts",
    "src/commands/registry.ts",
    "src/commands/types.ts"
  ].join(" "),
  { stdio: "inherit" }
);

const { resolveCommand, commandCatalog } = require(path.join(
  outDir,
  "registry.js"
));

const catalog = commandCatalog();
assert.ok(catalog.length >= 2, "command registry should load commands");

const list = resolveCommand("오늘 일정 알려줘");
assert.ok(list, "list command should match");
assert.strictEqual(list.command.id, "list-events");

const create = resolveCommand("내일 3시 회의 추가");
assert.ok(create, "create command should match");
assert.strictEqual(create.command.id, "create-event");
assert.strictEqual(create.params.title, "회의");

fs.rmSync(outDir, { recursive: true, force: true });
console.log("command tests passed");
