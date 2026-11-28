// ==========================================
// 🧪 テスト: SQLite ストア
// ==========================================
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MabusabaStore } from "../src/store.js";
import { levelFromTotalXp } from "../src/util.js";
import { NUMBER_GAME_XP_COOLDOWN_KIND } from "../src/games.js";

// 📌 固定の「現在」: 2026-11-14 12:00 JST = 03:00 UTC
const NOW = Date.UTC(2026, 10, 14, 3, 0, 0);

// 🗄️ 一時ディレクトリにストアを開く（テストごとに使い捨て）
function openStore(): { store: MabusabaStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "mabubot-test-"));
  return { store: new MabusabaStore(dir), dir };
}

// ------------------------------------------
// 🔁 往復保存（welcome・XP・警告・投票・タイマー）
// ------------------------------------------
describe("store (SQLite)", () => {
  it("welcome, XP, warns, polls and timers round-trip", () => {
    const { store } = openStore();
    try {
      store.setWelcome("g1", "c1", "ようこそ {user} さん");
      assert.equal(store.getWelcome("g1")?.channel_id, "c1");
      store.deleteWelcome("g1");
      assert.equal(store.getWelcome("g1"), null);

      const { after } = store.addXp("g1", "u1", 120);
      assert.equal(after.xp, 120);
      assert.deepEqual(levelFromTotalXp(after.xp).level, 1);
      store.setLevel("g1", "u1", 1);
      assert.equal(store.getXp("g1", "u1")?.level, 1);
      assert.equal(store.topXp("g1", 10)[0]?.user_id, "u1");

      const warnId = store.addWarn("g1", "u1", "mod1", "連投");
      assert.equal(store.listWarns("g1", "u1").length, 1);
      assert.equal(store.listWarns("g1", "u1")[0]?.id, warnId);
      assert.equal(store.countWarns("g1", "u1"), 1);

      store.createPoll({
        id: "p1",
        guild_id: "g1",
        channel_id: "c1",
        message_id: "m1",
        question: "好きなのは？",
        options: ["A", "B"],
        ends_at_ms: NOW + 60000,
        created_by: "u1",
      });
      store.setPollVote("p1", "u1", 0);
      store.setPollVote("p1", "u2", 1);
      store.setPollVote("p1", "u1", 1); // 📌 投票変更
      assert.deepEqual(store.pollVoteCounts("p1", 2), [0, 2]);
      assert.equal(store.pollTotalVotes("p1"), 2);

      store.createTimer({
        id: "t1",
        guild_id: "g1",
        channel_id: "c1",
        user_id: "u1",
        message: "テスト",
        fires_at_ms: NOW + 60000,
        created_at_ms: NOW,
      });
      assert.equal(store.listTimers("g1").length, 1);
      store.deleteTimer("t1");
      assert.equal(store.listTimers("g1").length, 0);
    } finally {
      store.close();
    }
  });

  it("xpRank is null for a user with no XP record", () => {
    const { store } = openStore();
    try {
      store.addXp("g1", "alice", 500);
      store.addXp("g1", "bob", 100);
      // 📌 回帰: 未ランクのユーザーが1位と報告されていた問題
      assert.equal(store.xpRank("g1", "carol"), null);
      assert.equal(store.xpRank("g1", "alice"), 1);
      assert.equal(store.xpRank("g1", "bob"), 2);
    } finally {
      store.close();
    }
  });

  it("addXp keeps the stored level in sync with the XP total", () => {
    const { store } = openStore();
    try {
      const { after } = store.addXp("g1", "u1", 120);
      assert.equal(after.level, 1);
      assert.equal(store.getXp("g1", "u1")?.level, 1);
    } finally {
      store.close();
    }
  });

  it("addXp with touchCooldown:false leaves the message-XP cooldown alone", () => {
    const { store } = openStore();
    try {
      store.addXp("g1", "u1", 20, { now: 1_000_000 });
      assert.equal(store.getXp("g1", "u1")?.last_xp_at_ms, 1_000_000);
      // 📌 後からのゲーム報酬がクールダウンを動かしてはいけない
      store.addXp("g1", "u1", 10, { now: 2_000_000, touchCooldown: false });
      assert.equal(store.getXp("g1", "u1")?.last_xp_at_ms, 1_000_000);
      assert.equal(store.getXp("g1", "u1")?.xp, 30);
    } finally {
      store.close();
    }
  });
});

// ------------------------------------------
// 🎭 自動ロール（複数対応）
// ------------------------------------------
describe("autoroles (multi-role)", () => {
  it("adds, lists and removes roles per guild", () => {
    const { store } = openStore();
    try {
      assert.deepEqual(store.getAutoroles("g1"), []);
      assert.equal(store.addAutorole("g1", "r1"), true);
      assert.equal(store.addAutorole("g1", "r2"), true);
      // 📌 重複追加は false で、件数は増えない
      assert.equal(store.addAutorole("g1", "r1"), false);
      assert.deepEqual([...store.getAutoroles("g1")].sort(), ["r1", "r2"]);
      // 📌 他ギルドには影響しない
      assert.deepEqual(store.getAutoroles("g2"), []);
      assert.equal(store.removeAutorole("g1", "r1"), true);
      assert.equal(store.removeAutorole("g1", "r1"), false);
      assert.deepEqual(store.getAutoroles("g1"), ["r2"]);
      store.deleteAutorole("g1");
      assert.deepEqual(store.getAutoroles("g1"), []);
    } finally {
      store.close();
    }
  });

  it("migrates the old single-role autorole table, keeping its rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "mabubot-test-"));
    // 📌 旧形式（主キーが guild_id のみ）のテーブルとデータを作る
    const raw = new DatabaseSync(join(dir, "mabusaba.db"));
    raw.exec(`
      CREATE TABLE autorole (
        guild_id TEXT PRIMARY KEY,
        role_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO autorole (guild_id, role_id, updated_at)
        VALUES ('g1', 'r-old', '2026-11-01T00:00:00.000Z');
    `);
    raw.close();
    // 📌 ストアを開くと移行され、既存の行が残る
    const store = new MabusabaStore(dir);
    try {
      assert.deepEqual(store.getAutoroles("g1"), ["r-old"]);
      assert.equal(store.addAutorole("g1", "r-new"), true);
      assert.deepEqual([...store.getAutoroles("g1")].sort(), [
        "r-new",
        "r-old",
      ]);
    } finally {
      store.close();
    }
  });
});

// ------------------------------------------
// ⏳ クールダウンの往復保存
// ------------------------------------------
describe("cooldowns", () => {
  it("round-trips through the store, scoped by guild, user and kind", () => {
    const { store } = openStore();
    try {
      const kind = NUMBER_GAME_XP_COOLDOWN_KIND;
      assert.equal(store.getCooldownLastAt("g1", "u1", kind), null);
      store.recordCooldown("g1", "u1", kind, NOW);
      assert.equal(store.getCooldownLastAt("g1", "u1", kind), NOW);
      // 📌 他のギルド・ユーザー・kind には影響しない
      assert.equal(store.getCooldownLastAt("g2", "u1", kind), null);
      assert.equal(store.getCooldownLastAt("g1", "u2", kind), null);
      assert.equal(store.getCooldownLastAt("g1", "u1", "other"), null);
      // 📌 再記録すると新しい時刻から数え直す
      store.recordCooldown("g1", "u1", kind, NOW + 1000);
      assert.equal(store.getCooldownLastAt("g1", "u1", kind), NOW + 1000);
      // 📌 クールダウンは XP 行とメッセージ XP のクールダウンとは独立
      assert.equal(store.getXp("g1", "u1"), null);
    } finally {
      store.close();
    }
  });
});
