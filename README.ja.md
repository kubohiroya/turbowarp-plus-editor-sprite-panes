# TurboWarp Plus Editor Sprite Panes

TurboWarp Plus Editor のスプライトと背景の編集タブの中に置くペイン。各ペインは React の部品で、選択中の対象のデータを受け取り、編集をコールバックで返す。ペインをタブや分割に並べるのは `@kubohiroya/turbowarp-plus-editor-layout` の役目。

## ペイン

| export | 役割 |
| --- | --- |
| `./sprite-asset-pane` | `SpriteAssetPane` はコスチュームや音を一覧し、ペインが非アクティブでも選択を保つ。「変数など」では変数を一覧し、値の編集を一度だけ確定し、Scratch と同じ形のダイアログで変数を作成・改名・削除する。`NativeAssetPanel` は GUI 自身の素材一覧を収める |
| `./sprite-message-pane` | `SpriteMessagePane` は「送信」「受信」の2枚のタブで、どのメッセージをどのブロックで送り、どのハットで受け取るかを一覧し、その対象が送る側・受け取る側となるメッセージの関係図を添える。受け取るブロックのない送信と、送るブロックのない受信には警告の印を付ける。メッセージ名は、名前の右の鉛筆から開くダイアログで変える |
| `./sprite-function-pane` | `SpriteFunctionPane` は、スプライトやステージのブロック定義（関数）をアコーディオンで一覧する。並べ方は名前順・Z順（行ごと）・N順（列ごと）から選ぶ。呼び出し関係を左から右（LR）か上から下（TD）に流れる図でも表示でき、図の関数はダイアログで開く。開いた項目ごとに、その定義スクリプトの編集画面をホストが差し込む要素を渡す。`readTargetFunctions` が VM の対象から定義を読む |
| `./sprite-properties` | `SpritePropertiesPanel` は設定フォーム。ペインの幅に合わせて折り返し、選択が変わった場合の古い編集を拒み、VM に更新を反映する。`createSpriteInfoAdapter` は GUI のスプライト情報に接続する |
| `./sprite-editor-toolbar` | `SpriteEditorToolbar` は「コード」「コスチューム / 背景」「音」「変数など」「メッセージ」を切り替える縦のレールと、表示中のセクションの検索欄 |
| `./temporary-variables` | `readTemporaryVariables` は一時変数拡張（`lmsTempVars2`）のうち、コード中で名前を固定テキストで書いたスレッド変数（背景ではランタイム変数も）を、値を入れる関数（ブロック定義）と読み取り・変更の数とともに集める。ランタイム変数では、定義（〜にする）・参照（読む、有無を調べる）・書き換え（〜ずつ変える、削除する）のそれぞれを行う関数を、そのスプライトの名前とともに集める。デバッガーで一時停止している間は、その時点の値と、実行時に名前を組み立てた変数も加える。`watchTemporaryVariables` は一時停止・再開と、一時停止中の値の変化を知らせる。`SpriteAssetPane` は受け取った一覧を、スプライト変数・グローバル変数の後に「スレッド変数」「ランタイム変数」として並べる。ランタイム変数の「参照している関数」「書き換えている関数」には、その関数の数をバッジで添える |
| `./block-image` | `createBlockImageRenderer` は、どの対象のブロックでも、Scratch と同じ見た目で 1 つだけ描く。編集中の対象しか描かない Editor の代わりに、画面外のワークスペースで描いてその複製を返す。ScratchBlocks は Editor が渡し、このパッケージは import しない。`BlockImage` はその絵をペインに置く部品で、描けないときは名前の文字で代える。`hatName` はハットの名前を返す。変数ペインの一時変数の表と、メッセージペインの「から始まるスクリプト」・受信のハットがこれを使う |
| `./script-start` | `scriptStartOf` と `describeScriptStart` は、ブロックがあるスクリプトの始まりを、ハット・関数（ブロック定義）・TurboWarp Plus の名前付き関数のどれかとして返す。メッセージペインの関係図の送信元と、一時変数の表が使う |
| `./native-tile-title` | `observeTileNameTitles` は GUI のスプライト一覧の各タイルに、名前全体をツールチップとして付ける。一覧が後からタイルを差し替えても付け直す |

スタイルシートのあるペインは `<ペイン>.css` として export する。グローバルなスタイルシートとして読み込む。表示は英語で、`locale` が `ja` で始まるときは日本語。

メッセージの読み取りと変数の編集は `@kubohiroya/turbowarp-plus-editor-project-model` を使うので、これらのペインと Editor の作品内検索は作品を同じように判定する。

Editor は GUI の React 16 にこれらを描画するので、React 16.14 以降に対応する。

## 検証

`npm test` でビルドし、React 16.14 より新しい API を使っていないことと、メッセージペインとスプライト情報の接続を確かめる。`npm run test:browser` で素材ペイン、設定フォーム、ツールバーを Chromium で操作する。

npm への公開は `.github/workflows/release.yml` が行う。`package.json` の版が npm にまだ無いときだけ、テストを通したうえで公開する。認証は npm の Trusted Publisher（OIDC）で、npm 側の設定にはこのワークフローのファイル名をそのまま登録する。

## ライセンス

MPL-2.0。`@kubohiroya/turbowarp-plus-editor-layout` から切り出したペインで、その履歴をこのリポジトリに残している。設定フォームは以前のスプライト設定ソース `80825f7` から移設した。GPL のコードを含まず、GPL のモジュールも import しない。
