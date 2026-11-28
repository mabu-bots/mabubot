// ==========================================
// 👀 プレゼンス文言の管理（/watching）
// ==========================================
import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { MabusabaStore } from "./store.js";
import { currentPresenceText, startPresenceCycle } from "./presence-cycle.js";
import { EMBED_COLOR_SUCCESS, replyEmbed } from "./util.js";

// ------------------------------------------
// 📝 ステータス文の解決と適用
// ------------------------------------------
// 📌 既定のカスタム文言。環境変数 WATCHING_TEXT、次いで /watching set で
// 保存した文言（SQLite）の順に上書きされる（解決順は resolveWatchingText）
export const DEFAULT_WATCHING_TEXT = "まぶさばを見守り中";
export const WATCHING_SETTING_KEY = "watching_text";

// 🔍 カスタム文言を解決する: 保存値 → 環境変数 → 既定値
export function resolveWatchingText(store: MabusabaStore): string {
  const stored = store.getSetting(WATCHING_SETTING_KEY)?.trim();
  if (stored) return stored;
  const env = process.env.WATCHING_TEXT?.trim();
  if (env) return env;
  return DEFAULT_WATCHING_TEXT;
}

// 🎮 実際に表示されるプレゼンスは全 Bot 共通のプレゼンス・サイクル
// （presence-cycle.ts）が担う。/watching set/reset の保存動作は互換の
// ため残すが、適用される表示は保存テキストではなくサイクル形式である
export function presenceText(client: Client): string {
  return currentPresenceText(client);
}

// 🚀 プレゼンス・サイクルを開始（再適用）する
export function applyWatching(client: Client, store: MabusabaStore): void {
  void store;
  startPresenceCycle(client);
}

// ------------------------------------------
// ⌨️ コマンド処理
// ------------------------------------------
export async function handleWatchingCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  store: MabusabaStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === "show") {
    await replyEmbed(
      interaction,
      "👀 視聴中ステータス",
      `現在の視聴中ステータス：${presenceText(client)}`,
    );
    return;
  }
  if (sub === "reset") {
    store.deleteSetting(WATCHING_SETTING_KEY);
    applyWatching(client, store);
    await replyEmbed(
      interaction,
      "👀 視聴中ステータスを既定に戻しました",
      `現在の視聴中ステータス：${presenceText(client)}`,
      EMBED_COLOR_SUCCESS,
    );
    return;
  }
  // 📌 set — プレゼンスは Bot 全体に効くため、この Bot がいる全ギルドに適用される
  const text = interaction.options.getString("text", true).trim();
  store.setSetting(WATCHING_SETTING_KEY, text);
  applyWatching(client, store);
  await replyEmbed(
    interaction,
    "👀 視聴中ステータスを設定しました",
    text,
    EMBED_COLOR_SUCCESS,
  );
}
