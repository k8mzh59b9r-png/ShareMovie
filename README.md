# 動画→MOV変換ツール

iPhoneのSafariブラウザ上で、MP4/MOV動画をMOV形式に変換するWebツールです。

## 🔒 セキュリティ

- **動画データはサーバーに一切送信されません**
- すべての変換処理はブラウザ内（ffmpeg.wasm）で完結します
- GitHub PagesにホストされるのはHTML/CSS/JSファイルのみです
- 誰がこのツールを使っても、動画データは各自のデバイス内でのみ処理されます

## 📱 使い方

1. iPhoneのSafariでこのページを開く
2. 「タップしてファイルを選択」をタップ
3. ファイルアプリからMP4またはMOVファイルを選択
4. 「MOVに変換する」をタップ
5. 変換完了後、「ダウンロード」をタップして保存

## 🛠 技術仕様

- **変換方式**: コンテナ変換（コーデックコピー）のため高速
- **対応形式**: MP4, MOV → MOV
- **処理**: [ffmpeg.wasm](https://github.com/nicedoc/ffmpeg.wasm) v0.12.x
- **Cross-Origin Isolation**: [coi-serviceworker](https://github.com/nicedoc/coi-serviceworker)

## ⚠️ 注意事項

- 初回アクセス時にffmpeg.wasmのダウンロード（約30MB）が必要です
- Wi-Fi環境での使用を推奨します
- iOS Safariのメモリ制限により、極端に大きな動画は処理できない場合があります

## 🚀 デプロイ

1. このリポジトリをGitHubにpush
2. Settings → Pages → Source: main branch
3. 公開されたURLにiPhoneのSafariからアクセス
