// ==========================================
// 🚀 mabubot エントリポイント
// ==========================================
import { Client, EmbedBuilder, GatewayIntentBits, Partials } from "discord.js";
import { MabusabaStore } from "./store.js";
import { handleChatInputCommand } from "./commands.js";
import { registerEvents } from "./events.js";
import { applyWatching } from "./watching.js";
import { reschedulePolls } from "./poll.js";
import { rescheduleRecruits } from "./recruit.js";
import { rescheduleTimers } from "./timer.js";
import { EMBED_COLOR_ERROR, EMBED_FOOTER } from "./util.js";
import { attachReadyWatchdog } from "./watchdog.js";

// ------------------------------------------
// ⚙️ 初期化
// ------------------------------------------
const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error(
    "DISCORD_TOKEN is required. Copy .env.example to .env and set it.",
  );
  process.exit(1);
}
const dataDir = process.env.DATA_DIR?.trim() || "./data";
const store = new MabusabaStore(dataDir);

// 📌 Partials: キャッシュに無いオブジェクトでもイベントが内容や
// 投稿者を運んでくるようにするために必要
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // 🔐 特権: 参加・自動ロールに必要
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 🔐 特権: XP・荒らし対策にメッセージ内容が必要
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration, // 🛡️ BAN・BAN解除に必要
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
  ],
});

// 🛡️ Gateway 安全構造: READY が来ないサイレント停滞を検知して
// プロセスを終了する（watchdog.ts）
attachReadyWatchdog(client);

// ------------------------------------------
// 🚀 起動時の処理
// ------------------------------------------
client.once("ready", () => {
  console.log(`Logged in as ${client.user?.tag}`);
  // 👀 プレゼンス・サイクルを開始する
  applyWatching(client, store);
  // 🔄 SQLite に残っている投票・募集・タイマーを再スケジュールし、
  // 再起動で失われないようにする（期限切れのものは即座に締切・発火）
  reschedulePolls(client, store);
  rescheduleRecruits(client, store);
  rescheduleTimers(client, store);
  // 📌 コマンド同期はここでは行わない。グローバルコマンドの上書き
  // 同期は `npm run sync:commands` だけが行う（sync-commands.ts）。
  // 起動時に同期すると、同期で消したコマンドが復活してしまう
});

// ------------------------------------------
// ⌨️ コマンド実行時の処理
// ------------------------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleChatInputCommand(interaction, client, store);
  } catch (error) {
    console.error("interaction failed", error);
    // 📌 reply() は未処理のインタラクションにしか使えない: ハンドラが
    // 応答済み・defer 済みの場合は followUp でないと例外になり、
    // ユーザーには何も見えなくなる
    const embed = new EmbedBuilder()
      .setTitle("⚠️ 処理に失敗しました")
      .setDescription("処理に失敗しました。")
      .setColor(EMBED_COLOR_ERROR)
      .setFooter({ text: EMBED_FOOTER })
      .setTimestamp(new Date());
    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({ embeds: [embed], ephemeral: true })
        .catch(() => undefined);
    } else {
      await interaction
        .reply({ embeds: [embed], ephemeral: true })
        .catch(() => undefined);
    }
  }
});

// ------------------------------------------
// 🔌 イベント登録と終了処理
// ------------------------------------------
registerEvents(client, store);

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  store.close();
  process.exit(0);
});

await client.login(token);
