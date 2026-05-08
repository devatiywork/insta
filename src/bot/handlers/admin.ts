import type { Bot, Context } from "grammy";
import { logger } from "../../logger.js";
import {
  addAllowedUser,
  listAllowedUsers,
  removeAllowedUser,
} from "../../storage.js";
import { isAdmin } from "../access.js";
import {
  BTN_ADD_USER,
  BTN_LIST_USERS,
  userListInlineKeyboard,
} from "../keyboards.js";

type PendingState = "add";
const pending = new Map<number, PendingState>();

export function isAwaitingAdminInput(userId: number): boolean {
  return pending.has(userId);
}

function extractUserIdFromMessage(ctx: Context): number | "hidden" | null {
  const msg = ctx.message;
  if (!msg) return null;

  const origin = msg.forward_origin;
  if (origin) {
    if (origin.type === "user") {
      return origin.sender_user.id;
    }
    if (origin.type === "hidden_user") {
      return "hidden";
    }
    return null;
  }

  const text = msg.text?.trim();
  if (!text) return null;
  const n = Number(text);
  if (Number.isInteger(n) && n > 0) return n;
  return null;
}

async function startAdd(ctx: Context): Promise<void> {
  const adminId = ctx.from?.id;
  if (adminId === undefined) return;
  pending.set(adminId, "add");
  await ctx.reply(
    "Пришли ID пользователя или перешли любое его сообщение.\n/cancel — отменить.",
  );
}

async function showList(ctx: Context): Promise<void> {
  const users = listAllowedUsers();
  if (users.length === 0) {
    await ctx.reply("Пока никого не добавил.");
    return;
  }
  await ctx.reply(`👥 Пользователей: <b>${users.length}</b>`, {
    parse_mode: "HTML",
    reply_markup: userListInlineKeyboard(users),
  });
}

async function cancel(ctx: Context): Promise<void> {
  const adminId = ctx.from?.id;
  if (adminId === undefined) return;
  if (pending.delete(adminId)) {
    await ctx.reply("Окей, отменил.");
  }
}

export async function handleAdminPendingMessage(ctx: Context): Promise<boolean> {
  const adminId = ctx.from?.id;
  if (adminId === undefined) return false;
  const state = pending.get(adminId);
  if (!state) return false;

  const text = ctx.message?.text?.trim();
  if (text === "/cancel") {
    pending.delete(adminId);
    await ctx.reply("Окей, отменил.");
    return true;
  }
  if (text && text.startsWith("/")) {
    pending.delete(adminId);
    return false;
  }

  const result = extractUserIdFromMessage(ctx);
  if (result === "hidden") {
    await ctx.reply(
      "У этого пользователя профиль скрыт — ID из форварда не вытащить. Пришли ID числом.",
    );
    return true;
  }
  if (result === null) {
    await ctx.reply(
      "Не понял. Пришли ID числом или форвардни сообщение пользователя. /cancel — отменить.",
    );
    return true;
  }

  pending.delete(adminId);
  if (isAdmin(result)) {
    await ctx.reply(
      `Юзер <code>${result}</code> уже админ — доступ и так есть.`,
      { parse_mode: "HTML" },
    );
    return true;
  }
  const added = await addAllowedUser(result);
  logger.info({ adminId, addedUserId: result, isNew: added }, "admin added user");
  await ctx.reply(
    added
      ? `✅ Добавлен пользователь <code>${result}</code>.`
      : `Пользователь <code>${result}</code> уже в списке.`,
    { parse_mode: "HTML" },
  );
  return true;
}

async function handleRemoveCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("rm:")) return;
  const userId = Number(data.slice(3));
  if (!Number.isInteger(userId)) {
    await ctx.answerCallbackQuery({ text: "Кривой id" });
    return;
  }
  const removed = await removeAllowedUser(userId);
  logger.info(
    { adminId: ctx.from?.id, removedUserId: userId, wasPresent: removed },
    "admin removed user",
  );
  const users = listAllowedUsers();
  if (users.length === 0) {
    await ctx.editMessageText("👥 Список пуст.");
  } else {
    await ctx.editMessageText(`👥 Пользователей: <b>${users.length}</b>`, {
      parse_mode: "HTML",
      reply_markup: userListInlineKeyboard(users),
    });
  }
  await ctx.answerCallbackQuery({
    text: removed ? `Удалён ${userId}` : `${userId} уже не было`,
  });
}

export function registerAdmin(bot: Bot): void {
  const adminOnly = bot.filter((ctx) => isAdmin(ctx.from?.id));

  adminOnly.command("add", startAdd);
  adminOnly.hears(BTN_ADD_USER, startAdd);

  adminOnly.command("users", showList);
  adminOnly.hears(BTN_LIST_USERS, showList);

  adminOnly.command("cancel", cancel);

  adminOnly.callbackQuery(/^rm:\d+$/, handleRemoveCallback);
}
