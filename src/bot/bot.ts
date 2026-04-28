import { Bot, GrammyError, HttpError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { registerStart } from "./handlers/start.js";
import { registerMessage } from "./handlers/message.js";

export function createBot(): Bot {
  const bot = new Bot(config.botToken, {
    client: { apiRoot: config.apiRoot },
  });

  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

  registerStart(bot);
  registerMessage(bot);

  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    const log = logger.child({
      updateId: ctx.update.update_id,
      chatId: ctx.chat?.id,
    });
    if (e instanceof GrammyError) {
      log.error({ description: e.description }, "telegram api error");
    } else if (e instanceof HttpError) {
      log.error({ err: e.message }, "telegram network error");
    } else {
      log.error({ err: e }, "unhandled bot error");
    }
  });

  return bot;
}
