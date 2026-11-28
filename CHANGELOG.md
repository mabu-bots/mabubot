# 変更履歴（CHANGELOG）

## v1.0.0（2026-11-28）

### 追加

- 統一開発フローの土台（Issue / PR テンプレート、CONTRIBUTING、CI ワークフロー、Dependabot）を追加
- ワンコマンドビルド（build.sh / build.bat）を追加
- 自動ロール（複数対応）とプレゼンス・サイクルの単体テストを追加

### 変更

- ゼロから再実装し、バージョンを 1.0.0 に振り直した。旧実装（v0.1.0 系、本番は GitHub 未 push の自動ロール複数対応を含む）の全機能・全コマンドを再現し、保存形式（SQLite `data/mabusaba.db`）は旧実装と同一に保った
- テストの配置を `src/test/` からルートの `tests/` に移し、ビルド成果物を `dist/src/` と `dist/tests/` に分けた（aegis-bot の構成に統一）
- パッケージ名を `mabusaba-bot` から `mabubot` に変えた（pm2 アプリ名 `mabusaba` と DB ファイル名は据え置き）
- CI を ci.yml のみに集約した（旧リポジトリの Format 自動修正・CodeQL・Stale・Lock Threads・Release Drafter のワークフローは不採用。Dependabot は継続）
- コメント規約（バナー見出し＋絵文字マーカー）とドキュメント形式（README のメタ表・コマンド表・環境変数表・判断記録）を基準に統一した
