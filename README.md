# 🫧 Bubble AR

内カメラ（フロントカメラ）の映像をブラウザ内でリアルタイム処理する Web アプリです。

- 5本指のキーポイントを検出して、指ごとに色分けして光らせる
- 5本の指に当たり判定を持つ、ぷかぷか浮かぶ2Dの泡を触って変形できる
- 泡越しに見える映像にぼかしエフェクトがかかる

すべてブラウザ内（MediaPipe + Canvas）で完結する静的サイトで、サーバ側の処理はありません。
そのため **GitHub Pages にそのまま公開できます**（Pages は HTTPS 配信なので `getUserMedia` が動作します）。

## 公開（GitHub Pages）

このリポジトリは `docs/` 配下の静的ファイルを GitHub Pages に公開する構成です。
`.github/workflows/deploy.yml` が `main` への push で自動デプロイします。

初回のセットアップ:

1. GitHub にリポジトリを作成して push する
   ```powershell
   git init
   git add -A
   git commit -m "Bubble AR"
   git branch -M main
   git remote add origin https://github.com/<YOUR_NAME>/AR-demo.git
   git push -u origin main
   ```
2. GitHub のリポジトリ → **Settings → Pages → Build and deployment → Source** を
   **GitHub Actions** に設定する
3. 以降は `main` に push するたびに自動で再デプロイされます
4. 公開 URL: `https://<YOUR_NAME>.github.io/AR-demo/`

> Actions を使わず **Settings → Pages → Deploy from a branch → `main` / `/docs`** を
> 選ぶ方法でも公開できます（その場合ワークフローは不要）。

## ローカルでの確認（任意）

公開前にローカルや実機で試したいとき用に、ローカルサーバ + Cloudflare トンネルの
タスクを用意しています（公開自体には不要）。

| ツール | 用途 | 備考 |
|--------|------|------|
| [Task (go-task)](https://taskfile.dev/installation/) | 起動/停止 | `winget install Task.Task` |
| Python 3 | 静的ファイル配信 | `python -m http.server` を使用 |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | 実機テスト用トンネル | `winget install --id Cloudflare.cloudflared` |

```powershell
task up      # docs/ をローカル配信し、公開URL(https://xxxx.trycloudflare.com)を表示
task url     # 公開URLを再表示
task down    # 停止
task restart # 再起動
```

ローカルだけなら `http://localhost:8080` でも動作します（localhost は HTTPS 不要）。

## 操作

1. 「Start camera」を押してカメラ権限を許可
2. 手をカメラに映すと、5本の指先が指ごとの色で光ります
3. 浮かんでいる泡を指で触ると、ぷにぷに変形します
4. 泡に重なった部分の映像はぼやけて見えます

## カスタマイズ

見た目や挙動は [`docs/main.js`](docs/main.js) 冒頭の `CONFIG` で調整できます。

| 項目 | 説明 |
|------|------|
| `fingerRadius` | 指の当たり判定の大きさ |
| `glowRadius` | 指先の光の大きさ |
| `blurPx` | 泡越しのぼかしの強さ |
| `bubble.radius` | 泡の大きさ |
| `bubble.pressure` | 弾力（大きいほど硬く戻る） |
| `bubble.drift` | 浮遊スピード |

## 構成

```
AR-demo/
├─ docs/                  # GitHub Pages で公開される静的サイト
│  ├─ index.html
│  ├─ style.css
│  ├─ main.js             # 手検出 + ソフトボディ物理 + 描画
│  └─ .nojekyll           # Jekyll 処理を無効化
├─ .github/workflows/
│  └─ deploy.yml          # main への push で Pages へ自動デプロイ
├─ Taskfile.yml           # ローカル確認用 (task up / down / url / restart)
├─ scripts/
│  ├─ up.ps1              # docs/ をローカル配信 + トンネル起動（PID管理）
│  └─ down.ps1            # PID から停止
└─ .run/                  # 実行時の PID / URL (自動生成・git管理外)
```

## 動作環境

Chrome / Edge / Safari（iOS 16+）などの新しめのブラウザを推奨します。
`HandLandmarker` は WebAssembly + GPU(WebGL) を利用します。
