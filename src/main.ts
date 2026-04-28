import { createBot } from "./bot/bot.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const bot = createBot();

  const stop = async (signal: string): Promise<void> => {
    logger.info({ signal }, "stopping bot");
    await bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));

  logger.info(
    { apiRoot: config.apiRoot },
    "starting bot",
  );
  await bot.start({
    onStart: (info) =>
      logger.info({ username: info.username }, "bot is running"),
  });
}

main().catch((err) => {
  logger.fatal({ err }, "fatal error");
  process.exit(1);
});
