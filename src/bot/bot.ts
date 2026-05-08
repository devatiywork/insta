import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createAccessGate } from "./access.js";
import { registerAdmin } from "./handlers/admin.js";
import { registerAudio } from "./handlers/audio.js";
import { registerMessage } from "./handlers/message.js";
import { registerSettings } from "./handlers/settings.js";
import { registerStart } from "./handlers/start.js";
import { registerStats } from "./handlers/stats.js";

export function createBot(): Bot {
  const bot = new Bot(config.botToken, {
    client: { apiRoot: config.apiRoot },
  });

  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

  bot.use(createAccessGate());

  registerStart(bot);
  registerSettings(bot);
  registerStats(bot);
  registerAudio(bot);
  registerAdmin(bot);
  registerMessage(bot);

  bot.api
    .setMyCommands([
      { command: "start", description: "Приветствие" },
      { command: "help", description: "Справка" },
      { command: "settings", description: "Настройки подписей" },
      { command: "audio", description: "Извлечь аудио из ссылки" },
    ])
    .catch((err) => logger.warn({ err }, "failed to set bot commands"));

  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    const log = logger.child({
      updateId: ctx.update.update_id,
      chatId: ctx.chat?.id,
    });
    if (e instanceof GrammyError) {
      log.error(
        {
          description: e.description,
          method: e.method,
          parameters: e.parameters,
          payload: e.payload,
        },
        "telegram api error",
      );
    } else if (e instanceof HttpError) {
      log.error({ err: e }, "telegram network error");
    } else {
      log.error({ err: e }, "unhandled bot error");
    }
  });

  return bot;
}
