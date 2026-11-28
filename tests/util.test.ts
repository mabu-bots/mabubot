// ==========================================
// 🧪 テスト: ユーティリティ（XP計算・期間/時刻パース・ゲーム）
// ==========================================
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateId,
  joinLinesWithinLimit,
  levelFromTotalXp,
  parseDurationMs,
  parseTimeInput,
  totalXpForLevel,
  xpForLevel,
} from "../src/util.js";
import {
  jankenWinner,
  numberGameExpired,
  numberGameXpCooldownRemainingMs,
  NUMBER_GAME_TTL_MS,
  NUMBER_GAME_XP_COOLDOWN_MS,
} from "../src/games.js";

// 📌 固定の「現在」: 2026-11-14 12:00 JST = 03:00 UTC
const NOW = Date.UTC(2026, 10, 14, 3, 0, 0);
const jst = (h: number, m = 0, day = 14): number =>
  Date.UTC(2026, 10, day, h - 9, m, 0);

// ------------------------------------------
// 📊 XP・レベル
// ------------------------------------------
describe("XP / levels", () => {
  it("xpForLevel matches 5n^2 + 50n + 100", () => {
    assert.equal(xpForLevel(0), 100);
    assert.equal(xpForLevel(1), 155);
    assert.equal(xpForLevel(2), 220);
    assert.equal(xpForLevel(5), 475);
  });

  it("totalXpForLevel accumulates per-level XP", () => {
    assert.equal(totalXpForLevel(0), 0);
    assert.equal(totalXpForLevel(1), 100);
    assert.equal(totalXpForLevel(2), 255);
    assert.equal(totalXpForLevel(3), 475);
  });

  it("totalXpForLevel closed form matches the naive sum", () => {
    let expected = 0;
    for (let level = 0; level <= 60; level++) {
      assert.equal(totalXpForLevel(level), expected);
      expected += xpForLevel(level);
    }
  });

  it("levelFromTotalXp finds the level at boundaries", () => {
    assert.deepEqual(levelFromTotalXp(0), {
      level: 0,
      xpIntoLevel: 0,
      xpNeededForNext: 100,
    });
    assert.deepEqual(levelFromTotalXp(99), {
      level: 0,
      xpIntoLevel: 99,
      xpNeededForNext: 100,
    });
    assert.deepEqual(levelFromTotalXp(100), {
      level: 1,
      xpIntoLevel: 0,
      xpNeededForNext: 155,
    });
    assert.deepEqual(levelFromTotalXp(254), {
      level: 1,
      xpIntoLevel: 154,
      xpNeededForNext: 155,
    });
    assert.deepEqual(levelFromTotalXp(255), {
      level: 2,
      xpIntoLevel: 0,
      xpNeededForNext: 220,
    });
    assert.deepEqual(levelFromTotalXp(1000), {
      level: 4,
      xpIntoLevel: 230,
      xpNeededForNext: 380,
    });
  });
});

// ------------------------------------------
// ⏳ parseDurationMs
// ------------------------------------------
describe("parseDurationMs", () => {
  it("parses English and Japanese units", () => {
    assert.equal(parseDurationMs("10m"), 600_000);
    assert.equal(parseDurationMs("1h"), 3_600_000);
    assert.equal(parseDurationMs("1d"), 86_400_000);
    assert.equal(parseDurationMs("30s"), 30_000);
    assert.equal(parseDurationMs("30分"), 1_800_000);
    assert.equal(parseDurationMs("2時間"), 7_200_000);
    assert.equal(parseDurationMs("3日"), 259_200_000);
  });

  it("parses combinations", () => {
    assert.equal(parseDurationMs("1時間30分"), 5_400_000);
    assert.equal(parseDurationMs("1d12h"), 129_600_000);
    assert.equal(parseDurationMs("90分"), 5_400_000);
  });

  it("rejects unusable input", () => {
    assert.equal(parseDurationMs("abc"), null);
    assert.equal(parseDurationMs("0m"), null);
    assert.equal(parseDurationMs(""), null);
    assert.equal(parseDurationMs("10x"), null);
  });
});

// ------------------------------------------
// 📅 parseTimeInput
// ------------------------------------------
describe("parseTimeInput (future, JST)", () => {
  it("parses relative future times", () => {
    assert.equal(parseTimeInput("30分後", NOW), NOW + 1_800_000);
    assert.equal(parseTimeInput("2時間後", NOW), NOW + 7_200_000);
    assert.equal(parseTimeInput("1時間30分後", NOW), NOW + 5_400_000);
  });

  it("parses weeks in relative future times", () => {
    assert.equal(parseTimeInput("1週間後", NOW), NOW + 7 * 86_400_000);
    assert.equal(parseTimeInput("2週後", NOW), NOW + 14 * 86_400_000);
    assert.equal(parseTimeInput("1週間2日後", NOW), NOW + 9 * 86_400_000);
  });

  it("rejects relative times with stray text", () => {
    assert.equal(parseTimeInput("abc30分後", NOW), null);
    assert.equal(parseTimeInput("30分xyz後", NOW), null);
    assert.equal(parseTimeInput("30分30分後", NOW), null);
  });

  it("parses clock times today, or tomorrow when past", () => {
    assert.equal(parseTimeInput("21:00", NOW), jst(21));
    assert.equal(parseTimeInput("10:00", NOW), jst(10, 0, 15));
  });

  it("parses a full-width colon in clock times", () => {
    assert.equal(parseTimeInput("21：00", NOW), jst(21));
  });

  it("parses dated times", () => {
    assert.equal(parseTimeInput("2026-11-14 21:00", NOW), jst(21));
    assert.equal(parseTimeInput("11-14 21:00", NOW), jst(21));
  });

  it("rolls a past month/day to next year", () => {
    assert.equal(
      parseTimeInput("11-13 21:00", NOW),
      Date.UTC(2027, 10, 13, 12, 0, 0),
    );
    assert.equal(
      parseTimeInput("1-1 10:00", NOW),
      Date.UTC(2027, 0, 1, 1, 0, 0),
    );
  });

  it("rejects past times and garbage", () => {
    assert.equal(parseTimeInput("2026-11-13 21:00", NOW), null);
    assert.equal(parseTimeInput("あした", NOW), null);
    assert.equal(parseTimeInput("", NOW), null);
  });
});

// ------------------------------------------
// 🆔 generateId
// ------------------------------------------
describe("generateId", () => {
  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    assert.equal(ids.size, 1000);
  });
});

// ------------------------------------------
// 📝 joinLinesWithinLimit
// ------------------------------------------
describe("joinLinesWithinLimit", () => {
  it("keeps short lists intact and truncates long ones", () => {
    assert.deepEqual(joinLinesWithinLimit(["a", "b"], 100), {
      text: "a\nb",
      omitted: 0,
    });
    const lines = Array.from({ length: 10 }, () => "x".repeat(100));
    const { text, omitted } = joinLinesWithinLimit(lines, 350);
    assert.ok(text.length <= 350);
    assert.ok(omitted > 0);
  });
});

// ------------------------------------------
// 🔢 数当てゲームの有効期限
// ------------------------------------------
describe("number game expiry", () => {
  it("expires games older than the TTL", () => {
    const game = { answer: 42, attempts: 0, maxAttempts: 10, startedAtMs: NOW };
    assert.equal(numberGameExpired(game, NOW + NUMBER_GAME_TTL_MS - 1), false);
    assert.equal(numberGameExpired(game, NOW + NUMBER_GAME_TTL_MS + 1), true);
  });
});

// ------------------------------------------
// ✊ じゃんけん
// ------------------------------------------
describe("janken", () => {
  it("goo beats choki, loses to paa, draws itself", () => {
    assert.equal(jankenWinner("goo", "choki"), "win");
    assert.equal(jankenWinner("goo", "paa"), "lose");
    assert.equal(jankenWinner("goo", "goo"), "draw");
    assert.equal(jankenWinner("choki", "paa"), "win");
    assert.equal(jankenWinner("paa", "goo"), "win");
  });
});

// ------------------------------------------
// ⏳ 数当てゲームXPのクールダウン（純粋関数分）
// ------------------------------------------
describe("number game XP cooldown", () => {
  it("is 10 minutes and available when never awarded", () => {
    assert.equal(NUMBER_GAME_XP_COOLDOWN_MS, 10 * 60_000);
    assert.equal(numberGameXpCooldownRemainingMs(null, NOW), 0);
  });

  it("blocks re-award until 10 minutes have passed", () => {
    // 📌 付与直後: クールダウン全量が残る
    assert.equal(
      numberGameXpCooldownRemainingMs(NOW, NOW),
      NUMBER_GAME_XP_COOLDOWN_MS,
    );
    // 📌 4分後: 6分残る
    assert.equal(
      numberGameXpCooldownRemainingMs(NOW, NOW + 4 * 60_000),
      6 * 60_000,
    );
    // 📌 ちょうど境界と、その先: 再び付与できる
    assert.equal(
      numberGameXpCooldownRemainingMs(NOW, NOW + NUMBER_GAME_XP_COOLDOWN_MS),
      0,
    );
    assert.equal(
      numberGameXpCooldownRemainingMs(
        NOW,
        NOW + NUMBER_GAME_XP_COOLDOWN_MS + 1,
      ),
      0,
    );
  });
});
