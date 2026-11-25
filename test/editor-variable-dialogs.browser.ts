// SPDX-License-Identifier: GPL-3.0-or-later
// Dialog checks from turbowarp-plus-editor/test/editor-layout.browser.ts at 6e8767a.
// The original test license is retained; see LICENSE.GPL-3.0 in this directory.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {expect, type Locator, type Page} from '@playwright/test';
import type {SpriteVariableEdit, SpriteVariableEditError} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';
import {openAssetPane} from './asset-pane-browser-host.ts';

const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/dialog-styles.css">
<link rel="stylesheet" href="/sprite-asset-pane.css">
<script src="/react.umd.js"></script><script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js","@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit":"/sprite-variable-edit.js"}}</script>
<main style="width: 680px; height: 460px"></main>
<script type="module">
import {SpriteAssetPane} from '/sprite-asset-pane.js';
const root = ReactDOM.createRoot(document.querySelector('main'));
const variables = [{id: 'score', name: '得点', value: 0}, {id: 'list', name: '持ち物', value: []}];
window.edits = [];
window.dialogError = undefined;
window.mountVariablePane = global => ReactDOM.flushSync(() => root.render(React.createElement(SpriteAssetPane, {
    key: global ? 'global' : 'local', kind: 'variables', locale: 'ja', editable: true, variables,
    global: global ? {canAddCloudVariable: true} : undefined,
    onWrite() {}, onEdit(edit) {window.edits.push(edit); return window.dialogError;}
})));
window.mountVariablePane(false);
</script>`;

interface DialogHost {
    edits: SpriteVariableEdit[];
    dialogError: SpriteVariableEditError | undefined;
    mountVariablePane(global: boolean): void;
}
const readEdits = (page: Page) => page.evaluate(() => (window as unknown as DialogHost).edits);
const actionIcons = (dialog: Locator) => dialog.locator('button[data-dialog-action]').evaluateAll(buttons =>
    buttons.map(button => getComputedStyle(button, '::before').maskImage));

test('local variable creation shares dialog icons and supports list-tab keyboard commands', {timeout: 30_000}, async t => {
    const page = await openAssetPane(t, html);
    const pane = page.getByRole('region', {name: 'スプライト変数', exact: true});
    const create = page.getByRole('dialog', {name: '新しいスプライト変数', exact: true});
    const startCreate = () => pane.getByRole('button', {name: '新しいスプライト変数を追加', exact: true}).click();
    const variableTab = create.getByRole('tab', {name: '変数', exact: true});
    const listTab = create.getByRole('tab', {name: 'リスト', exact: true});
    await startCreate();
    await expect(variableTab).toHaveAttribute('aria-selected', 'true');
    await expect(variableTab.locator('svg')).toBeVisible();
    await expect(listTab.locator('svg')).toBeVisible();
    assert.equal(await create.evaluate(dialog => getComputedStyle(dialog, '::backdrop').backgroundColor),
        'rgba(23, 33, 42, 0.5)');
    const creationIcons = await actionIcons(create);
    assert.equal(creationIcons.length, 2);
    assert.ok(creationIcons.every(icon => icon.startsWith('url(')));
    await expect(create.getByRole('checkbox')).toHaveCount(0);
    await variableTab.press('ArrowRight');
    await expect(listTab).toBeFocused();
    await expect(listTab).toHaveAttribute('aria-selected', 'true');
    await expect(create.getByRole('checkbox')).toHaveCount(0);
    const createdList = create.getByRole('tabpanel', {name: 'リスト'}).getByRole('textbox', {name: '新しいリスト名:'});
    await createdList.fill('持ち物');
    await createdList.press('Enter');
    await expect(create).toHaveCount(0);
    assert.deepEqual(await readEdits(page), [{type: 'create', name: '持ち物', variableType: 'list'}]);
    const localList = pane.getByRole('row').filter({has: page.getByRole('rowheader', {name: '持ち物', exact: true})});
    await localList.hover();
    await localList.getByRole('button', {name: '編集', exact: true}).click();
    const listEditor = page.getByRole('dialog', {name: 'リストを編集：持ち物', exact: true});
    assert.deepEqual(await actionIcons(listEditor), creationIcons);
    await listEditor.getByRole('button', {name: 'キャンセル', exact: true}).click();
    await startCreate();
    await expect(variableTab).toHaveAttribute('aria-selected', 'true');
    await create.getByRole('button', {name: 'キャンセル', exact: true}).click();
    assert.deepEqual(await readEdits(page), [{type: 'create', name: '持ち物', variableType: 'list'}]);
});

test('global creation describes port errors and resets the cloud choice between dialogs', {timeout: 30_000}, async t => {
    const page = await openAssetPane(t, html);
    await page.evaluate(() => (window as unknown as DialogHost).mountVariablePane(true));
    const pane = page.getByRole('region', {name: 'グローバル変数', exact: true});
    const create = page.getByRole('dialog', {name: '新しいグローバル変数', exact: true});
    const startCreate = () => pane.getByRole('button', {name: '新しいグローバル変数を追加', exact: true}).click();
    const submitCreate = () => create.getByRole('button', {name: '作成', exact: true}).click();
    const variableTab = create.getByRole('tab', {name: '変数', exact: true});
    const listTab = create.getByRole('tab', {name: 'リスト', exact: true});
    const cloudOption = create.getByRole('checkbox', {name: 'クラウド変数'});
    await startCreate();
    await expect(cloudOption).not.toBeChecked();
    const globalName = create.getByRole('textbox');
    const nameError = '同じ名前の変数がすでにあります。';
    await page.evaluate(() => {(window as unknown as DialogHost).dialogError = 'duplicateName';});
    await globalName.fill('得点');
    await submitCreate();
    await expect(create.getByRole('alert')).toHaveText(nameError);
    await expect(globalName).toHaveAccessibleDescription(nameError);
    assert.equal(await globalName.evaluate(input => input.nextElementSibling?.getAttribute('role')), 'alert');
    assert.equal(await cloudOption.evaluate(input => input.parentElement?.previousElementSibling?.getAttribute('role')), 'alert');
    await page.evaluate(() => {(window as unknown as DialogHost).dialogError = undefined;});
    await globalName.fill('作品用');
    await submitCreate();
    await expect(create).toHaveCount(0);
    await startCreate();
    await create.getByRole('textbox').fill('ランキング');
    await cloudOption.check();
    await submitCreate();
    await startCreate();
    await expect(variableTab).toHaveAttribute('aria-selected', 'true');
    await cloudOption.check();
    await listTab.click();
    await expect(listTab).toHaveAttribute('aria-selected', 'true');
    await expect(create.locator('[name="isCloud"]')).toHaveCount(0);
    await create.getByRole('tabpanel', {name: 'リスト'}).getByRole('textbox', {name: '新しいリスト名:'}).fill('作品用');
    await submitCreate();
    await startCreate();
    await expect(variableTab).toHaveAttribute('aria-selected', 'true');
    await expect(cloudOption).not.toBeChecked();
    await create.getByRole('button', {name: 'キャンセル'}).click();
    assert.deepEqual(await readEdits(page), [
        {type: 'create', name: '得点'}, {type: 'create', name: '作品用'},
        {type: 'create', name: 'ランキング', isCloud: true},
        {type: 'create', name: '作品用', variableType: 'list'}
    ]);
});
