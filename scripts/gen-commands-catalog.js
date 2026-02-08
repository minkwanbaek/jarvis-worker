const fs = require("fs");
const path = require("path");

const commandsDir = path.join(__dirname, "..", "src", "commands");
const outputPath = path.join(__dirname, "..", "docs", "COMMANDS.md");
const ignore = new Set(["index.ts", "registry.ts", "types.ts"]);

const files = fs
  .readdirSync(commandsDir)
  .filter((file) => file.endsWith(".ts") && !ignore.has(file))
  .sort();

const entries = files.map((file) => {
  const fullPath = path.join(commandsDir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  return parseCommand(file, content);
});

const lines = [
  "# Command Catalog",
  "",
  "자동 생성된 명령어 목록입니다. (scripts/gen-commands-catalog.js)",
  "",
  "| ID | Description | Examples | Tags |",
  "| --- | --- | --- | --- |",
  ...entries.map((entry) => {
    const examples = entry.examples.join("<br/>");
    const tags = entry.tags.join(", ");
    return `| ${entry.id} | ${entry.description} | ${examples} | ${tags} |`;
  })
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);

function parseCommand(file, content) {
  const id = matchValue(content, /id:\s*"([^"]+)"/);
  const description = matchValue(content, /description:\s*"([^"]+)"/);
  const tags = matchArray(content, /tags:\s*\[([\s\S]*?)\]/);
  const examples = matchArray(content, /examples:\s*\[([\s\S]*?)\]/);

  if (!id || !description) {
    throw new Error(`Missing metadata in ${file}`);
  }

  return {
    id,
    description,
    tags: tags.length ? tags : [],
    examples: examples.length ? examples : []
  };
}

function matchValue(content, regex) {
  const match = content.match(regex);
  return match ? match[1] : "";
}

function matchArray(content, regex) {
  const match = content.match(regex);
  if (!match) return [];
  const body = match[1];
  const values = [];
  const valueRegex = /"([^"]+)"/g;
  let current = valueRegex.exec(body);
  while (current) {
    values.push(current[1]);
    current = valueRegex.exec(body);
  }
  return values;
}
