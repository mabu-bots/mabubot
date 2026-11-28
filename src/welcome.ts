// ==========================================
// 👋 歓迎メッセージと自動ロール
// ==========================================
import {
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import type { MabusabaStore } from "./store.js";
import {
  EMBED_COLOR_ERROR,
  EMBED_COLOR_INFO,
  EMBED_COLOR_SUCCESS,
  buildEmbed,
  replyEmbed,
} from "./util.js";

// ------------------------------------------
// 👋 ウェルカムメッセージ
// ------------------------------------------
// 📝 テンプレートを実際の文言に展開する。使えるプレースホルダ:
// {user}（メンション）{server}（サーバー名）{count}（メンバー数）。
// テンプレート未設定・空白だけの場合は既定文を使う
export function renderWelcomeMessage(
  template: string | null,
  member: GuildMember,
): string {
  const text =
    template?.trim() ||
    "ようこそ {server} へ、{user} さん！ {count}人目のメンバーです 🎉";
  return text
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount));
}

// 📨 歓迎チャンネルが設定されていれば、参加時に歓迎メッセージを送る
export async function sendWelcome(
  member: GuildMember,
  store: MabusabaStore,
): Promise<void> {
  const welcome = store.getWelcome(member.guild.id);
  if (!welcome) return;
  const channel = await member.guild.channels
    .fetch(welcome.channel_id)
    .catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  if (!channel.isSendable()) return;
  const embed = buildEmbed(
    `👋 ようこそ、${member.user.username} さん！`,
    renderWelcomeMessage(welcome.message, member),
    EMBED_COLOR_INFO,
    [
      { name: "👤 ユーザー", value: `<@${member.id}>`, inline: true },
      {
        name: "📅 アカウント作成日",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
    ],
  );
  await channel.send({ embeds: [embed] }).catch(() => undefined);
}

// ------------------------------------------
// 🎭 自動ロール
// ------------------------------------------
// 📌 ギルドごとの自動ロールの上限（一覧が際限なく伸びないように）
export const MAX_AUTOROLES = 10;

// 🎭 参加時に自動ロールを付与する。失敗（権限不足・役職の階層）は
// ログに残すだけで投げない — ロールを付けられなかったことを理由に
// 参加処理自体を失敗させてはいけない。まず一括付与を試し、失敗
// したら1件ずつ再試行して、悪いロールが他を巻き込まないようにする
export async function applyAutorole(
  member: GuildMember,
  store: MabusabaStore,
): Promise<void> {
  const roleIds = store.getAutoroles(member.guild.id);
  if (!roleIds.length) return;
  try {
    await member.roles.add(roleIds);
    return;
  } catch {
    // 📌 ここへ来たら下の1件ずつの再試行に進む
  }
  for (const roleId of roleIds) {
    try {
      await member.roles.add(roleId);
    } catch (error) {
      console.error(
        `[mabusaba] autorole failed for ${member.id} in ${member.guild.id} (role ${roleId}):`,
        error,
      );
    }
  }
}

// ------------------------------------------
// ⌨️ コマンド処理（/welcome）
// ------------------------------------------
export async function handleWelcomeCommand(
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
  const sub = interaction.options.getSubcommand();
  if (sub === "show") {
    const welcome = store.getWelcome(guildId);
    if (!welcome) {
      await replyEmbed(
        interaction,
        "👋 歓迎メッセージ",
        "歓迎メッセージは設定されていません。`/welcome set` で設定してください。",
      );
      return;
    }
    await replyEmbed(
      interaction,
      "👋 歓迎メッセージ",
      `通知先：<#${welcome.channel_id}>\nメッセージ：${welcome.message ?? "（既定のメッセージ）"}\n\nプレースホルダ：{user}（メンション）{server}（サーバー名）{count}（メンバー数）`,
    );
    return;
  }
  if (sub === "disable") {
    store.deleteWelcome(guildId);
    await replyEmbed(
      interaction,
      "👋 歓迎メッセージを止めました",
      "参加時の歓迎メッセージを送信しなくなります。",
      EMBED_COLOR_SUCCESS,
    );
    return;
  }
  if (sub === "test") {
    const welcome = store.getWelcome(guildId);
    if (!welcome) {
      await replyEmbed(
        interaction,
        "⚠️ 未設定です",
        "まず `/welcome set` で通知先を設定してください。",
        EMBED_COLOR_ERROR,
      );
      return;
    }
    const member = interaction.member;
    if (!member || !("guild" in member)) {
      await replyEmbed(
        interaction,
        "⚠️ サーバー内で使用してください",
        "このコマンドはサーバー内で使用してください。",
        EMBED_COLOR_ERROR,
      );
      return;
    }
    await replyEmbed(
      interaction,
      "👋 歓迎メッセージのテスト",
      renderWelcomeMessage(welcome.message, member as GuildMember),
      EMBED_COLOR_INFO,
      false,
    );
    return;
  }
  // 📌 set — channel（必須）が message（任意）より前に来る
  const channel = interaction.options.getChannel("channel", true);
  // 📌 空白だけの文言は表示時に既定文になる。`show` で空白が表示
  // されないよう、未設定として保存する
  const message = interaction.options.getString("message")?.trim() || null;
  store.setWelcome(guildId, channel.id, message);
  await replyEmbed(
    interaction,
    "👋 歓迎メッセージを設定しました",
    `通知先：<#${channel.id}>\nメッセージ：${message ?? "（既定のメッセージ）"}`,
    EMBED_COLOR_SUCCESS,
  );
}

// ------------------------------------------
// ⌨️ コマンド処理（/autorole）
// ------------------------------------------
export async function handleAutoroleCommand(
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
  const sub = interaction.options.getSubcommand();
  if (sub === "show") {
    const roleIds = store.getAutoroles(guildId);
    await replyEmbed(
      interaction,
      "🎭 自動役職",
      roleIds.length
        ? `参加時に自動で付与する役職（${roleIds.length}件）：\n${roleIds.map((id) => `・<@&${id}>`).join("\n")}`
        : "自動役職は設定されていません。`/autorole set` で設定してください。",
    );
    return;
  }
  if (sub === "remove") {
    const role = interaction.options.getRole("role");
    if (role) {
      if (!store.removeAutorole(guildId, role.id)) {
        await replyEmbed(
          interaction,
          "⚠️ 設定されていません",
          `<@&${role.id}> は自動役職に設定されていません。`,
          EMBED_COLOR_ERROR,
        );
        return;
      }
      const remaining = store.getAutoroles(guildId);
      await replyEmbed(
        interaction,
        "🎭 自動役職を解除しました",
        `<@&${role.id}> の自動付与を止めました。${remaining.length ? `\n残り（${remaining.length}件）：\n${remaining.map((id) => `・<@&${id}>`).join("\n")}` : "\n自動役職はすべて解除されました。"}`,
        EMBED_COLOR_SUCCESS,
      );
      return;
    }
    store.deleteAutorole(guildId);
    await replyEmbed(
      interaction,
      "🎭 自動役職をすべて解除しました",
      "参加時の自動役職付与を止めます。",
      EMBED_COLOR_SUCCESS,
    );
    return;
  }
  // 📌 set — 追加式: 実行のたびに1件ずつ増え、既存の設定は消えない。
  // 複数の役職はコマンドを繰り返して設定する
  const role = interaction.options.getRole("role", true);
  // 📌 @everyone と連携サービス管理の役職はメンバーへ付与できない。
  // ここで受け付けても参加時に失敗するだけなので弾く
  if (role.id === guildId || role.managed) {
    await replyEmbed(
      interaction,
      "⚠️ その役職は付与できません",
      `<@&${role.id}> は自動付与できない役職です（@everyone・連携サービス管理の役職は付与できません）。`,
      EMBED_COLOR_ERROR,
    );
    return;
  }
  const current = store.getAutoroles(guildId);
  if (current.includes(role.id)) {
    await replyEmbed(
      interaction,
      "🎭 すでに設定されています",
      `<@&${role.id}> はすでに自動役職に設定されています。`,
      EMBED_COLOR_ERROR,
    );
    return;
  }
  if (current.length >= MAX_AUTOROLES) {
    await replyEmbed(
      interaction,
      "⚠️ 上限に達しました",
      `自動役職は最大 ${MAX_AUTOROLES}件までです。先に \`/autorole remove\` で減らしてください。`,
      EMBED_COLOR_ERROR,
    );
    return;
  }
  store.addAutorole(guildId, role.id);
  const roleIds = store.getAutoroles(guildId);
  await replyEmbed(
    interaction,
    "🎭 自動役職を設定しました",
    `参加時に <@&${role.id}> を自動で付与します。\n現在の自動役職（${roleIds.length}件）：\n${roleIds.map((id) => `・<@&${id}>`).join("\n")}`,
    EMBED_COLOR_SUCCESS,
  );
}
