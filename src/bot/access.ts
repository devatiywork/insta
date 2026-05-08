import type { Context, MiddlewareFn } from "grammy";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { isInAllowlist } from "../storage.js";

export function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && config.adminUserIds.has(userId);
}

export function hasAccess(userId: number | undefined): boolean {
  if (userId === undefined) return false;
  if (config.adminUserIds.has(userId)) return true;
  return isInAllowlist(userId);
}

export function createAccessGate(): MiddlewareFn<Context> {
  logger.info(
    { admins: config.adminUserIds.size },
    "access gate active",
  );
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (hasAccess(userId)) {
      return next();
    }
    logger.warn(
      {
        userId,
        username: ctx.from?.username,
        chatId: ctx.chat?.id,
        text: ctx.message?.text?.slice(0, 100),
      },
      "blocked: user has no access",
    );
    if (ctx.chat && userId !== undefined) {
      await ctx.reply(
        `🔐 У тебя нет доступа к этому боту.\n\nПередай этот ID администратору:\n<code>${userId}</code>`,
        { parse_mode: "HTML" },
      );
    }
  };
}
