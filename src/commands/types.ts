export type Env = {
  API_KEY: string;
  GCAL_SA_EMAIL: string;
  GCAL_SA_PRIVATE_KEY: string;
  GCAL_CALENDAR_ID: string;
};

export type CommandContext = {
  env: Env;
  text: string;
  token: string;
  now: Date;
  correlationId: string;
  calendar: {
    listEvents: (
      env: Env,
      token: string,
      timeMin: string,
      timeMax: string,
      maxResults?: number
    ) => Promise<any[]>;
    createEvent: (
      env: Env,
      token: string,
      title: string,
      startISO: string,
      endISO: string
    ) => Promise<any>;
  };
};

export type CommandDefinition<TParams, TResult> = {
  id: string;
  description: string;
  examples: string[];
  paramsSchema?: Record<string, unknown>;
  tags?: string[];
  match: (text: string) => TParams | null;
  handler: (ctx: CommandContext, params: TParams) => Promise<TResult>;
};
