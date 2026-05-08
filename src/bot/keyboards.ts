import { InlineKeyboard, Keyboard } from "grammy";
import type { AllowedUserRow, UserPrefs } from "../storage.js";

export const BTN_SETTINGS = "⚙️ Настройки";
export const BTN_ADD_USER = "👤 Добавить";
export const BTN_LIST_USERS = "👥 Список";

export function userKeyboard(): Keyboard {
  return new Keyboard().text(BTN_SETTINGS).resized().persistent();
}

export function adminKeyboard(): Keyboard {
  return new Keyboard()
    .text(BTN_SETTINGS)
    .row()
    .text(BTN_ADD_USER)
    .text(BTN_LIST_USERS)
    .resized()
    .persistent();
}

export function settingsInlineKeyboard(prefs: UserPrefs): InlineKeyboard {
  const ig = prefs.igCaption ? "✅" : "❌";
  const tt = prefs.ttCaption ? "✅" : "❌";
  const yt = prefs.ytCaption ? "✅" : "❌";
  return new InlineKeyboard()
    .text(`Подписи Instagram ${ig}`, "set:igc")
    .row()
    .text(`Подписи TikTok ${tt}`, "set:ttc")
    .row()
    .text(`Подписи YouTube ${yt}`, "set:ytc");
}

export function userListInlineKeyboard(users: AllowedUserRow[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const u of users) {
    const label = u.username
      ? `❌ @${u.username} (${u.userId})`
      : `❌ ${u.userId}`;
    kb.text(label, `rm:${u.userId}`).row();
  }
  return kb;
}
