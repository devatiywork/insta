import type { Bot, Context } from "grammy";
import { logger } from "../../logger.js";
import { getPrefs, setPrefs, type UserPrefs } from "../../storage.js";
import { BTN_SETTINGS, settingsInlineKeyboard } from "../keyboards.js";

const HEADER =
  "⚙️ <b>Настройки</b>\n\nЕсли подпись выключена, бот пришлёт только медиа без текста.";

async function showSettings(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const prefs = getPrefs(userId);
  await ctx.reply(HEADER, {
    parse_mode: "HTML",
    reply_markup: settingsInlineKeyboard(prefs),
  });
}

async function handleToggle(
  ctx: Context,
  field: keyof UserPrefs,
): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const current = getPrefs(userId);
  const next = await setPrefs(userId, { [field]: !current[field] });
  logger.info(
    { userId, field, value: next[field] },
    "user toggled caption pref",
  );
  await ctx.editMessageReplyMarkup({
    reply_markup: settingsInlineKeyboard(next),
  });
  await ctx.answerCallbackQuery({
    text: next[field] ? "Подписи включены" : "Подписи выключены",
  });
}

export function registerSettings(bot: Bot): void {
  bot.command("settings", showSettings);
  bot.hears(BTN_SETTINGS, showSettings);

  bot.callbackQuery("set:igc", (ctx) => handleToggle(ctx, "igCaption"));
  bot.callbackQuery("set:ttc", (ctx) => handleToggle(ctx, "ttCaption"));
}
