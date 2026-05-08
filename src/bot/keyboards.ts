import { InlineKeyboard, Keyboard } from "grammy";
import type { UserPrefs } from "../storage.js";

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
  return new InlineKeyboard()
    .text(`Подписи Instagram ${ig}`, "set:igc")
    .row()
    .text(`Подписи TikTok ${tt}`, "set:ttc");
}

export function userListInlineKeyboard(userIds: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const id of userIds) {
    kb.text(`❌ Удалить ${id}`, `rm:${id}`).row();
  }
  return kb;
}
