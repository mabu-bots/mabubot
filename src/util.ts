// ==========================================
// 🧰 共通ユーティリティ（埋め込み・時刻・XP計算）
// ==========================================
import { randomBytes } from "node:crypto";
import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";

// ------------------------------------------
// 🎨 埋め込みの共通部品
// ------------------------------------------
// 📌 全返信の見た目を揃えるための共通定義。返信はプレーンテキストでなく
// 常に埋め込みで返す
export const EMBED_COLOR_INFO = 0x5865f2;
export const EMBED_COLOR_SUCCESS = 0x57f287;
export const EMBED_COLOR_ERROR = 0xed4245;
export const EMBED_FOOTER = "✨ まぶさば";

// 🎨 標準の埋め込みを作る
export function buildEmbed(
  title: string,
  description: string,
  color: number = EMBED_COLOR_INFO,
  fields?: Array<{ name: string; value: string; inline?: boolean }>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: EMBED_FOOTER })
    .setTimestamp(new Date());
  if (fields?.length) embed.addFields(fields);
  return embed;
}

// 💬 コマンド返信はすべてここを通し、見た目を統一する。
// 限定表示（ephemeral）でも埋め込みは使える: embeds + ephemeral:true の
// 返信は、実行者にだけ見える埋め込みとして描画される
export async function replyEmbed(
  interaction: ChatInputCommandInteraction,
  title: string,
  description: string,
  color: number = EMBED_COLOR_INFO,
  ephemeral = true,
  fields?: Array<{ name: string; value: string; inline?: boolean }>,
): Promise<void> {
  const embed = buildEmbed(title, description, color, fields);
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], ephemeral });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral });
  }
}

// ------------------------------------------
// 🕐 時刻・期間の変換
// ------------------------------------------
// ⏱️ ミリ秒を「1日2時間3分4秒」形式に整形する
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}日`);
  if (hours) parts.push(`${hours}時間`);
  if (minutes) parts.push(`${minutes}分`);
  // 📌 秒は常に出す（ただし大きな単位で分単位まで揃っている場合は除く）
  if (seconds || !parts.length) parts.push(`${seconds}秒`);
  return parts.join("");
}

// 🕐 Discord の絶対時刻表記（フル形式）
export function discordTimestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

// 🕐 Discord の絶対時刻表記（時刻のみ）
export function shortTimestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:t>`;
}

// 🕐 Discord の相対時刻表記（「○分後」形式）
export function relativeTimestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

// ------------------------------------------
// ⏳ 期間のパース
// ------------------------------------------
// 📝 /mod timeout などで使う期間のパース。
// 受け付ける形式: `30s` / `10m` / `1h` / `1d` / `1w`、日本語の
// `30秒` / `10分` / `2時間` / `3日` / `1週間`、組み合わせ
// `1時間30分` / `1d12h` も可。解釈できなければ null を返す
export function parseDurationMs(input: string): number | null {
  const text = input
    .trim()
    .replace(/[０-９]/g, (c) => String("０１２３４５６７８９".indexOf(c)))
    .replace(/　/g, " ")
    .replace(/\s+/g, "");
  if (!text) return null;
  const unitMs: Array<[RegExp, number]> = [
    [/(\d+(?:\.\d+)?)(?:週間|週|w)/, 7 * 86400000],
    [/(\d+(?:\.\d+)?)(?:日|d)/, 86400000],
    [/(\d+(?:\.\d+)?)(?:時間|時|h)/, 3600000],
    [/(\d+(?:\.\d+)?)(?:分|min|m)/, 60000],
    [/(\d+(?:\.\d+)?)(?:秒|sec|s)/, 1000],
  ];
  let total = 0;
  let matched = false;
  let rest = text;
  for (const [re, ms] of unitMs) {
    const m = rest.match(re);
    if (m) {
      matched = true;
      total += Number(m[1]) * ms;
      rest = rest.replace(m[0], "");
    }
  }
  // 📌 単位なしの数字だけの入力は「分」として読む
  if (!matched && /^\d+(?:\.\d+)?$/.test(rest)) {
    total = Number(rest) * 60000;
    matched = true;
    rest = "";
  }
  if (!matched || rest !== "" || total <= 0) return null;
  return total;
}

// ------------------------------------------
// 🇯🇵 日本時間ヘルパー
// ------------------------------------------
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 🗓️ epoch ms を日本時間の年月日時分秒に分解する
function jstParts(ms: number): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
} {
  const date = new Date(ms + JST_OFFSET_MS);
  return {
    y: date.getUTCFullYear(),
    mo: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds(),
  };
}

// 🗓️ 日本時間の年月日時分秒を epoch ms に変換する。
// 存在しない日時（2月30日など）は往復確認で弾いて null を返す
function jstToMs(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s = 0,
): number | null {
  if (
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > 31 ||
    h < 0 ||
    h > 23 ||
    mi < 0 ||
    mi > 59 ||
    s < 0 ||
    s > 59
  )
    return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - JST_OFFSET_MS;
  const back = jstParts(ms);
  if (
    back.y !== y ||
    back.mo !== mo ||
    back.d !== d ||
    back.h !== h ||
    back.mi !== mi ||
    back.s !== s
  )
    return null;
  return ms;
}

// ------------------------------------------
// 📅 時刻入力のパース
// ------------------------------------------
// 📝 /recruit の開始時刻などに使う未来時刻のパース（すべて日本時間）。
// 受け付ける形式:
//   - 相対: `30分後`、`2時間後`、`1時間30分後`、`3日後`
//   - 当日の時刻: `21:00`（過ぎていれば翌日とみなす）
//   - 日付と時刻: `2026-11-14 21:00`、`2026/11/14 21:00`、`11-14 21:00`
//   - ISO 8601: `2026-11-14T21:00:00+09:00`
// 未来でない、または解釈できない入力には null を返す
export function parseTimeInput(input: string, now = Date.now()): number | null {
  const text = input
    .trim()
    .replace(/[０-９]/g, (c) => String("０１２３４５６７８９".indexOf(c)))
    .replace(/：/g, ":")
    .replace(/　/g, " ");
  if (!text) return null;

  // ⏩ 相対指定: `2時間30分後`、`30分後`、`3日後`、`1週間後`。
  // すべての要素が消費されなければならない。数字の前後に余分な文字が
  // ある入力（`abc30分後`、`30分xyz後`）は、ゴミを黙って捨てずに弾く
  const relative = text.match(/^(.+?)後$/);
  if (relative) {
    let rest = relative[1].replace(/\s+/g, "");
    const units: Array<[RegExp, number]> = [
      [/(\d+(?:\.\d+)?)(?:週間|週)/, 7 * 86400000],
      [/(\d+(?:\.\d+)?)日/, 86400000],
      [/(\d+(?:\.\d+)?)時間/, 3600000],
      [/(\d+(?:\.\d+)?)分/, 60000],
      [/(\d+(?:\.\d+)?)秒/, 1000],
    ];
    let deltaMs = 0;
    let matched = false;
    for (const [re, ms] of units) {
      const m = rest.match(re);
      if (m) {
        matched = true;
        deltaMs += Number(m[1]) * ms;
        rest = rest.replace(m[0], "");
      }
    }
    if (!matched || rest !== "" || !deltaMs) return null;
    return now + deltaMs;
  }

  let ms: number | null = null;
  const dated = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (dated) {
    ms = jstToMs(
      Number(dated[1]),
      Number(dated[2]),
      Number(dated[3]),
      Number(dated[4]),
      Number(dated[5]),
      Number(dated[6] ?? 0),
    );
  } else {
    const monthDay = text.match(
      /^(\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
    );
    if (monthDay) {
      ms = jstToMs(
        jstParts(now).y,
        Number(monthDay[1]),
        Number(monthDay[2]),
        Number(monthDay[3]),
        Number(monthDay[4]),
        Number(monthDay[5] ?? 0),
      );
      // 📌 今年のその日付がすでに過去なら来年とみなす（過去の時刻を
      // 翌日とみなす扱いと揃える）
      if (ms !== null && ms <= now) {
        ms = jstToMs(
          jstParts(now).y + 1,
          Number(monthDay[1]),
          Number(monthDay[2]),
          Number(monthDay[3]),
          Number(monthDay[4]),
          Number(monthDay[5] ?? 0),
        );
      }
    } else {
      const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeOnly) {
        const today = jstParts(now);
        ms = jstToMs(
          today.y,
          today.mo,
          today.d,
          Number(timeOnly[1]),
          Number(timeOnly[2]),
          Number(timeOnly[3] ?? 0),
        );
        // 📌 当日のその時刻がすでに過去なら翌日とみなす
        if (ms !== null && ms <= now) ms += 86400000;
      } else {
        const parsed = Date.parse(text);
        ms = Number.isNaN(parsed) ? null : parsed;
      }
    }
  }
  if (ms === null || ms <= now) return null;
  return ms;
}

// ------------------------------------------
// 📊 レベル・XP計算
// ------------------------------------------
// 📈 xpForLevel(n): レベル n から n+1 に上がるのに必要な XP
export function xpForLevel(n: number): number {
  return 5 * n * n + 50 * n + 100;
}

// 📈 レベル 0 から `level` に到達するまでの累計 XP。
// sum_{i=0}^{level-1} (5i^2 + 50i + 100) の閉形式で、レベル数ぶんの
// ループではなく O(1) で求まる
export function totalXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return (
    (5 * (level - 1) * level * (2 * level - 1)) / 6 +
    25 * (level - 1) * level +
    100 * level
  );
}

// 📊 累計 XP から導いたレベル情報
export interface LevelInfo {
  // 📌 現在のレベル
  level: number;
  // 📌 現レベルに入ってから稼いだ XP
  xpIntoLevel: number;
  // 📌 次のレベルに必要な XP（現レベルの区間の幅）
  xpNeededForNext: number;
}

// 📈 累計 XP から現在のレベルと進捗を求める
export function levelFromTotalXp(totalXp: number): LevelInfo {
  let level = 0;
  let remaining = Math.max(0, totalXp);
  for (;;) {
    const needed = xpForLevel(level);
    if (remaining < needed)
      return { level, xpIntoLevel: remaining, xpNeededForNext: needed };
    remaining -= needed;
    level++;
  }
}

// ------------------------------------------
// 🧩 汎用ユーティリティ
// ------------------------------------------
// 🎲 min〜max（両端含む）の整数乱数
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 🆔 投票・募集・タイマー用の一意 ID（SQLite の主キーになり、ボタンの
// customId にも埋め込まれる）。旧方式（base36 のタイムスタンプ＋
// 4桁の Math.random）は1ミリ秒あたり9,000通りしかなく、衝突すると
// 公開メッセージ送信後の INSERT が例外になり、ボタンが効かない
// 孤児が残った。暗号乱数48ビットで衝突を無視できる水準にする
export function generateId(): string {
  return `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// 📝 表示行を Discord の埋め込み説明文の上限（4096文字）を超えない
// ように連結する。収まらなかった行は捨て、その件数を `omitted` で
// 返すので、呼び出し側は「他○件」の注記を付けられる（返信全体を
// 失敗させるより良い）
export function joinLinesWithinLimit(
  lines: string[],
  maxChars = 3800,
): { text: string; omitted: number } {
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const next = length + (kept.length ? 1 : 0) + line.length;
    if (next > maxChars) break;
    kept.push(line);
    length = next;
  }
  return { text: kept.join("\n"), omitted: lines.length - kept.length };
}

// 🔢 n を min〜max の範囲に収める
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
