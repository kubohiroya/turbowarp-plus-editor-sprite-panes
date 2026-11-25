// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation checks from Editor editor-layout.browser.ts; see LICENSE.GPL-3.0.
import {test} from 'node:test';
import {expect} from '@playwright/test';
import {openAssetPane} from './asset-pane-browser-host.ts';

const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/sprite-asset-pane.css">
<script src="/react.umd.js"></script>
<script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js","@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit":"/sprite-variable-edit.js"}}</script>
<main style="width: 680px; height: 460px"></main>
<script type="module">
import {SpriteAssetPane} from '/sprite-asset-pane.js';
const root = ReactDOM.createRoot(document.querySelector('main'));
const localVariables = [{id: 'local-score', name: '得点', value: 17}];
const projectVariables = [
    {id: 'project-score', name: '得点', value: 23},
    {id: 'cloud-score', name: '☁ 記録', value: 0, isCloud: true},
    {id: 'legacy-cloud', name: '共有記録', value: 0, isCloud: true},
    {id: 'plain-cloud-name', name: '☁ メモ', value: 0, isCloud: false},
    {id: 'project-list', name: 'リスト', value: []}
];
window.showVariables = global => ReactDOM.flushSync(() => root.render(React.createElement(SpriteAssetPane, {
    key: global ? 'global' : 'local', kind: 'variables', locale: 'ja', editable: true,
    global: global ? {canAddCloudVariable: true} : undefined,
    variables: global ? projectVariables : localVariables, onWrite() {}, onEdit() {}
})));
window.showVariables(false);
</script>`;

test('variable rows distinguish a cloud flag from a cloud glyph and distinguish lists', async t => {
    const page = await openAssetPane(t, html);
    const local = page.getByRole('region', {name: 'スプライト変数', exact: true});
    await expect(local.getByText('このスプライト専用の変数です。')).toBeVisible();
    await expect(local.getByRole('rowheader')).toHaveText(['得点']);
    await expect(local.getByRole('img', {name: 'クラウド変数', exact: true})).toHaveCount(0);
    await expect(local.locator('.tw-sprite-variables__scope')).toHaveCount(0);

    await page.evaluate(() => (window as unknown as {showVariables(global: boolean): void}).showVariables(true));
    const project = page.getByRole('region', {name: 'グローバル変数', exact: true});
    await expect(project.getByText('このステージとすべてのスプライトで参照・利用できる変数です。')).toBeVisible();
    await expect(project.getByRole('rowheader')).toHaveText(['得点', '記録 ☁︎', '共有記録 ☁︎', '☁ メモ', 'リスト']);
    const cloud = project.getByRole('img', {name: 'クラウド変数', exact: true});
    await expect(cloud).toHaveCount(2);
    await expect(cloud.first()).toHaveCSS('color', 'rgb(35, 153, 194)');
    await expect(project.getByRole('rowheader', {name: '☁ メモ'}).getByRole('img')).toHaveCount(0);
    await expect(project.getByRole('img', {name: 'リスト', exact: true})).toHaveCount(1);
    await expect(project.locator('.tw-sprite-variables__scope')).toHaveCount(0);
    await expect(project.getByRole('textbox', {name: '得点', exact: true})).toHaveValue('23');
});
