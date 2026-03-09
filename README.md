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
