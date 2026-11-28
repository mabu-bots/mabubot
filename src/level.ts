// ==========================================
// 📊 XP・レベル・報酬ロール
// ==========================================
import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  TextChannel,
} from "discord.js";
import type { MabusabaStore } from "./store.js";
import {
  EMBED_COLOR_ERROR,
  EMBED_COLOR_INFO,
  EMBED_COLOR_SUCCESS,
  buildEmbed,
  levelFromTotalXp,
  replyEmbed,
  totalXpForLevel,
} from "./util.js";

// ------------------------------------------
// 📈 XP の定数と付与
// ------------------------------------------
// 📌 メッセージ1件でもらえる XP の範囲と、そのクールダウン
export const XP_PER_MESSAGE_MIN = 15;
export const XP_PER_MESSAGE_MAX = 25;
export const XP_COOLDOWN_MS = 60_000;

// 📈 XP を与え、レベルアップ（お祝い＋報酬ロール）まで処理して新しい
// レベル情報を返す。メッセージ XP とゲーム勝利の両方から使う。
// `touchCooldown: false`（ゲーム勝利）は、メッセージ XP の
// クールダウンをリセットせずに XP を与える
export async function awardXp(
  client: Client,
  store: MabusabaStore,
  guild: Guild,
  channel: TextChannel,
  userId: string,
  amount: number,
  opts: { touchCooldown?: boolean } = {},
): Promise<{
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  totalXp: number;
}> {
  const { before, after } = store.addXp(guild.id, userId, amount, opts);
  const oldLevel = before.level;
  const newLevel = levelFromTotalXp(after.xp).level;
  if (newLevel <= oldLevel) {
    return { leveledUp: false, oldLevel, newLevel, totalXp: after.xp };
  }
  // 🎁 今回またいだレベルの報酬ロールをすべて付与する。お祝いに
  // 載せるのは実際に付与できたロールだけ — 以前は、メンバーの
  // 取得やロール付与が失敗しても（階層など）設定済みの全ロールを
  // 「付与しました」と表示していた
  const rewards = store
    .getLevelRewards(guild.id)
    .filter((r) => r.level > oldLevel && r.level <= newLevel);
  const granted: typeof rewards = [];
  if (rewards.length) {
    const member = await guild.members.fetch(userId).catch(() => null);
    for (const reward of rewards) {
      if (!member) break;
      try {
        await member.roles.add(reward.role_id);
        granted.push(reward);
      } catch (error) {
        console.error(
          `[mabusaba] level reward role failed (${reward.role_id}):`,
          error,
        );
      }
    }
  }
  const rewardLines = granted.map(
    (r) =>
      `🎁 レベル ${r.level} の報酬ロール <@&${r.role_id}> を付与しました！`,
  );
  const embed = buildEmbed(
    `🎉 レベルアップ！`,
    `<@${userId}> が **レベル ${newLevel}** に上がりました！\nおめでとうございます 🎊${rewardLines.length ? `\n${rewardLines.join("\n")}` : ""}`,
    EMBED_COLOR_SUCCESS,
  );
  await channel.send({ embeds: [embed] }).catch(() => undefined);
  return { leveledUp: true, oldLevel, newLevel, totalXp: after.xp };
}

// ------------------------------------------
// 📊 レベル表示ヘルパー
// ------------------------------------------
// 📶 進捗バー（▰▱ の10マス）
function progressBar(into: number, needed: number, width = 10): string {
  const filled = Math.round((into / needed) * width);
  return (
    "▰".repeat(Math.max(0, Math.min(width, filled))) +
    "▱".repeat(Math.max(0, width - Math.min(width, filled)))
  );
}

// ------------------------------------------
// ⌨️ コマンド処理（/rank）
// ------------------------------------------
export async function handleRankCommand(
  interaction: ChatInputCommandInteraction,
  store: MabusabaStore,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyEmbed(
      interaction,
      "⚠️ サーバー内で使用してください",
      "このコマンドはサーバー内で使用してください。",
      EMBED_COLOR_ERROR,
    );
    return;
  }
  const user = interaction.options.getUser("user") ?? interaction.user;
  const row = store.getXp(guildId, user.id);
  const totalXp = row?.xp ?? 0;
  const info = levelFromTotalXp(totalXp);
  const rank = store.xpRank(guildId, user.id);
  const nextTotal = totalXpForLevel(info.level + 1);
  await replyEmbed(
    interaction,
    `📊 <@${user.id}> のランク`,
    [
      `**レベル**　${info.level}`,
      `**XP**　${totalXp} XP（次のレベルまで あと${info.xpNeededForNext - info.xpIntoLevel} XP / 累計 ${nextTotal} XP）`,
      `**進捗**　${progressBar(info.xpIntoLevel, info.xpNeededForNext)} ${info.xpIntoLevel}/${info.xpNeededForNext}`,
      `**順位**　${rank ? `${rank}位` : "—"}`,
    ].join("\n"),
    EMBED_COLOR_INFO,
    false,
  );
}

// ------------------------------------------
// ⌨️ コマンド処理（/leaderboard）
// ------------------------------------------
export async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction,
  store: MabusabaStore,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyEmbed(
      interaction,
      "⚠️ サーバー内で使用してください",
      "このコマンドはサーバー内で使用してください。",
      EMBED_COLOR_ERROR,
    );
    return;
  }
  const top = store.topXp(guildId, 10);
  if (!top.length) {
    await replyEmbed(
      interaction,
      "🏆 レベルランキング",
      "まだXPを獲得した人はいません。メッセージを送るとXPがもらえます。",
      EMBED_COLOR_INFO,
      false,
    );
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.map((row, i) => {
    const medal = medals[i] ?? `${i + 1}位`;
    return `${medal} <@${row.user_id}>　レベル ${row.level}　${row.xp} XP`;
  });
  await replyEmbed(
    interaction,
    "🏆 レベルランキング（上位10人）",
    lines.join("\n"),
    EMBED_COLOR_INFO,
    false,
  );
}

// ------------------------------------------
// ⌨️ コマンド処理（/level reward）
// ------------------------------------------
export async function handleLevelCommand(
  interaction: ChatInputCommandInteraction,
  store: MabusabaStore,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyEmbed(
      interaction,
      "⚠️ サーバー内で使用してください",
      "このコマンドはサーバー内で使用してください。",
      EMBED_COLOR_ERROR,
    );
    return;
  }
  const group = interaction.options.getSubcommandGroup(false);
  if (group !== "reward") {
    await replyEmbed(
      interaction,
      "⚠️ 不明なサブコマンドです",
      "不明なサブコマンドです。",
      EMBED_COLOR_ERROR,
    );
    return;
  }
  // 📌 reward グループには add / list / remove がある

  const rewardSub = interaction.options.getSubcommand(true);
  if (rewardSub === "list") {
    const rewards = store.getLevelRewards(guildId);
    if (!rewards.length) {
      await replyEmbed(
        interaction,
        "🎁 レベル報酬ロール",
        "レベル報酬ロールは設定されていません。",
      );
      return;
    }
    await replyEmbed(
      interaction,
      "🎁 レベル報酬ロール",
      rewards.map((r) => `レベル ${r.level} → <@&${r.role_id}>`).join("\n"),
    );
    return;
  }
  if (rewardSub === "remove") {
    const level = interaction.options.getInteger("level", true);
    store.deleteLevelReward(guildId, level);
    await replyEmbed(
      interaction,
      "🎁 レベル報酬ロールを削除しました",
      `レベル ${level} の報酬ロールを削除しました。`,
      EMBED_COLOR_SUCCESS,
    );
    return;
  }
  // 📌 add — level（必須）が role（必須）より前に来る
  const level = interaction.options.getInteger("level", true);
  const role = interaction.options.getRole("role", true);
  // 📌 @everyone と連携サービス管理の役職はメンバーへ付与できない。
  // ここで受け付けてもレベルアップ時に失敗するだけなので弾く
  if (role.id === guildId || role.managed) {
    await replyEmbed(
      interaction,
      "⚠️ その役職は付与できません",
      `<@&${role.id}> は自動付与できない役職です（@everyone・連携サービス管理の役職は付与できません）。`,
      EMBED_COLOR_ERROR,
    );
    return;
  }
  store.setLevelReward(guildId, level, role.id);
  await replyEmbed(
    interaction,
    "🎁 レベル報酬ロールを設定しました",
    `レベル ${level} に到達したら <@&${role.id}> を付与します。`,
    EMBED_COLOR_SUCCESS,
  );
}
