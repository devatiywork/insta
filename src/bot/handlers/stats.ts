import type { Bot } from "grammy";
import { type StatsSummary, getStatsSummary } from "../../stats.js";
import { isAdmin } from "../access.js";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function formatRel(unixTs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixTs;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} д назад`;
  return new Date(unixTs * 1000).toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatStats(s: StatsSummary): string {
  const lines: string[] = [];
  lines.push("📊 <b>Статистика</b>");
  lines.push("");
  lines.push(`Всего скачано: <b>${s.total}</b>`);
  if (s.byPlatform.length > 0) {
    for (const p of s.byPlatform) {
      const label = PLATFORM_LABEL[p.platform] ?? p.platform;
      lines.push(`• ${label}: ${p.count}`);
    }
  }
  if (s.topUsers.length > 0) {
    lines.push("");
    lines.push("🥇 <b>Топ юзеров:</b>");
    s.topUsers.forEach((u, i) => {
      const name = u.username
        ? `@${escapeHtml(u.username)}`
        : `<code>${u.userId}</code>`;
      lines.push(`  ${i + 1}. ${name} — ${u.count} (${formatRel(u.lastTs)})`);
    });
  }
  if (s.recentErrors.length > 0) {
    lines.push("");
    lines.push("⚠️ <b>Последние ошибки:</b>");
    for (const e of s.recentErrors) {
      const platform = e.platform ?? "?";
      const name = e.errorName ?? "Error";
      lines.push(`  • ${formatRel(e.ts)} · ${platform} · ${escapeHtml(name)}`);
    }
  }
  return lines.join("\n");
}

export function registerStats(bot: Bot): void {
  const adminOnly = bot.filter((ctx) => isAdmin(ctx.from?.id));
  adminOnly.command("stats", async (ctx) => {
    const summary = getStatsSummary(10, 5);
    await ctx.reply(formatStats(summary), { parse_mode: "HTML" });
  });
}
