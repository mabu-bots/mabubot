# まぶさばボット（mabubot）

| 項目 | 内容 |
| --- | --- |
| バージョン | v1.0.0 |
| 状態 | 稼働中 |
| 稼働先 | 台2（ConoHa VPS、pm2 アプリ名 `mabusaba`） |
| 実装 | TypeScript + discord.js v14 / Node 24 / SQLite（`node:sqlite`） |

まぶさば鯖専用のオリジナル Discord ボットです。p1228・logbot とは一切つながりを持たない、単体構成のボットです。TypeScript + discord.js の1プロセスで動きます。

## ✨ できること

- **歓迎・自動役職**：参加時の歓迎メッセージ（`{user}` `{server}` `{count}` が使えます）と、参加時の役職自動付与（ギルドごとに最大10件）
- **レベル・経験値**：メッセージ送信でXP（15〜25、60秒クールダウン）。レベルアップでお祝いメッセージと報酬ロールを付与
- **ミニゲーム**：じゃんけん・コイントス・スロット・数当て（勝利でXP）
- **モデレーション**：警告・タイムアウト・キック・BAN・メッセージ一括削除・モデレーションログ。短時間の連投は自動で10分タイムアウト
- **投票**：ボタン投票（1人1票・変更可）、期限で自動締切・結果表示
- **募集**：参加/不参加ボタン、定員で満員表示、開始時刻で自動締切
- **タイマー**：指定分数後のリマインダー（メンション付き）。再起動しても消えません
- **プレゼンス**：全 Bot 共通のプレゼンス・サイクル（Playing、1分ごとに「起動して ○○」と「現在時刻 ○○ JST」を交互表示）

コマンドの返信は埋め込みメッセージで、基本的に実行者にだけ見えます（限定表示）。`/rank` `/leaderboard` `/game` `/welcome test` `/poll` `/recruit` の作成結果など、みんなで見たほうがいいものは公開メッセージです。フッターは `✨ まぶさば` です。

## ⌨️ コマンド

`/welcome` `/autorole` `/level reward` `/watching` はサーバー管理（Manage Guild）権限が必要です。`/mod` はサブコマンドごとに権限が分かれています（warn・timeout はメンバーをモデレート、kick はキック、ban・unban はBAN、clear・log はサーバーの管理）。それ以外は誰でも使えます。

| コマンド | 説明 | 備考 |
| --- | --- | --- |
| `/welcome set channel:<#チャンネル> message:<文言>` | 歓迎メッセージを設定（`{user}` `{server}` `{count}` が使えます） | 管理者 |
| `/welcome show` | 現在の設定を表示 | 管理者 |
| `/welcome disable` | 歓迎メッセージを止める | 管理者 |
| `/welcome test` | 歓迎メッセージの見た目を確認 | 管理者・公開表示 |
| `/autorole set role:<役職>` | 参加時に自動で付与する役職を追加（繰り返し実行で複数設定可、最大10件） | 管理者 |
| `/autorole remove [role:<役職>]` | 指定した1件の自動役職を解除（未指定ならすべて解除） | 管理者 |
| `/autorole show` | 現在の自動役職を一覧表示 | 管理者 |
| `/rank [user]` | レベル・XP・次のレベルまでの進捗・順位を表示 | 公開表示 |
| `/leaderboard` | レベルランキング上位10人を表示 | 公開表示 |
| `/level reward add level:<レベル> role:<役職>` | レベル報酬ロールを追加 | 管理者 |
| `/level reward list` | レベル報酬ロールの一覧 | 管理者 |
| `/level reward remove level:<レベル>` | レベル報酬ロールを削除 | 管理者 |
| `/game janken choice:<グー/チョキ/パー>` | じゃんけん（勝利で +10 XP） | 公開表示 |
| `/game coin` | コイントス | 公開表示 |
| `/game slot` | スロット（3つそろったら +10 XP） | 公開表示 |
| `/game number start` | 数当てゲームを開始（1〜100、10回まで） | 公開表示 |
| `/game number guess number:<数字>` | 数字を当てる（正解で +30 XP） | 公開表示 |
| `/mod warn add user:<ユーザー> reason:<理由>` | 警告を追加（SQLiteに保存） | メンバーをモデレート |
| `/mod warn list user:<ユーザー>` | 警告履歴を表示 | メンバーをモデレート |
| `/mod timeout user:<ユーザー> duration:<期間> reason:<理由>` | タイムアウト（期間は `10m` / `1h` / `1d` / `30分` / `2時間`、最大28日） | メンバーをモデレート |
| `/mod untimeout user:<ユーザー>` | タイムアウト解除 | メンバーをモデレート |
| `/mod kick user:<ユーザー> reason:<理由>` | キック | メンバーをキック |
| `/mod ban user:<ユーザー> delete-days:<0〜7> reason:<理由>` | BAN（過去メッセージの削除日数も指定可） | メンバーをBAN |
| `/mod unban user-id:<ユーザーID>` | BAN解除 | メンバーをBAN |
| `/mod clear count:<1〜100>` | メッセージを一括削除（14日より前のメッセージは削除できません） | サーバーの管理 |
| `/mod log set channel:<#チャンネル>` | モデレーションログの通知先を設定 | サーバーの管理 |
| `/mod log disable` | モデレーションログを止める | サーバーの管理 |
| `/poll create question:<質問> option1:<選択肢1> option2:<選択肢2> [option3〜5] [duration:<分>]` | 投票を作成（期間は1〜1440分、未指定なら60分） | 公開表示 |
| `/recruit create title:<タイトル> members:<定員 2〜20> time:<開始時刻> [description:<説明>]` | 募集を作成 | 公開表示 |
| `/timer set minutes:<分数 1〜1440> message:<内容>` | タイマーを設定（期限に同チャンネルでメンション付きリマインダー） | |
| `/timer list` | 設定中のタイマーを一覧表示 | |
| `/timer cancel id:<ID>` | タイマーをキャンセル（設定した本人だけがキャンセルできます） | |
| `/watching set text:<文言>` | プレゼンスのカスタム文言を保存（Bot全体に適用、SQLiteに保存） | 管理者 |
| `/watching show` | 現在表示中のプレゼンスを表示 | 管理者 |
| `/watching reset` | カスタム文言を消去 | 管理者 |
| `/ping` | 応答確認 | |
| `/help` | コマンド一覧を表示 | 公開表示 |

補足:

- `/autorole set` は追加式です。新しい役職を設定しても、すでにある自動役職は消えません。参加時には設定した役職をすべて付与します。役職の付与に失敗したとき（Botの権限不足や役職の階層が上にある場合）は、その役職だけスキップしてログに出し、他の役職の付与と参加処理は続けます。
- レベル式：レベル `n` から `n+1` に必要なXPは `5n² + 50n + 100`（レベル1には累計100 XP）。レベルアップ時は同じチャンネルにお祝いメッセージを送り、到達したレベルの報酬ロールを付与します。
- 数当てゲームはチャンネル＋ユーザーごとにメモリで保持します（Botの再起動で消えます）。開始から30分経つと時間切れで終了し、新しく始め直せます。数当てゲームの +30 XP には、ユーザーごとに10分のクールダウンがあります。クールダウン中の正解ではXPは付与されません（残り時間が応答に表示されます）が、ゲーム自体はいつでも遊べます。ゲームで獲得したXPは、メッセージXPの60秒クールダウンには影響しません（数当てXPのクールダウンとも別々に管理されます）。
- **荒らし対策**：同一ユーザーが直近5秒に6件以上、または10秒に同一内容を5件以上送ると、自動で10分タイムアウト＋該当メッセージを削除＋モデレーションログへ通知します（モデレーションログ設定時のみ）。サーバーオーナーと「メンバーをモデレート」権限を持つ人は自動タイムアウトの対象外です。また、タイムアウト・キック・BANは、実行者と同等以上の役職のメンバーには実行できません（Discord標準の役職階層と同じルール）。
- 投票はボタンで投票します（1人1票・変更可）。投票数は埋め込みに即時反映され、期限が来ると自動で締め切って結果を表示します。投票内容はSQLiteに保存されます。
- 募集の開始時刻は日本時間で `21:00` / `30分後` / `2026-11-14 21:00` のように書けます。参加/不参加ボタンで参加者一覧が埋め込みに反映され、定員に達すると「満員」表示になり、開始時刻を過ぎると自動で締め切ります。
- タイマーはSQLiteに保存され、Botの再起動後も再スケジュールされます（期限切れのものは起動時にすぐ鳴ります）。
- プレゼンスの表示そのものは全 Bot 共通のプレゼンス・サイクル（presence-cycle）が担います。`/watching set` で保存したカスタム文言は互換のため保持されますが、実際に適用される表示はサイクル形式です（`/watching show` は現在の表示を返します）。

## ⚙️ 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DISCORD_TOKEN` | ○ | Discord Bot のトークン |
| `DISCORD_APPLICATION_ID` | ○ | Discord アプリケーション ID（コマンド同期・削除に使う） |
| `DATA_DIR` | ― | SQLite データの保存先。既定は `./data`（`data/mabusaba.db`） |
| `WATCHING_TEXT` | ― | プレゼンスのカスタム文言。`/watching set` の保存値があればそちらが優先 |
| `DISCORD_GUILD_ID` / `DISCORD_GUILD_IDS` | ― | `clear:commands` でギルドコマンドも消す場合に指定（カンマ区切り可） |

## ⚙️ 必要なDiscord設定

1. [Discord Developer Portal](https://discord.com/developers/applications) で**新しいアプリケーション**を作成し、Botを追加します（p1228・logbotのものは使いません）。
2. Bot設定で Privileged Gateway Intents を有効にします：
   - **Server Members Intent**（参加・自動役職に必要）
   - **Message Content Intent**（XP・荒らし対策にメッセージ内容が必要）
3. サーバーにBotを招待します。権限は「チャンネルを見る」「メッセージを送信する」「埋め込みリンク」「メンバーをモデレート」「メンバーをキック」「メンバーをBAN」「メッセージの管理」「ロールを管理」など、使う機能に合わせて付与してください。特に自動役職・レベル報酬ロールは、Botの役職より下にある役職にしか付与できません。
4. `.env.example` を `.env` にコピーし、`DISCORD_TOKEN` と `DISCORD_APPLICATION_ID` を設定します。**トークンはチャットには送らず、`.env` にだけ入れてください。**

## 🚀 起動

```bash
npm ci
npm run build
npm run sync:commands   # スラッシュコマンドを上書き同期（初回・コマンド変更時に実行）
npm start
```

### 🔨 ビルド（ワンコマンド）

依存関係のインストール → 型チェック → ビルド → テストまでを 1 コマンドで実行するスクリプトを用意している。失敗した場合は、そのステップで止まってどこで落ちたかを表示する。テストは `dist/` に対して実行されるため、スクリプト内でもビルドを先に行う。

```bat
build.bat
```

```sh
./build.sh
```

開発時は `npm run dev` で起動できます。設定・XP・警告・投票・募集・タイマーは `data/mabusaba.db`（SQLite、Node標準の `node:sqlite`）に保存され、再起動しても残ります。Node 24以上が必要です。

> [!NOTE]
> `.env` は自動では読み込まれません。`DISCORD_TOKEN` / `DISCORD_APPLICATION_ID` はシェルに export するか、systemd の `EnvironmentFile=` で渡してください。起動前に `set -a; source .env; set +a` でも渡せます。pm2で起動する場合は `ecosystem.config.cjs` が `.env` を読み込むので、このままで大丈夫です。

## 🖥️ pm2で自動起動

VPSの再起動後もBotが自動で立ち上がるように、pm2で管理します。

```bash
# 1. pm2をインストール（初回のみ）
npm install -g pm2

# 2. 最新版にしてビルド（.env が用意できていること）
npm ci
npm run build
npm run sync:commands   # 初回・コマンド変更時のみ

# 3. pm2で起動
pm2 start ecosystem.config.cjs
pm2 status              # mabusaba が online になっているか確認
pm2 logs mabusaba       # ログを確認（Ctrl+Cで抜ける）

# 4. サーバー再起動後も自動起動するようにする
pm2 startup             # 表示されるコマンド（sudo ...）を実行する
pm2 save                # 現在のプロセス一覧を保存
```

よく使う操作：

```bash
pm2 restart mabusaba   # 更新後の再起動（npm ci → npm run build のあと）
pm2 stop mabusaba      # 停止
pm2 delete mabusaba    # pm2の管理から外す
pm2 logs mabusaba --lines 50   # 直近50行のログを見る
```

注意：

- `ecosystem.config.cjs` が `.env` を読み込んでBotに渡します。トークンはこのファイルには書かず、`.env` にだけ置いてください。
- Node 22では `node:sqlite` に `--experimental-sqlite` が必要ですが、`ecosystem.config.cjs` がNodeのバージョンを見て自動で付けます。Node 24以上なら不要です。Node 24への更新もおすすめです。

## 🔁 コマンド同期（上書き同期式）

スラッシュコマンドの登録は `npm run sync:commands` だけが行います。Botの起動時には同期しません。

- 実行すると、現在のグローバルコマンド一覧を取得してから、13件のコマンドで **PUTによる全置換** を行います。含まれていない古いコマンドは削除され、再起動で復活することはありません。
- 同期後に一覧を再取得して、実際の内容が期待通りか検証します。検証に失敗すると終了コード1で終了します。
- コマンドの定義を変えたら、必ず `npm run sync:commands` を実行し直してください。グローバルコマンドの反映には最大で1時間かかることがあります。
- 必須オプションは任意オプションより前に置いてあります（Discordが必須オプションを先に置くことを要求するため。`/vc set` で弾かれたのと同じ罠を避けています）。

## 🧹 古いコマンドが残っているとき

上書き同期は **このアプリのグローバルコマンドだけ** を置き換えます。残っているコマンドは、まずどれかを確認してください。

| 残っているもの | 原因 | 対処 |
| --- | --- | --- |
| mabubotの古いグローバルコマンド | まだ新しい `sync:commands` を実行していない、または反映待ち（最大1時間） | `npm run sync:commands` を実行し、`Removed:` に出るか確認。Discordクライアントを再起動（Ctrl+R）して反映を待つ |
| サーバー限定（ギルド）コマンド | ギルドコマンドは別エンドポイントのため、上書き同期の対象外 | 下の `clear:commands` を `DISCORD_GUILD_ID` 付きで実行 |
| 前に使っていた別プログラムのコマンド | アプリケーションが違うため、mabubot側からは消せない | 下の `clear:commands` を**旧プログラムのトークン／アプリケーションID**で実行する。旧Botがまだサーバーにいるなら、サーバーから追放するのも忘れずに |

全削除するには `npm run clear:commands` を使います。グローバルコマンドをすべて消し、検証します。

```bash
# mabubotのグローバル＋指定サーバーのギルドコマンドを全削除
DISCORD_GUILD_ID=<サーバーID> npm run clear:commands

# 旧プログラムのコマンドを消す場合（旧アプリの認証情報で実行）
DISCORD_TOKEN=<redacted> DISCORD_APPLICATION_ID=<旧アプリID> npm run clear:commands
```

その後、mabubotのコマンドを戻すには `npm run sync:commands` を実行し直してください。

## 🗂️ 構成

- `src/index.ts` — 起動・Intents（コマンド同期はしない）、起動時に投票・募集・タイマーを再スケジュール
- `src/sync-commands.ts` — スラッシュコマンドの上書き同期（PUT全置換＋検証）
- `src/clear-commands.ts` — アプリケーションのコマンド全削除（グローバル＋ギルド）
- `src/commands.ts` — 全スラッシュコマンドの定義と振り分け
- `src/store.ts` — SQLiteストア（全テーブル）
- `src/util.ts` — 埋め込み返信・期間/時刻解析・XP計算・時間表示
- `src/welcome.ts` — 歓迎メッセージ・自動役職
- `src/level.ts` — XP付与・レベルアップ・報酬ロール・ランク
- `src/games.ts` — ミニゲーム（じゃんけん・コイン・スロット・数当て）
- `src/mod.ts` — モデレーション（警告・タイムアウト・キック・BAN・削除・モデレーションログ）
- `src/poll.ts` — 投票（ボタン投票・自動締切）
- `src/recruit.ts` — 募集（参加/不参加ボタン・満員・自動締切）
- `src/timer.ts` — タイマー（リマインダー・再起動後の再スケジュール）
- `src/watching.ts` — プレゼンス文言の管理（/watching）
- `src/presence-cycle.ts` — プレゼンス・サイクル（全 Bot 共通形式）
- `src/watchdog.ts` — READYウォッチドッグ（Gateway のサイレント停滞検知）
- `src/events.ts` — GuildMemberAdd・messageCreate（XP＋荒らし対策）・ボタン処理
- `tests/` — 単体テスト（XP計算・期間/時刻解析・じゃんけん・ストア・ウォッチドッグ・プレゼンス）

## 🧭 判断記録

- **ゼロから再実装し、バージョンを 1.0.0 に振り直した（2026-11-28）**: 統一開発フロー（aegis-bot が基準）への移行にあわせ、旧実装（最終 v0.1.0 系、本番は GitHub 未 push の自動ロール複数対応を含む）を棚卸しして全機能を再実装した。コードの構成・コメント規約・ドキュメント形式を基準に揃え、振る舞い（コマンド定義・文言・閾値・保存形式）は旧実装と一致させた。詳細は DESIGN.md の対応表と判断記録を参照。
- **開発手順を統一した（2026-11-28）**: Issue → ブランチ → PR → Rebase and merge の手順、Conventional Commits＋英語の件名、タグ＋GitHub Release（ノートのみ）のリリース手順を採用した。手順の正本は CONTRIBUTING.md。
- **データ保存形式は変えない**: 本番の `data/mabusaba.db` をそのまま読み続けられるよう、テーブル定義・キー・既定の保存先（`./data/mabusaba.db`）は旧実装と同一にした。旧形式（ギルドに1件）の自動ロールテーブルからの移行処理もそのまま持つ。

## Development

開発手順（Issue → ブランチ → PR → Rebase and merge）とコミット規約は [CONTRIBUTING.md](CONTRIBUTING.md) を参照。設計と判断記録は [DESIGN.md](DESIGN.md)、変更履歴は [CHANGELOG.md](CHANGELOG.md) にある。

## License

MIT — [LICENSE](LICENSE) を参照。
