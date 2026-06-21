import { QuarkfanToolsRuntime } from "./runtime.js";

type ParentCommand =
  | { type: "start"; botId: string }
  | { type: "stop" }
  | { type: "snapshot" };

const runtime = new QuarkfanToolsRuntime();
let started = false;

function send(type: string, payload: unknown): void {
  if (process.send) process.send({ type, payload });
}

runtime.on("log", (entry) => send("log", entry));
runtime.on("snapshot", (snapshot) => send("snapshot", snapshot));

async function start(botId: string): Promise<void> {
  if (!started) {
    await runtime.initialize(false);
    started = true;
  }
  await runtime.startBot(botId);
  send("snapshot", runtime.snapshot());
}

async function stop(): Promise<void> {
  await runtime.stop();
  send("snapshot", runtime.snapshot());
}

process.on("message", (message: ParentCommand) => {
  void (async () => {
    if (message.type === "start") {
      await start(message.botId);
    } else if (message.type === "stop") {
      await stop();
      process.exit(0);
    } else if (message.type === "snapshot") {
      send("snapshot", runtime.snapshot());
    }
  })().catch((error) => {
    send("error", String(error));
  });
});

process.on("SIGTERM", () => {
  void stop().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  void stop().finally(() => process.exit(0));
});
