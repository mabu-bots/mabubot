# mabubot 設計書

## 1. 位置づけ

mabubot（まぶさばボット）は、まぶさば鯖専用の単体 Discord Bot である。p1228・logbot とは接続を持たず、TypeScript + discord.js の1プロセスで動く。

本プロジェクトは、統一開発フロー（aegis-app/aegis-bot で確立した手順）への移行にあわせて、旧 mabubot をゼロから再実装したものである（2026-11-28、v1.0.0）。再実装の棚卸しの正は **本番サーバー（台2）のスナップショット** とした。旧リポジトリの GitHub 側は本番より遅れており、本番には GitHub 未 push の変更（自動ロールのギルドごと複数対応 `d240cee`、`awardXp` の client 引数対応）が含まれていたためである。

引き継ぐもの: 旧実装の全機能・全コマンド、表示文言、各種閾値、SQLite の保存形式（本番 DB をそのまま読めること）。
引き継がないもの: 旧コードそのもの、旧リポジトリの自動化ワークフローのうち CI 以外のもの（§8）。

## 2. アーキテクチャ

```
Discord Gateway
  │  guildMemberAdd / messageCreate / interactionCreate
  ▼
events.ts ──► welcome.ts（歓迎・自動ロール）
  │        ├─► level.ts（メッセージ XP・レベルアップ）
  │        └─► mod.ts（荒らし対策の自動タイムアウト＋モデレーションログ）
commands.ts ─► 各機能モジュール（welcome / level / games / mod / poll /
  │            recruit / timer / watching）
  ▼
store.ts（SQLite: data/mabusaba.db、Node 標準 node:sqlite）
```

- 起動（index.ts）はコマンド同期を行わない。コマンド登録は `sync-commands.ts` の上書き同期だけが行う。
- READY が来ないサイレント停滞は watchdog.ts が検知し、プロセス終了で pm2 に再起動させる。
- プレゼンスは presence-cycle.ts の全 Bot 共通サイクルが担う。
- 投票・募集・タイマーは SQLite に保存され、起動時に再スケジュールされる（期限切れは即時に締切・発火）。

モジュール構成:

| モジュール | 役割 |
| --- | --- |
| `src/index.ts` | エントリポイント。Client 生成、ウォッチドッグ取り付け、起動時再スケジュール、コマンド実行の例外処理 |
| `src/commands.ts` | 全13コマンドの定義（SlashCommandBuilder）と振り分け、/help・/ping |
| `src/sync-commands.ts` | グローバルコマンドの上書き同期（PUT 全置換＋検証） |
| `src/clear-commands.ts` | コマンド全削除（グローバル＋任意でギルド） |
| `src/store.ts` | SQLite ストア（全テーブル、自動ロールの旧形式移行を含む） |
| `src/util.ts` | 埋め込み返信、期間/時刻パース（日本時間）、XP・レベル計算、ID 生成、表示整形 |
| `src/welcome.ts` | 歓迎メッセージ（テンプレート展開・送信）と自動ロール（複数・一括→個別再試行） |
| `src/level.ts` | XP 付与とレベルアップ処理（お祝い・報酬ロール）、/rank・/leaderboard・/level reward |
| `src/games.ts` | ミニゲーム（じゃんけん・コイントス・スロット・数当て）。数当てはメモリ保持＋30分期限、XP クールダウン管理 |
| `src/mod.ts` | モデレーション（警告・タイムアウト・キック・BAN・一括削除・モデレーションログ）と権限・階層チェック |
| `src/poll.ts` | 投票（ボタン投票・票数表示・自動締切） |
| `src/recruit.ts` | 募集（参加/不参加・満員・自動締切、24.8日超の遅延は分割スケジュール） |
| `src/timer.ts` | タイマー（メンション付きリマインダー、本人だけキャンセル可） |
| `src/watching.ts` | /watching（カスタム文言の保存・表示）とプレゼンス適用の入口 |
| `src/presence-cycle.ts` | プレゼンス・サイクル（Playing、1分交替、境界の200ms前に先行送信） |
| `src/watchdog.ts` | READY ウォッチドッグ（判定ロジック ReadyWatchdog と client への取り付け） |
| `src/events.ts` | guildMemberAdd、messageCreate（荒らし対策→XP）、ボタン処理の振り分け |

## 3. データ保存

保存先は SQLite ファイル1つ（既定 `data/mabusaba.db`、`DATA_DIR` で変更可）。Node 標準の `node:sqlite` を使い、ネイティブ依存を持たない。ジャーナルは WAL、synchronous は NORMAL。

テーブル（旧実装と同一）:

| テーブル | 内容 |
| --- | --- |
| `settings` | Bot 全体の設定（キー・バリュー）。プレゼンスのカスタム文言など |
| `welcome` | ギルドごとの歓迎設定（通知先チャンネル・文言） |
| `autorole` | ギルドごとの自動ロール（主キー guild_id + role_id、複数可） |
| `xp_users` | ギルド＋ユーザーごとの XP・レベル・最終 XP 付与時刻 |
| `level_rewards` | ギルドごとのレベル報酬ロール（主キー guild_id + level） |
| `warns` | 警告（自動採番 ID、理由、実行者、日時） |
| `mod_log` | ギルドごとのモデレーションログ通知先 |
| `polls` / `poll_votes` | 投票（選択肢は JSON）と票（1人1票、主キー poll_id + user_id） |
| `recruits` / `recruit_members` | 募集と参加者 |
| `timers` | タイマー（発火時刻つき） |
| `cooldowns` | 汎用クールダウン（ギルド＋ユーザー＋kind）。数当て XP 用 |

旧形式の自動ロールテーブル（主キーが guild_id のみ）が存在する場合は、ストア初期化時に複数形式へ移行し、既存の行を引き継ぐ（本番 DB の移行経路であり、テストでも検証する）。

## 4. 仕様の要点

### 4.1 XP・レベル

- レベル式: レベル n → n+1 に `5n² + 50n + 100` XP。累計は閉形式で計算する。
- メッセージ XP: 1件 15〜25、ギルド＋ユーザーごとに60秒クールダウン（`xp_users.last_xp_at_ms`）。
- ゲーム報酬 XP はクールダウンを動かさない（`touchCooldown: false`）。数当て +30 XP には別途、ユーザーごとに10分のクールダウン（`cooldowns` テーブル、kind = `number_game_xp`）。
- 保存される `level` 列は XP 加算のたびに再計算し、XP 合計と常に一致させる。

### 4.2 荒らし対策（自動タイムアウト）

- 閾値: 直近5秒に6件以上、または10秒に同一内容（空でないもの）を5件以上 → 10分タイムアウト。
- 対象メッセージはチャンネルごとにまとめて一括削除し、モデレーションログへ通知する（設定時のみ）。
- サーバーオーナー、「メンバーをモデレート」「管理者」権限保持者は対象外。自動タイムアウト自体にも60秒のクールダウンを置く。
- 判定は XP 付与より先に行い、スパムは XP を得ない。記録マップは10分ごとに掃除する。

### 4.3 モデレーションの階層

- タイムアウト・キック・BAN（対象がメンバーの場合）は、実行者と同等以上の最上位ロールを持つ相手には実行できない。オーナーは誰にでも実行でき、自分自身には誰も実行できない。
- /mod はコマンド全体の既定権限を持たず、サブコマンドごとに実行時チェックする。

### 4.4 プレゼンス・サイクル

- 形式: Playing で「<Bot名> | 起動して <経過>」と「<Bot名> | 現在時刻 HH:MM JST」を1分ごとに交互表示。位相は Unix 分の偶奇で決まり、全 Bot が同時に切り替わる。
- 値は次の分の境界時点のものを計算し、境界の200ms前に先行送信する（伝播遅延の実測中央値 190ms と相殺）。
- 経過時間の起点は最初の開始時刻に固定し、再接続・再適用ではリセットしない。
- /watching のカスタム文言（保存→環境変数→既定値の解決順）は互換のため残るが、表示はサイクルが担う。

### 4.5 READY ウォッチドッグ

- READY でない状態が120秒続いたらプロセスを終了する（確認間隔30秒）。READY 喪失の瞬間から数え直し、発動後は起点をリセットする。

### 4.6 コマンド同期

- 登録は `npm run sync:commands` のみ。PUT 全置換のあと再取得して検証し、不一致なら非ゼロ終了する。
- Bot 起動時には同期しない（同期で消したコマンドが再起動で復活しないため）。

## 5. 旧→新 対応表

| 旧（mabubot v0.1.0 系、本番スナップショット） | 新（mabubot v1.0.0） | 備考 |
| --- | --- | --- |
| `src/index.ts` | `src/index.ts` | 同構成。コメント規約のみ刷新 |
| `src/commands.ts` | `src/commands.ts` | 全13コマンドの定義・文言・オプション順は同一 |
| `src/sync-commands.ts` / `src/clear-commands.ts` | 同名 | 上書き同期・全削除の手順は同一 |
| `src/store.ts` | `src/store.ts` | テーブル定義・メソッド・移行処理は同一（本番 DB 互換） |
| `src/util.ts` | `src/util.ts` | パース規則・XP 計算・ID 生成は同一 |
| `src/welcome.ts` | `src/welcome.ts` | 歓迎＋自動ロール（複数対応 d240cee を含む） |
| `src/level.ts` | `src/level.ts` | awardXp の client 引数を含む |
| `src/games.ts` | `src/games.ts` | 数当ての期限・XP クールダウンを含む |
| `src/mod.ts` | `src/mod.ts` | 権限・階層チェックを含む |
| `src/poll.ts` / `src/recruit.ts` / `src/timer.ts` | 同名 | 締切・再スケジュールの規則は同一 |
| `src/watching.ts` | `src/watching.ts` | 文言解決とサイクル開始は同一 |
| `src/presence-cycle.ts` | `src/presence-cycle.ts` | サイクル形式・先行送信は同一 |
| `src/watchdog.ts` | `src/watchdog.ts` | 判定ロジックは同一 |
| `src/events.ts` | `src/events.ts` | 荒らし対策の閾値・削除方式は同一 |
| `src/test/*.test.ts`（src 内、dist/test で実行） | `tests/*.test.ts`（ルート、dist/tests で実行） | aegis-bot の配置に統一。全テストを移植し、自動ロールとプレゼンスのテストを追加 |
| `docs/ci.md` の6ワークフロー（CI / Format 自動修正 / CodeQL / Stale / Lock Threads / Release Drafter） | `.github/workflows/ci.yml` のみ | aegis-bot 基準に統一（§8）。Dependabot は継続 |
| `.all-contributorsrc` / `.mergify.yml` / `.github/config.yml` / `release-drafter.yml` | なし | 運用自動化の簡素化にあわせて不採用（§8） |
| バージョン 0.1.0 | 1.0.0 | 再実装にあわせて振り直し |
| パッケージ名 `mabusaba-bot` | `mabubot` | リポジトリ名に統一。pm2 アプリ名 `mabusaba` と DB ファイル名 `mabusaba.db` は運用互換のため据え置き |

## 6. 開発手順

すべての変更は次の手順で main に取り込む（正本は CONTRIBUTING.md）。

1. Issue を作成する（テンプレート使用。目的・作業内容・完了条件を書く）
2. main からブランチを切る: `<type>/<issue番号>-<slug>`
3. 実装し、ローカルで `./build.sh`（型チェック・ビルド・テスト）が通ることを確認する
4. PR を作成し、本文に `Closes #<番号>` を入れて Issue と紐づける
5. CI が通ったら **Rebase and merge** で main に取り込み、ブランチを削除する

- コミットメッセージは Conventional Commits ＋ 英語の件名
- リリースは main 上でバージョンを上げ、タグ `vX.Y.Z` を打って GitHub Release を作る（ノートのみ、バイナリは添付しない）

## 7. テスト

- 配置: `tests/`（util / store / watchdog / presence-cycle）。`npm test` がビルドのうえで `node --test dist/tests/*.test.js` を実行する。
- 旧テスト（util.test.ts 26件・watchdog.test.ts 5件）は全件移植した。あわせて自動ロール（追加・解除・旧形式移行）とプレゼンス・サイクル（整形・位相・送信スケジュール）のテストを追加し、合計40件。
- Discord 接続が必要な部分（コマンドハンドラ・イベント）は単体テストの対象外で、純粋ロジックとストアを検証範囲とする（旧実装と同じ切り分け）。

## 8. 判断記録

- **棚卸しの正は本番スナップショット（2026-11-28）**: 本番（台2）のコードは GitHub 未 push のコミット（自動ロールの複数対応ほか）を含み GitHub 側より進んでいたため、GitHub のリポジトリではなく本番から取得したスナップショットを再実装の基準にした。
- **ゼロから再実装し 1.0.0 に振り直し（2026-11-28）**: 統一開発フローへの移行を機に、コード・コメント・ドキュメントを作り直した。振る舞いの同一性は、コマンド定義 JSON・ストアのスキーマとメソッド一覧の機械比較と、移植テストで担保する。
- **テスト配置を tests/ に統一（2026-11-28）**: 旧実装は `src/test/` にテストを置き `dist/test/` で実行していた。基準の aegis-bot に合わせ、ルートの `tests/` に移した（ビルド成果物は `dist/src/` と `dist/tests/`）。
- **CI は ci.yml のみに集約（2026-11-28）**: 旧リポジトリには Format 自動修正・CodeQL・Stale・Lock Threads・Release Drafter を含む6ワークフローがあったが、aegis-bot 基準（CI 1本＋Dependabot）に統一した。整形は CI の `format:check`（blocking）で担保し、自動修正コミットは行わない。CodeQL の SARIF 保存方式など旧 CI の詳細は旧リポジトリの `docs/ci.md` に記録が残る。
- **Node は 24 以上を前提（2026-11-28）**: `node:sqlite` がフラグなしで使える下限として engines を `>=24` のまま維持し、CI も Node 24 で実行する。ecosystem.config.cjs の Node 22 向けフラグ付与は互換のため残す。
- **保存形式・保存先は変更しない（2026-11-28）**: 本番 DB（`data/mabusaba.db`）をそのまま使えることが再実装の絶対条件のため、スキーマと既定パスは旧実装と同一にした。
- **開発手順を統一した（2026-11-28）**: Issue → ブランチ → PR → Rebase and merge、Conventional Commits＋英語、タグ＋Release（ノートのみ）を採用。導入自体はブートストラップ例外として Issue なしで取り込む。
