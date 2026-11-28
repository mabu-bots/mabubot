// ==========================================
// ⌨️ スラッシュコマンド定義と振り分け
// ==========================================
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import type { MabusabaStore } from "./store.js";
import {
  EMBED_COLOR_ERROR,
  EMBED_COLOR_INFO,
  EMBED_COLOR_SUCCESS,
  replyEmbed,
} from "./util.js";
import { handleAutoroleCommand, handleWelcomeCommand } from "./welcome.js";
import {
  handleLeaderboardCommand,
  handleLevelCommand,
  handleRankCommand,
} from "./level.js";
import { handleGameCommand } from "./games.js";
import { handleModCommand } from "./mod.js";
import { handlePollCommand } from "./poll.js";
import { handleRecruitCommand } from "./recruit.js";
import { handleTimerCommand } from "./timer.js";
import { handleWatchingCommand } from "./watching.js";

// ------------------------------------------
// 📋 コマンド定義
// ------------------------------------------
// 📌 すべてのコマンド定義はここに置き、sync-commands.ts が Bot 本体と
// 同じ一覧を取り込めるようにする。必須オプションは常に対象より前に
// 置く（Discord は必須が任意の後にあると 50035 で弾く）

// ----- 歓迎・自動ロール -----
export const welcomeCommand = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("参加時の歓迎メッセージを設定します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("歓迎メッセージの通知先と文言を設定します")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("通知先チャンネル")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription(
            "文言（{user} {server} {count} が使えます。未指定なら既定の文言）",
          )
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("現在の歓迎メッセージ設定を表示します"),
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("歓迎メッセージを止めます"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("test")
      .setDescription(
        "歓迎メッセージの見た目を確認します（チャンネル全員に見えます）",
      ),
  );

export const autoroleCommand = new SlashCommandBuilder()
  .setName("autorole")
  .setDescription("参加時に自動で付与する役職を設定します（複数可）")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription(
        "参加時に自動で付与する役職を追加します（繰り返し実行で複数設定可）",
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("付与する役職").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription(
        "自動役職を解除します（役職を指定するとその1件だけ、未指定なら全て解除）",
      )
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription("解除する役職（未指定なら全て解除）"),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("現在の自動役職を表示します"),
  );

// ----- レベル・ランク -----
export const rankCommand = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("自分の（または指定した人の）レベルとXPを表示します")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("確認するユーザー（未指定なら自分）"),
  );

export const leaderboardCommand = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("レベルランキング上位10人を表示します");

export const levelCommand = new SlashCommandBuilder()
  .setName("level")
  .setDescription("レベル報酬ロールを設定します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommandGroup((group) =>
    group
      .setName("reward")
      .setDescription("レベル到達時の報酬ロール")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("レベル報酬ロールを追加します")
          .addIntegerOption((opt) =>
            opt
              .setName("level")
              .setDescription("報酬をもらえるレベル")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100),
          )
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("付与する役職")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("レベル報酬ロールの一覧を表示します"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("レベル報酬ロールを削除します")
          .addIntegerOption((opt) =>
            opt
              .setName("level")
              .setDescription("削除するレベル")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100),
          ),
      ),
  );

// ----- ゲーム -----
export const gameCommand = new SlashCommandBuilder()
  .setName("game")
  .setDescription("ミニゲームで遊びます（勝利でXPがもらえます）")
  .addSubcommand((sub) =>
    sub
      .setName("janken")
      .setDescription("じゃんけんをします（勝利で +10 XP）")
      .addStringOption((opt) =>
        opt
          .setName("choice")
          .setDescription("出す手")
          .setRequired(true)
          .addChoices(
            { name: "グー", value: "goo" },
            { name: "チョキ", value: "choki" },
            { name: "パー", value: "paa" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("coin").setDescription("コイントスをします"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("slot")
      .setDescription("スロットを回します（そろったら +10 XP）"),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("number")
      .setDescription("数当てゲーム（1〜100、10回まで。正解で +30 XP）")
      .addSubcommand((sub) =>
        sub.setName("start").setDescription("数当てゲームを始めます"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("guess")
          .setDescription("数字を当てます")
          .addIntegerOption((opt) =>
            opt
              .setName("number")
              .setDescription("予想する数字（1〜100）")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100),
          ),
      ),
  );

// ----- モデレーション -----
export const modCommand = new SlashCommandBuilder()
  .setName("mod")
  .setDescription("モデレーション（警告・タイムアウト・キック・BAN・削除）")
  // 📌 コマンド全体の default_member_permissions は付けない:
  // サブコマンドごとに必要な権限が違い（warn・timeout はメンバーを
  // モデレート、kick はキック、ban・unban はBAN、clear・log は
  // サーバーの管理）、どれか1つで全体を塞ぐと、その権限だけを持つ
  // モデレーターから /mod が見えなくなる。各サブコマンドは実行時に
  // 自分の権限を確認する（mod.ts）
  .addSubcommandGroup((group) =>
    group
      .setName("warn")
      .setDescription("警告の追加・確認")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("ユーザーに警告を追加します")
          .addUserOption((opt) =>
            opt
              .setName("user")
              .setDescription("警告するユーザー")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName("reason").setDescription("理由").setMaxLength(500),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("ユーザーの警告履歴を表示します")
          .addUserOption((opt) =>
            opt
              .setName("user")
              .setDescription("確認するユーザー")
              .setRequired(true),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("timeout")
      .setDescription("ユーザーをタイムアウトします（最大28日）")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("対象ユーザー").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("duration")
          .setDescription("期間（例：10m / 1h / 1d / 30分）")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("理由").setMaxLength(500),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("untimeout")
      .setDescription("ユーザーのタイムアウトを解除します")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("対象ユーザー").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("kick")
      .setDescription("ユーザーをキックします")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("対象ユーザー").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("理由").setMaxLength(500),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("ban")
      .setDescription("ユーザーをBANします")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("対象ユーザー").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("delete-days")
          .setDescription("削除する過去のメッセージ日数（0〜7）")
          .setMinValue(0)
          .setMaxValue(7),
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("理由").setMaxLength(500),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("unban")
      .setDescription("ユーザーのBANを解除します")
      .addStringOption((opt) =>
        opt
          .setName("user-id")
          .setDescription("BAN解除するユーザーのID")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("clear")
      .setDescription("メッセージを一括削除します")
      .addIntegerOption((opt) =>
        opt
          .setName("count")
          .setDescription("削除する件数（1〜100）")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("log")
      .setDescription("モデレーションログの通知先")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("モデレーションログの通知先を設定します")
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("通知先チャンネル")
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("disable").setDescription("モデレーションログを止めます"),
      ),
  );

// ----- 投票 -----
export const pollCommand = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("投票を作成します")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("投票を作成します（ボタンで投票・1人1票・変更可）")
      .addStringOption((opt) =>
        opt
          .setName("question")
          .setDescription("質問")
          .setRequired(true)
          .setMaxLength(200),
      )
      .addStringOption((opt) =>
        opt
          .setName("option1")
          .setDescription("選択肢1")
          .setRequired(true)
          .setMaxLength(80),
      )
      .addStringOption((opt) =>
        opt
          .setName("option2")
          .setDescription("選択肢2")
          .setRequired(true)
          .setMaxLength(80),
      )
      .addStringOption((opt) =>
        opt.setName("option3").setDescription("選択肢3").setMaxLength(80),
      )
      .addStringOption((opt) =>
        opt.setName("option4").setDescription("選択肢4").setMaxLength(80),
      )
      .addStringOption((opt) =>
        opt.setName("option5").setDescription("選択肢5").setMaxLength(80),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("duration")
          .setDescription("投票期間（分、1〜1440。未指定なら60分）")
          .setMinValue(1)
          .setMaxValue(1440),
      ),
  );

// ----- 募集 -----
export const recruitCommand = new SlashCommandBuilder()
  .setName("recruit")
  .setDescription("募集を作成します")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("募集を作成します（参加/不参加ボタン付き）")
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setDescription("募集のタイトル")
          .setRequired(true)
          .setMaxLength(100),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("members")
          .setDescription("定員（2〜20人）")
          .setRequired(true)
          .setMinValue(2)
          .setMaxValue(20),
      )
      .addStringOption((opt) =>
        opt
          .setName("time")
          .setDescription("開始時刻（例：21:00 / 30分後 / 2026-11-14 21:00）")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("説明").setMaxLength(1000),
      ),
  );

// ----- タイマー -----
export const timerCommand = new SlashCommandBuilder()
  .setName("timer")
  .setDescription("タイマー（リマインダー）を設定します")
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("タイマーを設定します")
      .addIntegerOption((opt) =>
        opt
          .setName("minutes")
          .setDescription("何分後か（1〜1440）")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(1440),
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("鳴ったときに表示する内容")
          .setRequired(true)
          .setMaxLength(500),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("設定中のタイマーを一覧表示します"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("タイマーをキャンセルします")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("タイマーのID（/timer list で確認）")
          .setRequired(true),
      ),
  );

// ----- ステータス表示 -----
export const watchingCommand = new SlashCommandBuilder()
  .setName("watching")
  .setDescription("視聴中ステータス（○○を視聴中）を設定します")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("視聴中ステータスの文言を設定します（Bot全体に適用）")
      .addStringOption((opt) =>
        opt
          .setName("text")
          .setDescription("表示する文言（例：まぶさばを見守り中）")
          .setRequired(true)
          .setMaxLength(128),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("現在の視聴中ステータスを表示します"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("reset")
      .setDescription("視聴中ステータスを既定（まぶさばを見守り中）に戻します"),
  );

// ----- その他 -----
export const pingCommand = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("まぶさばボットの応答状態を確認します");

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("まぶさばボットのコマンド一覧を表示します");

// ------------------------------------------
// 📋 コマンド一覧とヘルプ文
// ------------------------------------------
// 📌 同期対象の全コマンド（13件）
export const allCommands = [
  welcomeCommand,
  autoroleCommand,
  rankCommand,
  leaderboardCommand,
  levelCommand,
  gameCommand,
  modCommand,
  pollCommand,
  recruitCommand,
  timerCommand,
  watchingCommand,
  pingCommand,
  helpCommand,
];

// 📖 /help の本文
const HELP_TEXT = [
  "**👋 歓迎・自動役職**（管理者）\n`/welcome set` `/welcome show` `/welcome disable` `/welcome test` ／ `/autorole set` `/autorole remove` `/autorole show`",
  "**📊 レベル・経験値**\n`/rank [user]` `/leaderboard` ／ `/level reward add|list|remove`（管理者）\nメッセージを送るとXP（15〜25、60秒クールダウン）がもらえます。",
  "**🎮 ミニゲーム**\n`/game janken` `/game coin` `/game slot` `/game number start|guess`\nじゃんけん・スロットの勝利で +10 XP、数当ての正解で +30 XP。",
  "**🛡️ モデレーション**\n`/mod warn add|list` `/mod timeout` `/mod untimeout` `/mod kick` `/mod ban` `/mod unban` `/mod clear` `/mod log set|disable`\n短時間の連投・同一内容の連投は自動で10分タイムアウトします。",
  "**📊 投票・募集・タイマー**\n`/poll create` ／ `/recruit create` ／ `/timer set|list|cancel`",
  "**⚙️ その他**\n`/watching set|show|reset`（管理者） ／ `/ping`",
].join("\n\n");

// ------------------------------------------
// ⌨️ コマンド処理
// ------------------------------------------
// 📖 /help: コマンド一覧（公開表示）
export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await replyEmbed(
    interaction,
    "✨ まぶさばボットのコマンド一覧",
    HELP_TEXT,
    EMBED_COLOR_INFO,
    false,
  );
}

// 🏓 /ping: 応答確認
export async function handlePingCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  await replyEmbed(
    interaction,
    "🏓 Pong!",
    `まぶさばボットは正常に稼働しています。（ping: ${client.ws.ping}ms）`,
    EMBED_COLOR_SUCCESS,
  );
}

// 🔀 コマンド名から各ハンドラへ振り分ける
export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  store: MabusabaStore,
): Promise<void> {
  switch (interaction.commandName) {
    case "welcome":
      await handleWelcomeCommand(interaction, store);
      break;
    case "autorole":
      await handleAutoroleCommand(interaction, store);
      break;
    case "rank":
      await handleRankCommand(interaction, store);
      break;
    case "leaderboard":
      await handleLeaderboardCommand(interaction, store);
      break;
    case "level":
      await handleLevelCommand(interaction, store);
      break;
    case "game":
      await handleGameCommand(interaction, client, store);
      break;
    case "mod":
      await handleModCommand(interaction, client, store);
      break;
    case "poll":
      await handlePollCommand(interaction, client, store);
      break;
    case "recruit":
      await handleRecruitCommand(interaction, client, store);
      break;
    case "timer":
      await handleTimerCommand(interaction, client, store);
      break;
    case "watching":
      await handleWatchingCommand(interaction, client, store);
      break;
    case "ping":
      await handlePingCommand(interaction, client);
      break;
    case "help":
      await handleHelpCommand(interaction);
      break;
    default:
      await replyEmbed(
        interaction,
        "⚠️ 不明なコマンドです",
        "不明なコマンドです。",
        EMBED_COLOR_ERROR,
      );
  }
}
