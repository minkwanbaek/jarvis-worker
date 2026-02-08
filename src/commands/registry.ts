import { commands } from "./index";
import type { CommandDefinition } from "./types";

export type ResolvedCommand<TParams, TResult> = {
  command: CommandDefinition<TParams, TResult>;
  params: TParams;
};

export function resolveCommand(text: string) {
  for (const command of commands) {
    const params = command.match(text);
    if (params) {
      return { command, params };
    }
  }
  return null;
}

export function commandCatalog() {
  return commands.map((command) => ({
    id: command.id,
    description: command.description,
    examples: command.examples,
    tags: command.tags ?? []
  }));
}

export function commandHelpText() {
  const lines = commandCatalog().map(
    (command) => `- ${command.description}: ${command.examples.join(", ")}`
  );
  return `지원 명령:\n${lines.join("\n")}`;
}
