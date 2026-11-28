// ==========================================
// 🔔 イベント処理（参加・メッセージ・ボタン）
// ==========================================
import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Message,
} from "discord.js";
import type { MabusabaStore } from "./store.js";
import { applyAutorole, sendWelcome } from "./welcome.js";
import {
  XP_COOLDOWN_MS,
  XP_PER_MESSAGE_MAX,
  XP_PER_MESSAGE_MIN,
  awardXp,
} from "./level.js";
import { handlePollButton } from "./poll.js";
import { handleRecruitButton } from "./recruit.js";
import { sendModLog } from "./mod.js";
import { formatDuration, randomInt } from "./util.js";

// ------------------------------------------
// 🚨 スパム対策の定数と型
// ------------------------------------------
// 📌 荒らし対策の閾値: 同一ユーザーが5秒に6件以上、または10秒に
// 同一内容を5件以上送ると10分タイムアウト
const SPAM_WINDOW_MS = 5_000;
const SPAM_COUNT = 6;
const SPAM_SAME_WINDOW_MS = 10_000;
const SPAM_SAME_COUNT = 5;
const AUTO_TIMEOUT_MS = 10 * 60_000;
const AUTO_TIMEOUT_COOLDOWN_MS = 60_000;

// 📨 直近メッセージの記録（スパム判定用）
interface RecentMessage {
  atMs: number;
  content: string;
  messageId: string;
  channelId: string;
}

// ------------------------------------------
// 🔌 イベント登録
// ------------------------------------------
export function registerEvents(client: Client, store: MabusabaStore): void {
  const recentByUser = new Map<string, RecentMessage[]>();
  const lastAutoTimeout = new Map<string, number>();

  // 🧹 投稿をやめたユーザーの記録を掃除する。これが無いと、両方の
  // マップが「今まで見た全ユーザー」ぶん増え続ける
  const prune = setInterval(() => {
    const now = Date.now();
    for (const [key, recent] of recentByUser) {
      if (
        !recent.length ||
        now - recent[recent.length - 1]!.atMs > SPAM_SAME_WINDOW_MS
      )
        recentByUser.delete(key);
    }
    for (const [key, at] of lastAutoTimeout) {
      if (now - at > AUTO_TIMEOUT_COOLDOWN_MS) lastAutoTimeout.delete(key);
    }
  }, 10 * 60_000);
  prune.unref();

  // ----- メンバー参加（ウェルカム・自動ロール） -----
  client.on("guildMemberAdd", async (member) => {
    if (member.user.bot) return;
    await sendWelcome(member, store);
    await applyAutorole(member, store);
  });

  // ----- メッセージ（スパム対策・XP） -----
  client.on("messageCreate", async (message: Message) => {
    if (!message.guildId || !message.guild || message.author.bot) return;
    if (message.channel.type !== ChannelType.GuildText) return;
    const guildId = message.guildId;
    const userId = message.author.id;
    const now = Date.now();

    // ----- スパム対策 -----
    // 📌 XP より先に実行し、スパムが XP を稼げないようにする
    const key = `${guildId}:${userId}`;
    const recent = (recentByUser.get(key) ?? []).filter(
      (r) => now - r.atMs <= SPAM_SAME_WINDOW_MS,
    );
    recent.push({
      atMs: now,
      content: message.content,
      messageId: message.id,
      channelId: message.channelId,
    });
    recentByUser.set(key, recent);
    const in5s = recent.filter((r) => now - r.atMs <= SPAM_WINDOW_MS).length;
    const sameIn10s = recent.filter(
      (r) => r.content === message.content && message.content.length > 0,
    ).length;
    if (
      (in5s >= SPAM_COUNT || sameIn10s >= SPAM_SAME_COUNT) &&
      now - (lastAutoTimeout.get(key) ?? 0) > AUTO_TIMEOUT_COOLDOWN_MS
    ) {
      const member = await message.guild.members
        .fetch(userId)
        .catch(() => null);
      // 📌 モデレーターとオーナーは自動タイムアウトしない: 対応中に
      // 素早く投稿するモデレーターは仕事をしているだけである
      //（オーナーと上位ロールは `moderatable` でも守られていたが、
      // Bot より下のロールのモデレーターは守られていなかった）
      const exempt =
        member !== null &&
        (member.id === message.guild.ownerId ||
          member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
          member.permissions.has(PermissionFlagsBits.Administrator));
      if (exempt) {
        // 📌 窓をリセットし、このメッセージは通常どおり XP を得る
        recentByUser.set(key, []);
      } else {
        lastAutoTimeout.set(key, now);
        if (member?.moderatable) {
          await member
            .timeout(AUTO_TIMEOUT_MS, "荒らし対策：短時間の連投を検知")
            .catch(() => undefined);
          // 🗑️ スパムメッセージを削除する。記録はギルド＋ユーザー
          // 単位のため複数チャンネルにまたがりうる — チャンネル
          // ごとにまとめて一括削除する（現在のチャンネルの ID を
          // 1件ずつ消す旧方式は、他チャンネルのスパムを残していた）
          const byChannel = new Map<string, string[]>();
          for (const r of recent) {
            const ids = byChannel.get(r.channelId) ?? [];
            ids.push(r.messageId);
            byChannel.set(r.channelId, ids);
          }
          for (const [channelId, ids] of byChannel) {
            const ch =
              channelId === message.channelId
                ? message.channel
                : await message.guild.channels
                    .fetch(channelId)
                    .catch(() => null);
            if (!ch || !("bulkDelete" in ch)) continue;
            for (let i = 0; i < ids.length; i += 100) {
              await ch
                .bulkDelete(ids.slice(i, i + 100), true)
                .catch(() => undefined);
            }
          }
          await sendModLog(
            client,
            store,
            guildId,
            "🚨 荒らし対策：自動タイムアウト",
            `<@${userId}> を ${formatDuration(AUTO_TIMEOUT_MS)} タイムアウトしました。\n理由：短時間の連投（${in5s}件/5秒）または同一内容の連投（${sameIn10s}件/10秒）を検知`,
          );
        }
        recentByUser.set(key, []);
        return;
      }
    }

    // ----- XP付与 -----
    // 📌 1件15〜25 XP、ギルド＋ユーザーごとに60秒クールダウン
    const row = store.getXp(guildId, userId);
    if (row && now - row.last_xp_at_ms < XP_COOLDOWN_MS) return;
    const amount = randomInt(XP_PER_MESSAGE_MIN, XP_PER_MESSAGE_MAX);
    await awardXp(
      client,
      store,
      message.guild,
      message.channel,
      userId,
      amount,
    ).catch(() => undefined);
  });

  // ----- ボタン操作（投票・募集） -----
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    try {
      if (interaction.customId.startsWith("poll:"))
        await handlePollButton(interaction, store);
      else if (interaction.customId.startsWith("recruit:"))
        await handleRecruitButton(interaction, store);
    } catch (error) {
      console.error("button interaction failed", error);
      if (!interaction.replied) {
        await interaction
          .reply({ content: "処理に失敗しました。", ephemeral: true })
          .catch(() => undefined);
      }
    }
  });
}
