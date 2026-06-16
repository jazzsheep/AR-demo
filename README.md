# 🫧 Bubble AR

内カメラ（フロントカメラ）の映像をブラウザ内でリアルタイム処理する Web アプリです。

- 5本指のキーポイントを検出して、指ごとに色分けして光らせる
- 5本の指に当たり判定を持つ、ぷかぷか浮かぶ2Dの泡を触って変形できる
- 泡越しに見える映像にぼかしエフェクトがかかる

すべてブラウザ内（MediaPipe + Canvas）で動作し、サーバ側での映像処理はありません。
Cloudflare のクイックトンネルで HTTPS 配信します（`getUserMedia` は HTTPS / localhost 必須）。

## 必要なもの

| ツール | 用途 | 備考 |
|--------|------|------|
| [Task (go-task)](https://taskfile.dev/installation/) | 起動/停止 | `winget install Task.Task` など |
| Python 3 | 静的ファイル配信 | `python -m http.server` を使用 |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | 公開トンネル | `winget install --id Cloudflare.cloudflared` |

> クイックトンネル（`*.trycloudflare.com`）を使うため Cloudflare アカウントは不要です。

## 使い方

```powershell
# 起動（静的サーバ + トンネル）。最後に公開URLが表示されます
task up

# 公開URLをもう一度確認したいとき
task url

# 停止
task down

# 再起動
task restart
```

`task up` を実行すると `https://xxxx.trycloudflare.com` のような URL が表示されます。
スマホや PC のブラウザでその URL を開き、「カメラを開始」をタップしてください。

ローカルだけで試す場合は `http://localhost:8080` でも動作します（localhost は HTTPS 不要）。

## 操作

1. 「カメラを開始」を押してカメラ権限を許可
2. 手をカメラに映すと、親指（マゼンタ）と人差し指（シアン）が光ります
3. 浮かんでいる泡を指で触ると、ぷにぷに変形します
4. 泡に重なった部分の映像はぼやけて見えます

## カスタマイズ

見た目や挙動は [`src/main.js`](src/main.js) 冒頭の `CONFIG` で調整できます。

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
├─ Taskfile.yml        # task up / down / url / restart
├─ scripts/
│  ├─ up.ps1           # サーバ + トンネル起動、公開URL取得（PID管理）
│  └─ down.ps1         # PID から停止
├─ src/
│  ├─ index.html
│  ├─ style.css
│  └─ main.js          # 手検出 + ソフトボディ物理 + 描画
└─ .run/               # 実行時の PID / URL (自動生成)
```

## 動作環境

Chrome / Edge / Safari（iOS 16+）などの新しめのブラウザを推奨します。
`HandLandmarker` は WebAssembly + GPU(WebGL) を利用します。
