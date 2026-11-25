// SPDX-License-Identifier: GPL-3.0-or-later
// Checks from turbowarp-plus-editor/test/editor-layout.browser.ts at 07ce8cb.
// The original test license is retained; see LICENSE.GPL-3.0 in this directory.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {expect, type Page} from '@playwright/test';
import {openAssetPane} from './asset-pane-browser-host.ts';

const html = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="/sprite-asset-pane.css">
<script src="/react.umd.js"></script>
<script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js","@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit":"/sprite-variable-edit.js"}}</script>
<main style="width: 680px; height: 460px"></main>
<script type="module">
import {SpriteAssetPane} from '/sprite-asset-pane.js';
const root = ReactDOM.createRoot(document.querySelector('main'));
let variables = [
    {id: 'list-colors', name: 'Colors', value: ['赤', 20, '青', '緑', '黒', '白'],
        accesses: {read: 1, write: 1, open() {}}},
    {id: 'list-count', name: 'Count', value: 0, accesses: {read: 0, write: 0, open() {}}}
];
window.listWrites = [];
function render() {
    ReactDOM.flushSync(() => root.render(React.createElement(SpriteAssetPane, {
        kind: 'variables', locale: 'ja', editable: true, variables,
        onEdit() {},
        onWrite(id, value) {
            window.listWrites.push([id, value]);
            variables = variables.map(variable => variable.id === id ? {...variable, value} : variable);
            render();
        }
    })));
}
render();
</script>`;

const readWrites = (page: Page) => page.evaluate(() =>
    (window as unknown as {listWrites: [string, (string | number)[]][]}).listWrites);

test('mixed variable rows retain their previews, access counts and sorting', {timeout: 30_000}, async t => {
    const page = await openAssetPane(t, html);
    const pane = page.getByRole('region', {name: 'スプライト変数', exact: true});
    const row = (label: string) => pane.getByRole('row').filter({has: page.getByRole('rowheader', {name: new RegExp(`^${label}(?: 変数名を変更)?$`)})});
    const colors = row('Colors');
    await expect(colors.getByRole('img', {name: 'リスト', exact: true})).toHaveAttribute('title', 'リスト');
    await expect(row('Count').getByRole('img', {name: '変数', exact: true})).toHaveAttribute('title', '変数');
    await expect(colors.getByRole('listitem')).toHaveText(['赤', '20', '青', '緑', '黒', '+1']);
    await expect(colors.getByRole('link', {name: 'Colors: 読み取り 1'})).toBeVisible();
    await expect(colors.getByRole('link', {name: 'Colors: 変更 1'})).toBeVisible();

    await expect(pane.getByRole('columnheader', {name: '操作', exact: true}).getByRole('button')).toHaveCount(0);
    const reads = pane.getByRole('columnheader', {name: '読み取り', exact: true});
    const writes = pane.getByRole('columnheader', {name: '変更', exact: true});
    await expect(colors.getByRole('link', {name: 'Colors: 読み取り 1'})).toHaveText('1');
    await expect(colors.getByRole('link', {name: 'Colors: 変更 1'})).toHaveText('1');
    await reads.getByRole('button').click();
    await expect(pane.getByRole('rowheader')).toHaveText(['Count', 'Colors']);
    await writes.getByRole('button').click();
    await expect(writes).toHaveAttribute('aria-sort', 'ascending');
    await writes.getByRole('button').click();
    await expect(pane.getByRole('rowheader')).toHaveText(['Colors', 'Count']);

    const kind = pane.getByRole('columnheader', {name: '種類', exact: true});
    await kind.getByRole('button').click();
    await expect(kind).toHaveAttribute('aria-sort', 'ascending');
    await expect(pane.getByRole('rowheader')).toHaveText(['Count', 'Colors']);
    await kind.getByRole('button').click();
    await expect(kind).toHaveAttribute('aria-sort', 'descending');
    await expect(pane.getByRole('rowheader')).toHaveText(['Colors', 'Count']);
});

test('list editing cancels without writing and commits the edited items once', {timeout: 30_000}, async t => {
    const page = await openAssetPane(t, html);
    const pane = page.getByRole('region', {name: 'スプライト変数', exact: true});
    const row = (label: string) => pane.getByRole('row').filter({has: page.getByRole('rowheader', {name: new RegExp(`^${label}(?: 変数名を変更)?$`)})});
    const colors = row('Colors');
    const edit = colors.getByRole('button', {name: '編集', exact: true});
    await expect(edit).toHaveCSS('opacity', '0');
    await colors.hover();
    await expect(edit).toHaveCSS('opacity', '1');
    await edit.click();
    const dialog = page.getByRole('dialog', {name: 'リストを編集：Colors', exact: true});
    assert.equal(await dialog.evaluate(element => getComputedStyle(element, '::backdrop').backgroundColor),
        'rgba(23, 33, 42, 0.5)');
    const item = (position: number) => dialog.getByRole('textbox', {name: `項目 ${position}`, exact: true});
    const save = dialog.getByRole('button', {name: '保存', exact: true});
    await expect(item(6)).toHaveValue('白');
    await item(1).fill('取り消す');
    await dialog.getByRole('button', {name: 'キャンセル', exact: true}).click();
    await expect(colors.getByRole('listitem').first()).toHaveText('赤');
    assert.deepEqual(await readWrites(page), []);
    await colors.hover();
    await edit.click();
    await item(2).fill('25');
    await dialog.getByRole('button', {name: '項目 2 を上に移動'}).click();
    await dialog.getByRole('button', {name: '項目 3 を削除'}).click();
    await dialog.getByRole('button', {name: '項目を追加'}).click();
    await expect(item(6)).toBeFocused();
    await item(6).fill('紫');
    await save.click();
    assert.deepEqual(await readWrites(page), [['list-colors', [25, '赤', '緑', '黒', '白', '紫']]]);
    await expect(dialog).toBeHidden();
});
