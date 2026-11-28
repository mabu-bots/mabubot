// ==========================================
// 🎮 ミニゲーム（じゃんけん・コイン・スロット・数当て）
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
  randomInt,
  replyEmbed,
} from "./util.js";
import { awardXp } from "./level.js";

// ------------------------------------------
// 🔢 数当てゲーム
// ------------------------------------------
// 📌 数当てゲームはメモリだけに保持する（ギルド＋チャンネル＋
// ユーザーごと）。仕様どおり、再起動で進行中のゲームは終わる
interface NumberGame {
  answer: number;
  attempts: number;
  maxAttempts: number;
  startedAtMs: number;
}

const numberGames = new Map<string, NumberGame>();

// ⏱️ 開始したゲームの有効期限。期限が無いと、放置されたゲームが
// そのチャンネルでの新規開始を永久に塞ぎ（開始は「進行中です」と
// 言うだけ）、マップも増え続けた。startedAtMs は記録されていたが
// 使われていなかった
export const NUMBER_GAME_TTL_MS = 30 * 60_000;

// ⏰ ゲームが有効期限を過ぎているか
export function numberGameExpired(game: NumberGame, now = Date.now()): boolean {
  return now - game.startedAtMs > NUMBER_GAME_TTL_MS;
}

// ⏳ 数当て勝利の +30 XP にはユーザーごとの専用クールダウンがある:
// ヒント付きの二分探索なら数回で勝てるため、無ければ報酬を連続で
// 稼げてしまう。遊ぶこと（勝つこと）自体は妨げず、XP の付与だけを
// 止める。クールダウンはストアに持ち（kind は下記）、メッセージ XP
// のクールダウンとは分ける。対象範囲は XP と同じギルド＋ユーザー
//（チャンネルを変えてもリセットされない）
export const NUMBER_GAME_XP_COOLDOWN_MS = 10 * 60_000;
export const NUMBER_GAME_XP_COOLDOWN_KIND = "number_game_xp";

// ⏳ 数当て XP を再び付与できるまでの残りミリ秒（今すぐ付与できる場合は0）
export function numberGameXpCooldownRemainingMs(
  lastAwardedAtMs: number | null,
  now = Date.now(),
): number {
  if (lastAwardedAtMs === null) return 0;
  const remaining = NUMBER_GAME_XP_COOLDOWN_MS - (now - lastAwardedAtMs);
  return remaining > 0 ? remaining : 0;
}

// 🔍 キーに対応する進行中ゲームを返す。期限切れなら破棄して
//「無い」として返し、新しく始められるようにする
function takeActiveGame(key: string): NumberGame | undefined {
  const game = numberGames.get(key);
  if (game && numberGameExpired(game)) {
    numberGames.delete(key);
    return undefined;
  }
  return game;
}

// 🗝️ 数当てゲームの保持キー
function numberGameKey(
  guildId: string,
  channelId: string,
  userId: string,
): string {
  return `${guildId}:${channelId}:${userId}`;
}

// ------------------------------------------
// ✊ じゃんけん
// ------------------------------------------
const JANKEN = {
  goo: { label: "グー", emoji: "✊" },
  choki: { label: "チョキ", emoji: "✌️" },
  paa: { label: "パー", emoji: "🖐️" },
} as const;

type JankenChoice = keyof typeof JANKEN;

// ✊ 勝敗判定
function jankenWinner(
  user: JankenChoice,
  bot: JankenChoice,
): "win" | "lose" | "draw" {
  if (user === bot) return "draw";
  if (
    (user === "goo" && bot === "choki") ||
    (user === "choki" && bot === "paa") ||
    (user === "paa" && bot === "goo")
  ) {
    return "win";
  }
  return "lose";
}

// ------------------------------------------
// 🎰 スロット
// ------------------------------------------
const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "⭐", "🔔", "💎"];

// 🎰 1回分の抽選結果（3つ揃えば勝ち、💎 揃いはジャックポット）
function slotResult(): {
  symbols: [string, string, string];
  win: boolean;
  jackpot: boolean;
} {
  const pick = (): string =>
    SLOT_SYMBOLS[randomInt(0, SLOT_SYMBOLS.length - 1)]!;
  const symbols: [string, string, string] = [pick(), pick(), pick()];
  const win = symbols[0] === symbols[1] && symbols[1] === symbols[2];
  return { symbols, win, jackpot: win && symbols[0] === "💎" };
}

// ------------------------------------------
// ⌨️ コマンド処理（/game）
// ------------------------------------------
export async function handleGameCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  store: MabusabaStore,
): Promise<void> {
  const guildId = interaction.guildId;
  if (
    !guildId ||
    !interaction.guild ||
    !interaction.channel ||
    !("send" in interaction.channel)
  ) {
    await replyEmbed(
      interaction,
      "⚠️ サーバー内で使用してください",
      "このコマンドはサーバー内で使用してください。",
      EMBED_COLOR_ERROR,
    );
    return;
  }
  const guild = interaction.guild as Guild;
  const channel = interaction.channel as TextChannel;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  // 📌 勝利で +10 XP（数当ては正解で +30 XP、XP には10分の専用
  // クールダウンあり）。ゲーム XP はメッセージ XP のクールダウンを
  // リセットしてはいけない
  const grantWinXp = async (): Promise<void> => {
    await awardXp(client, store, guild, channel, interaction.user.id, 10, {
      touchCooldown: false,
    }).catch(() => undefined);
  };

  // ----- じゃんけん -----
  if (sub === "janken") {
    const choice = interaction.options.getString(
      "choice",
      true,
    ) as JankenChoice;
    const botChoice = (["goo", "choki", "paa"] as const)[randomInt(0, 2)]!;
    const result = jankenWinner(choice, botChoice);
    const text =
      result === "win"
        ? "🎉 あなたの勝ち！ +10 XP"
        : result === "lose"
          ? "😢 あなたの負け…"
          : "🤝 あいこ！";
    await replyEmbed(
      interaction,
      "✊✌️🖐️ じゃんけん",
      `あなた：${JANKEN[choice].emoji} ${JANKEN[choice].label}\nまぶさば：${JANKEN[botChoice].emoji} ${JANKEN[botChoice].label}\n\n${text}`,
      result === "win" ? EMBED_COLOR_SUCCESS : EMBED_COLOR_INFO,
      false,
    );
    if (result === "win") await grantWinXp();
    return;
  }

  // ----- コイントス -----
  if (sub === "coin") {
    const heads = Math.random() < 0.5;
    await replyEmbed(
      interaction,
      "🪙 コイントス",
      heads ? "🪙 **表** が出ました！" : "🪙 **裏** が出ました！",
      EMBED_COLOR_INFO,
      false,
    );
    return;
  }

  // ----- スロット -----
  if (sub === "slot") {
    const { symbols, win, jackpot } = slotResult();
    const line = symbols.join(" | ");
    await replyEmbed(
      interaction,
      "🎰 スロット",
      `${line}\n\n${jackpot ? "💎💎💎 ジャックポット！ +10 XP" : win ? "🎉 そろった！ +10 XP" : "😢 はずれ…もう一度挑戦してみてね"}`,
      win ? EMBED_COLOR_SUCCESS : EMBED_COLOR_INFO,
      false,
    );
    if (win) await grantWinXp();
    return;
  }

  // ----- 数当てゲーム -----
  if (group === "number") {
    // 📌 /game number はサブコマンドグループ: start / guess
    const leaf = interaction.options.getSubcommand(true);
    const key = numberGameKey(
      guildId,
      interaction.channelId,
      interaction.user.id,
    );
    if (leaf === "start") {
      const existing = takeActiveGame(key);
      if (existing) {
        await replyEmbed(
          interaction,
          "🔢 数当てゲーム",
          `すでに進行中のゲームがあります。残り ${existing.maxAttempts - existing.attempts} 回です。\n\`/game number guess\` で数字を当ててみてください。`,
        );
        return;
      }
      numberGames.set(key, {
        answer: randomInt(1, 100),
        attempts: 0,
        maxAttempts: 10,
        startedAtMs: Date.now(),
      });
      await replyEmbed(
        interaction,
        "🔢 数当てゲーム開始！",
        "1〜100の数字を当ててください。10回まで挑戦できます（開始から30分で時間切れになります）。\n`/game number guess number:<数字>` で回答してください。",
        EMBED_COLOR_INFO,
        false,
      );
      return;
    }
    // 📌 guess — number（必須）
    const guess = interaction.options.getInteger("number", true);
    const game = takeActiveGame(key);
    if (!game) {
      await replyEmbed(
        interaction,
        "⚠️ ゲームが始まっていません",
        "まず `/game number start` でゲームを始めてください（開始から30分経ったゲームは時間切れで終了します）。",
        EMBED_COLOR_ERROR,
      );
      return;
    }
    game.attempts++;
    const left = game.maxAttempts - game.attempts;
    if (guess === game.answer) {
      numberGames.delete(key);
      const xpRemainingMs = numberGameXpCooldownRemainingMs(
        store.getCooldownLastAt(
          guildId,
          interaction.user.id,
          NUMBER_GAME_XP_COOLDOWN_KIND,
        ),
      );
      if (xpRemainingMs > 0) {
        // 📌 クールダウン中: 勝ちは成立するが XP は付与されない
        const minutes = Math.ceil(xpRemainingMs / 60_000);
        await replyEmbed(
          interaction,
          "🎉 正解！",
          `正解は **${game.answer}** でした！ ${game.attempts}回目で当てました。\n⏳ 数当てゲームのXPはクールダウン中（あと約${minutes}分）のため、今回はXPは付与されませんでした。`,
          EMBED_COLOR_SUCCESS,
          false,
        );
        return;
      }
      await replyEmbed(
        interaction,
        "🎉 正解！",
        `正解は **${game.answer}** でした！ ${game.attempts}回目で当てました。\n+30 XP を獲得しました！`,
        EMBED_COLOR_SUCCESS,
        false,
      );
      store.recordCooldown(
        guildId,
        interaction.user.id,
        NUMBER_GAME_XP_COOLDOWN_KIND,
      );
      await awardXp(client, store, guild, channel, interaction.user.id, 30, {
        touchCooldown: false,
      }).catch(() => undefined);
      return;
    }
    if (left <= 0) {
      numberGames.delete(key);
      await replyEmbed(
        interaction,
        "😢 ゲームオーバー",
        `10回使い切りました…。正解は **${game.answer}** でした。\n\`/game number start\` でもう一度挑戦できます。`,
        EMBED_COLOR_ERROR,
        false,
      );
      return;
    }
    const hint =
      guess < game.answer
        ? "もっと **大きい** 数字です ⬆️"
        : "もっと **小さい** 数字です ⬇️";
    await replyEmbed(
      interaction,
      "🔢 数当てゲーム",
      `${guess} は違います。${hint}\n残り ${left} 回です。`,
      EMBED_COLOR_INFO,
      false,
    );
    return;
  }

  await replyEmbed(
    interaction,
    "⚠️ 不明なゲームです",
    "不明なゲームです。",
    EMBED_COLOR_ERROR,
  );
}

// ------------------------------------------
// 🧪 テスト用エクスポート
// ------------------------------------------
// 📌 テスト用に公開する純粋ロジック（Discord 不要）
export { jankenWinner, slotResult };
