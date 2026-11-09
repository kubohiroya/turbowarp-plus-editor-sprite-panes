# TurboWarp Plus Editor Sprite Panes

TurboWarp Plus Editor のスプライトと背景の編集タブの中に置くペイン。各ペインは React の部品で、選択中の対象のデータを受け取り、編集をコールバックで返す。ペインをタブや分割に並べるのは `@kubohiroya/turbowarp-plus-editor-layout` の役目。

## ペイン

| export | 役割 |
| --- | --- |
| `./sprite-asset-pane` | `SpriteAssetPane` はコスチュームや音を一覧し、ペインが非アクティブでも選択を保つ。「変数など」では変数を一覧し、値の編集を一度だけ確定し、Scratch と同じ形のダイアログで変数を作成・改名・削除する。`NativeAssetPanel` は GUI 自身の素材一覧を収める |
| `./sprite-message-pane` | `SpriteMessagePane` は、どのメッセージをどのブロックで送り、どのハットで受け取るかを送信・受信の2群で一覧する。送信だけ・受信だけ・この対象では使っていないメッセージも分かる。背景では作品全体を「対象」-「メッセージ」-「対象」の図に描き、一覧と図からメッセージ名を変更できる |
| `./sprite-properties` | `SpritePropertiesPanel` は設定フォーム。ペインの幅に合わせて折り返し、選択が変わった場合の古い編集を拒み、VM に更新を反映する。`createSpriteInfoAdapter` は GUI のスプライト情報に接続する |
| `./sprite-editor-toolbar` | `SpriteEditorToolbar` は「コード」「コスチューム / 背景」「音」「変数など」「メッセージ」を切り替える縦のレールと、表示中のセクションの検索欄 |
| `./native-tile-title` | `observeTileNameTitles` は GUI のスプライト一覧の各タイルに、名前全体をツールチップとして付ける。一覧が後からタイルを差し替えても付け直す |

スタイルシートのあるペインは `<ペイン>.css` として export する。グローバルなスタイルシートとして読み込む。表示は英語で、`locale` が `ja` で始まるときは日本語。

メッセージの読み取りと変数の編集は `@kubohiroya/turbowarp-plus-editor-project-model` を使うので、これらのペインと Editor の作品内検索は作品を同じように判定する。

Editor は GUI の React 16 にこれらを描画するので、React 16.14 以降に対応する。

## 検証

`npm test` でビルドし、React 16.14 より新しい API を使っていないことと、メッセージペインとスプライト情報の接続を確かめる。`npm run test:browser` で素材ペイン、設定フォーム、ツールバーを Chromium で操作する。

npm への公開は `.github/workflows/release.yml` が行う。`package.json` の版が npm にまだ無いときだけ、テストを通したうえで公開する。認証は npm の Trusted Publisher（OIDC）で、npm 側の設定にはこのワークフローのファイル名をそのまま登録する。

## ライセンス

MPL-2.0。`@kubohiroya/turbowarp-plus-editor-layout` から切り出したペインで、その履歴をこのリポジトリに残している。設定フォームは以前のスプライト設定ソース `80825f7` から移設した。GPL のコードを含まず、GPL のモジュールも import しない。
