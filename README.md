# Progress Atlas

英単語帳1000問の進行を `〇 / △ / ✕ / 未記録` で管理する静的ウェブアプリです。

## GitHub Pages で公開する手順

1. このフォルダを GitHub リポジトリに push します。
2. GitHub の `Settings > Pages` を開きます。
3. `Source` は `GitHub Actions` を選びます。
4. `main` または `master` へ push すると、[`.github/workflows/deploy-pages.yml`](/mnt/c/Projects/AI/Progress/.github/workflows/deploy-pages.yml) が自動で公開します。
5. 公開URLは通常 `https://<GitHubユーザー名>.github.io/<リポジトリ名>/` です。

## 公開対象

GitHub Pages には次の静的ファイルだけを公開します。

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`

ローカル HTTPS 用の証明書や補助スクリプトは公開対象に含めません。

## 補足

- 学習データは各ブラウザの `localStorage` に保存されます。
- GitHub Pages に置いても、PC とスマホで記録内容は自動同期されません。
- 旧URLやローカル版から移行する場合は、元の画面で `データ書き出し` を行い、新しい画面で `データ読み込み` を使って移行できます。

## GitHub 自動同期

GitHub Pages 版には、同じリポジトリの `sync-data` ブランチへ進行を保存する自動同期機能があります。

1. GitHub の fine-grained personal access token を作成します。
2. 対象リポジトリは `studyplusx/ProgressAtlas` だけに絞ります。
3. Repository permissions で `Contents: Read and write` を付けます。
4. アプリ上の `GitHub 自動同期` カードに `Owner / Repository / Branch / Token` を入力します。
5. `同期設定を保存` を押すと、以後は各端末から自動で同期されます。

注意:

- Token はこの端末のブラウザに保存されます。
- 端末ごとに一度だけ同じ token を入力してください。
- 同期データ本体は `sync/progress.json` に保存されます。
