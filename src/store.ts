// ==========================================
// 🗄️ SQLite ストア（全テーブルの永続化）
// ==========================================
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { levelFromTotalXp } from "./util.js";

// ------------------------------------------
// 📋 行データの型定義
// ------------------------------------------
// 👋 歓迎メッセージ設定（ギルドごと）
export interface WelcomeRow {
  guild_id: string;
  channel_id: string;
  message: string | null;
}

// 📊 ユーザーの XP・レベル
export interface XpRow {
  guild_id: string;
  user_id: string;
  xp: number;
  level: number;
  last_xp_at_ms: number;
}

// 🎁 レベル報酬ロール
export interface LevelRewardRow {
  guild_id: string;
  level: number;
  role_id: string;
}

// ⚠️ 警告レコード
export interface WarnRow {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at_ms: number;
}

// 🗳️ 投票（options は DB 上 JSON 文字列、読み出し時に配列へ戻す）
export interface PollRow {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  question: string;
  options: string[];
  ends_at_ms: number;
  created_by: string;
  closed: number;
}

// 📣 募集
export interface RecruitRow {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  title: string;
  max_members: number;
  starts_at_ms: number;
  description: string | null;
  created_by: string;
  closed: number;
}

// ⏰ タイマー
export interface TimerRow {
  id: string;
  guild_id: string;
  channel_id: string;
  user_id: string;
  message: string;
  fires_at_ms: number;
  created_at_ms: number;
}

// ------------------------------------------
// 🗄️ ストア本体
// ------------------------------------------
// 💾 Bot 全体の SQLite ストア（Node 標準の node:sqlite を使用し、
// ネイティブ依存を持たない）。ファイルは1つ: data/mabusaba.db
export class MabusabaStore {
  private db: DatabaseSync;

  // ------------------------------------------
  // 🚀 初期化
  // ------------------------------------------
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, "mabusaba.db"));
    // 📌 WAL + NORMAL synchronous: コミットを安くし、この Bot の
    // アクセスパターン（単一ライター）では読み取りが書き込みを
    // 妨げないようにする
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    // 🔄 旧形式の自動ロールテーブル（主キーが guild_id のみ＝ギルドに
    // 1件だけ）を、複数ロール形式（主キー guild_id + role_id）へ
    // 移行する。既存の設定は引き継ぐ
    const autoroleSql = this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'autorole'",
      )
      .get() as { sql: string } | undefined;
    if (autoroleSql?.sql.includes("guild_id TEXT PRIMARY KEY")) {
      this.db.exec(`
        CREATE TABLE autorole_new (
          guild_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (guild_id, role_id)
        );
        INSERT INTO autorole_new (guild_id, role_id, updated_at)
          SELECT guild_id, role_id, updated_at FROM autorole;
        DROP TABLE autorole;
        ALTER TABLE autorole_new RENAME TO autorole;
      `);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS welcome (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        message TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS autorole (
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, role_id)
      );
      CREATE TABLE IF NOT EXISTS xp_users (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        last_xp_at_ms INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS level_rewards (
        guild_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        role_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, level)
      );
      CREATE TABLE IF NOT EXISTS warns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mod_log (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        ends_at_ms INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        closed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        option_idx INTEGER NOT NULL,
        PRIMARY KEY (poll_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS recruits (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        title TEXT NOT NULL,
        max_members INTEGER NOT NULL,
        starts_at_ms INTEGER NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        closed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS recruit_members (
        recruit_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at_ms INTEGER NOT NULL,
        PRIMARY KEY (recruit_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS timers (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        message TEXT NOT NULL,
        fires_at_ms INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cooldowns (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        last_at_ms INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, kind)
      );
      CREATE INDEX IF NOT EXISTS idx_warns_guild_user ON warns (guild_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_xp_guild_xp ON xp_users (guild_id, xp DESC);
      CREATE INDEX IF NOT EXISTS idx_polls_open ON polls (closed, ends_at_ms);
      CREATE INDEX IF NOT EXISTS idx_recruits_open ON recruits (closed, starts_at_ms);
    `);
  }

  // ------------------------------------------
  // ⚙️ 設定（ボット全体）
  // ------------------------------------------

  getSetting(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, new Date().toISOString());
  }

  deleteSetting(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  // ------------------------------------------
  // 👋 ウェルカム
  // ------------------------------------------

  getWelcome(guildId: string): WelcomeRow | null {
    const row = this.db
      .prepare(
        "SELECT guild_id, channel_id, message FROM welcome WHERE guild_id = ?",
      )
      .get(guildId) as WelcomeRow | undefined;
    return row ?? null;
  }

  setWelcome(guildId: string, channelId: string, message: string | null): void {
    this.db
      .prepare(
        `INSERT INTO welcome (guild_id, channel_id, message, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message = excluded.message, updated_at = excluded.updated_at`,
      )
      .run(guildId, channelId, message, new Date().toISOString());
  }

  deleteWelcome(guildId: string): void {
    this.db.prepare("DELETE FROM welcome WHERE guild_id = ?").run(guildId);
  }

  // ------------------------------------------
  // 🎭 自動ロール（ギルドごとに複数）
  // ------------------------------------------

  getAutoroles(guildId: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT role_id FROM autorole WHERE guild_id = ? ORDER BY updated_at, role_id",
      )
      .all(guildId) as Array<{ role_id: string }>;
    return rows.map((r) => r.role_id);
  }

  // ➕ 自動ロールを1件追加する。すでに設定済みなら false を返す
  addAutorole(guildId: string, roleId: string): boolean {
    const result = this.db
      .prepare(
        "INSERT OR IGNORE INTO autorole (guild_id, role_id, updated_at) VALUES (?, ?, ?)",
      )
      .run(guildId, roleId, new Date().toISOString());
    return result.changes === 1;
  }

  // ➖ 自動ロールを1件解除する。設定されていなければ false を返す
  removeAutorole(guildId: string, roleId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM autorole WHERE guild_id = ? AND role_id = ?")
      .run(guildId, roleId);
    return result.changes === 1;
  }

  // 🗑️ そのギルドの自動ロールをすべて解除する
  deleteAutorole(guildId: string): void {
    this.db.prepare("DELETE FROM autorole WHERE guild_id = ?").run(guildId);
  }

  // ------------------------------------------
  // 📊 XP・レベル
  // ------------------------------------------

  getXp(guildId: string, userId: string): XpRow | null {
    const row = this.db
      .prepare(
        "SELECT guild_id, user_id, xp, level, last_xp_at_ms FROM xp_users WHERE guild_id = ? AND user_id = ?",
      )
      .get(guildId, userId) as XpRow | undefined;
    return row ?? null;
  }

  setXp(row: XpRow): void {
    this.db
      .prepare(
        `INSERT INTO xp_users (guild_id, user_id, xp, level, last_xp_at_ms) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, last_xp_at_ms = excluded.last_xp_at_ms`,
      )
      .run(row.guild_id, row.user_id, row.xp, row.level, row.last_xp_at_ms);
  }

  // 📈 XP を加算し、加算前後の行を返す。レベルアップ時の扱い（お祝い
  // メッセージと報酬ロール）は呼び出し側が決める。保存される
  // `level` はこの書き込みの中で再計算するため、その列を読む側
  // （ランキングなど）が XP 合計と食い違うことはない。
  // `touchCooldown: false` は last_xp_at_ms を動かさずに XP だけを
  // 与える — ゲーム報酬がメッセージ XP のクールダウンをリセット
  // してはいけないため
  addXp(
    guildId: string,
    userId: string,
    amount: number,
    opts: { now?: number; touchCooldown?: boolean } = {},
  ): { before: XpRow; after: XpRow } {
    const before: XpRow = this.getXp(guildId, userId) ?? {
      guild_id: guildId,
      user_id: userId,
      xp: 0,
      level: 0,
      last_xp_at_ms: 0,
    };
    const xp = before.xp + amount;
    const after: XpRow = {
      ...before,
      xp,
      level: levelFromTotalXp(xp).level,
      last_xp_at_ms:
        opts.touchCooldown === false
          ? before.last_xp_at_ms
          : (opts.now ?? Date.now()),
    };
    this.setXp(after);
    return { before, after };
  }

  // ⏳ 呼び出し側が `kind` を選ぶ汎用のクールダウン記録。
  // xp_users.last_xp_at_ms とは分ける: あの列はメッセージ XP 専用の
  // クールダウンであり、独自のクールダウンを持つ報酬（数当てゲーム
  // の XP など）が動かしてはいけない — ゲーム勝利が addXp に
  // `touchCooldown: false` を渡すのと同じ理由
  getCooldownLastAt(
    guildId: string,
    userId: string,
    kind: string,
  ): number | null {
    const row = this.db
      .prepare(
        "SELECT last_at_ms FROM cooldowns WHERE guild_id = ? AND user_id = ? AND kind = ?",
      )
      .get(guildId, userId, kind) as { last_at_ms: number } | undefined;
    return row?.last_at_ms ?? null;
  }

  recordCooldown(
    guildId: string,
    userId: string,
    kind: string,
    now: number = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO cooldowns (guild_id, user_id, kind, last_at_ms) VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id, kind) DO UPDATE SET last_at_ms = excluded.last_at_ms`,
      )
      .run(guildId, userId, kind, now);
  }

  setLevel(guildId: string, userId: string, level: number): void {
    this.db
      .prepare(
        "UPDATE xp_users SET level = ? WHERE guild_id = ? AND user_id = ?",
      )
      .run(level, guildId, userId);
  }

  topXp(guildId: string, limit: number): XpRow[] {
    return this.db
      .prepare(
        "SELECT guild_id, user_id, xp, level, last_xp_at_ms FROM xp_users WHERE guild_id = ? ORDER BY xp DESC LIMIT ?",
      )
      .all(guildId, limit) as unknown as XpRow[];
  }

  xpRank(guildId: string, userId: string): number | null {
    // 📌 XP レコードがないユーザーには順位がない。旧クエリは
    // サブクエリを COALESCE(xp, 0) で包んでいたが、行自体が無いと
    // スカラーサブクエリ全体が NULL になり（内側の COALESCE は行を
    // 見ない）、`xp > NULL` の件数が0になって未ランクの全員が
    // 1位と表示されていた
    const self = this.getXp(guildId, userId);
    if (!self) return null;
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM xp_users WHERE guild_id = ? AND xp > ?",
      )
      .get(guildId, self.xp) as { n: number } | undefined;
    return row ? row.n + 1 : null;
  }

  // ------------------------------------------
  // 🎁 レベル報酬
  // ------------------------------------------

  getLevelRewards(guildId: string): LevelRewardRow[] {
    return this.db
      .prepare(
        "SELECT guild_id, level, role_id FROM level_rewards WHERE guild_id = ? ORDER BY level ASC",
      )
      .all(guildId) as unknown as LevelRewardRow[];
  }

  setLevelReward(guildId: string, level: number, roleId: string): void {
    this.db
      .prepare(
        `INSERT INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)
         ON CONFLICT(guild_id, level) DO UPDATE SET role_id = excluded.role_id`,
      )
      .run(guildId, level, roleId);
  }

  deleteLevelReward(guildId: string, level: number): void {
    this.db
      .prepare("DELETE FROM level_rewards WHERE guild_id = ? AND level = ?")
      .run(guildId, level);
  }

  // ------------------------------------------
  // ⚠️ 警告
  // ------------------------------------------

  addWarn(
    guildId: string,
    userId: string,
    moderatorId: string,
    reason: string,
    now = Date.now(),
  ): number {
    const info = this.db
      .prepare(
        "INSERT INTO warns (guild_id, user_id, moderator_id, reason, created_at_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run(guildId, userId, moderatorId, reason, now);
    return Number(info.lastInsertRowid);
  }

  listWarns(guildId: string, userId: string): WarnRow[] {
    return this.db
      .prepare(
        "SELECT id, guild_id, user_id, moderator_id, reason, created_at_ms FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at_ms DESC",
      )
      .all(guildId, userId) as unknown as WarnRow[];
  }

  countWarns(guildId: string, userId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM warns WHERE guild_id = ? AND user_id = ?",
      )
      .get(guildId, userId) as { n: number };
    return row.n;
  }

  // ------------------------------------------
  // 🛡️ モデレーションログ
  // ------------------------------------------

  getModLog(guildId: string): string | null {
    const row = this.db
      .prepare("SELECT channel_id FROM mod_log WHERE guild_id = ?")
      .get(guildId) as { channel_id: string } | undefined;
    return row?.channel_id ?? null;
  }

  setModLog(guildId: string, channelId: string): void {
    this.db
      .prepare(
        `INSERT INTO mod_log (guild_id, channel_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at`,
      )
      .run(guildId, channelId, new Date().toISOString());
  }

  deleteModLog(guildId: string): void {
    this.db.prepare("DELETE FROM mod_log WHERE guild_id = ?").run(guildId);
  }

  // ------------------------------------------
  // 🗳️ 投票
  // ------------------------------------------

  createPoll(poll: Omit<PollRow, "closed">): void {
    this.db
      .prepare(
        "INSERT INTO polls (id, guild_id, channel_id, message_id, question, options, ends_at_ms, created_by, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
      )
      .run(
        poll.id,
        poll.guild_id,
        poll.channel_id,
        poll.message_id,
        poll.question,
        JSON.stringify(poll.options),
        poll.ends_at_ms,
        poll.created_by,
      );
  }

  getPoll(id: string): PollRow | null {
    const row = this.db.prepare("SELECT * FROM polls WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...(row as unknown as PollRow),
      options: JSON.parse(String(row.options)) as string[],
    };
  }

  listOpenPolls(): PollRow[] {
    const rows = this.db
      .prepare("SELECT * FROM polls WHERE closed = 0 ORDER BY ends_at_ms")
      .all() as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      ...(r as unknown as PollRow),
      options: JSON.parse(String(r.options)) as string[],
    }));
  }

  closePoll(id: string): void {
    this.db.prepare("UPDATE polls SET closed = 1 WHERE id = ?").run(id);
  }

  setPollVote(pollId: string, userId: string, optionIdx: number): void {
    this.db
      .prepare(
        `INSERT INTO poll_votes (poll_id, user_id, option_idx) VALUES (?, ?, ?)
         ON CONFLICT(poll_id, user_id) DO UPDATE SET option_idx = excluded.option_idx`,
      )
      .run(pollId, userId, optionIdx);
  }

  pollVoteCounts(pollId: string, optionCount: number): number[] {
    const counts = new Array<number>(optionCount).fill(0);
    const rows = this.db
      .prepare(
        "SELECT option_idx, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY option_idx",
      )
      .all(pollId) as unknown as Array<{ option_idx: number; n: number }>;
    for (const r of rows)
      if (r.option_idx >= 0 && r.option_idx < optionCount)
        counts[r.option_idx] = r.n;
    return counts;
  }

  pollTotalVotes(pollId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ?")
      .get(pollId) as { n: number };
    return row.n;
  }

  // ------------------------------------------
  // 📣 募集
  // ------------------------------------------

  createRecruit(recruit: Omit<RecruitRow, "closed">): void {
    this.db
      .prepare(
        "INSERT INTO recruits (id, guild_id, channel_id, message_id, title, max_members, starts_at_ms, description, created_by, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      )
      .run(
        recruit.id,
        recruit.guild_id,
        recruit.channel_id,
        recruit.message_id,
        recruit.title,
        recruit.max_members,
        recruit.starts_at_ms,
        recruit.description,
        recruit.created_by,
      );
  }

  getRecruit(id: string): RecruitRow | null {
    const row = this.db
      .prepare("SELECT * FROM recruits WHERE id = ?")
      .get(id) as RecruitRow | undefined;
    return row ?? null;
  }

  listOpenRecruits(): RecruitRow[] {
    return this.db
      .prepare("SELECT * FROM recruits WHERE closed = 0 ORDER BY starts_at_ms")
      .all() as unknown as RecruitRow[];
  }

  closeRecruit(id: string): void {
    this.db.prepare("UPDATE recruits SET closed = 1 WHERE id = ?").run(id);
  }

  addRecruitMember(recruitId: string, userId: string, now = Date.now()): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO recruit_members (recruit_id, user_id, joined_at_ms) VALUES (?, ?, ?)",
      )
      .run(recruitId, userId, now);
  }

  removeRecruitMember(recruitId: string, userId: string): void {
    this.db
      .prepare(
        "DELETE FROM recruit_members WHERE recruit_id = ? AND user_id = ?",
      )
      .run(recruitId, userId);
  }

  listRecruitMembers(recruitId: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT user_id FROM recruit_members WHERE recruit_id = ? ORDER BY joined_at_ms",
      )
      .all(recruitId) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }

  // ------------------------------------------
  // ⏰ タイマー
  // ------------------------------------------

  createTimer(timer: TimerRow): void {
    this.db
      .prepare(
        "INSERT INTO timers (id, guild_id, channel_id, user_id, message, fires_at_ms, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        timer.id,
        timer.guild_id,
        timer.channel_id,
        timer.user_id,
        timer.message,
        timer.fires_at_ms,
        timer.created_at_ms,
      );
  }

  getTimer(id: string): TimerRow | null {
    const row = this.db.prepare("SELECT * FROM timers WHERE id = ?").get(id) as
      TimerRow | undefined;
    return row ?? null;
  }

  listTimers(guildId?: string): TimerRow[] {
    if (guildId) {
      return this.db
        .prepare("SELECT * FROM timers WHERE guild_id = ? ORDER BY fires_at_ms")
        .all(guildId) as unknown as TimerRow[];
    }
    return this.db
      .prepare("SELECT * FROM timers ORDER BY fires_at_ms")
      .all() as unknown as TimerRow[];
  }

  deleteTimer(id: string): void {
    this.db.prepare("DELETE FROM timers WHERE id = ?").run(id);
  }

  // ------------------------------------------
  // 🔚 終了処理
  // ------------------------------------------
  close(): void {
    this.db.close();
  }
}
