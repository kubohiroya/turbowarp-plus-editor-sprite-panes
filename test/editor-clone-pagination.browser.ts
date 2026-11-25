// SPDX-License-Identifier: GPL-3.0-or-later
// Pagination checks from turbowarp-plus-editor/test/editor-layout.browser.ts at 56d8a41.
// The original test license is retained; see LICENSE.GPL-3.0 in this directory.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {expect, type Page} from '@playwright/test';
import {openAssetPane} from './asset-pane-browser-host.ts';

const html = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="/sprite-editor-toolbar.css">
<script src="/react.umd.js"></script>
<script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js","@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit":"/sprite-variable-edit.js"}}</script>
<main class="tw-plus-sprite-toolbar"></main>
<script type="module">
import {SpriteCloneInspector, SpriteClonePagination} from '/sprite-clone-inspector.js';
const listeners = new Map();
const sprite = {clones: []};
const base = {isStage: false, x: 0, y: 0, size: 100, direction: 90,
    visible: true, rotationStyle: 'all around', getName: () => 'Sprite'};
const original = {...base, id: 'sprite', isOriginal: true, sprite, variables: {}};
sprite.clones.push(original);
const emit = event => listeners.get(event)?.forEach(listener => listener());
const vm = {
    runtime: {
        getTargetById: id => sprite.clones.find(target => target.id === id),
        on(event, listener) {listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));},
        removeListener: (event, listener) => listeners.get(event)?.delete(listener),
        requestRedraw() {}
    },
    setVariableValue: () => true
};
window.addClones = (start, count) => {
    const clones = Array.from({length: count}, (_, offset) => ({...base,
        id: 'clone-' + (start + offset), isOriginal: false, sprite, variables: {}}));
    sprite.clones.push(...clones);
    emit('targetWasCreated');
    return clones.map(clone => clone.id);
};
window.removeClone = id => {
    sprite.clones = sprite.clones.filter(target => target.id !== id);
    emit('targetWasRemoved');
};
window.stopClones = () => {
    sprite.clones = [original];
    emit('PROJECT_STOP_ALL');
};
const root = ReactDOM.createRoot(document.querySelector('main'));
ReactDOM.flushSync(() => root.render(React.createElement(SpriteCloneInspector, {vm},
    React.createElement(SpriteClonePagination, {viewId: 'variables', targetId: 'sprite', locale: 'ja'}))));
</script>`;

interface CloneHost {
    addClones(start: number, count: number): string[];
    removeClone(id: string): void;
    stopClones(): void;
}
const addClones = (page: Page, start: number, count: number) => page.evaluate(([start, count]) =>
    (window as unknown as CloneHost).addClones(start, count), [start, count]);
const removeClone = (page: Page, id: string) => page.evaluate(id =>
    (window as unknown as CloneHost).removeClone(id), id);

test('clone pagination changes from numbered buttons to a spaced circular stepper', {timeout: 30_000}, async t => {
    const page = await openAssetPane(t, html);
    const pages = page.getByRole('navigation', {name: 'クローンを切り替える'});
    await expect(pages).toHaveCount(0);
    const ids = await addClones(page, 1, 5);
    const original = pages.getByRole('button', {name: '元のスプライト'});
    await expect(original).toHaveAttribute('aria-current', 'true');
    await expect(pages.getByText('クローン 5 体')).toBeVisible();
    await expect(pages.getByRole('button', {name: /^クローン \d$/})).toHaveCount(5);
    await expect(pages.getByRole('combobox')).toHaveCount(0);
    await pages.getByRole('button', {name: 'クローン 3', exact: true}).click();
    await expect(pages.getByRole('button', {name: 'クローン 3', exact: true})).toHaveAttribute('aria-current', 'true');

    await addClones(page, 6, 1);
    const instance = pages.getByRole('combobox', {name: 'クローン番号を選ぶ'});
    await expect(instance).toHaveValue(ids[2]);
    await expect(pages.getByRole('button', {name: /^クローン \d$/})).toHaveCount(0);
    await addClones(page, 7, 2);
    const next = pages.getByRole('button', {name: '次のクローン'});
    const previous = pages.getByRole('button', {name: '前のクローン'});
    await expect(instance).toHaveValue(ids[2]);
    await expect(instance.locator('option:checked')).toHaveText('3 / 8');
    for (const arrow of [previous, next]) {
        await expect(arrow).toHaveCSS('border-radius', '50%');
        await expect(arrow).toHaveCSS('border-top-width', '1px');
        await expect(arrow.locator('svg')).toHaveCSS('width', '20px');
    }
    const [left, middle, right] = await Promise.all([previous.boundingBox(), instance.boundingBox(), next.boundingBox()]);
    assert.ok(left && middle && right);
    assert.ok(left?.width >= 40 && right?.width >= 40 && middle);
    assert.ok(middle.x - left.x - left.width >= 8 && right.x - middle.x - middle.width >= 8);
    await next.click();
    await expect(instance).toHaveValue(ids[3]);
    await previous.click();
    await expect(instance).toHaveValue(ids[2]);
    await instance.selectOption(ids[0]);
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await instance.selectOption('clone-8');
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();
});

test('clone pagination retains identity on removal and falls back when the selection disappears', {timeout: 30_000}, async t => {
    const page = await openAssetPane(t, html);
    const ids = await addClones(page, 1, 5);
    const pages = page.getByRole('navigation', {name: 'クローンを切り替える'});
    const original = pages.getByRole('button', {name: '元のスプライト'});
    await pages.getByRole('button', {name: 'クローン 3', exact: true}).click();
    await addClones(page, 6, 3);
    const instance = pages.getByRole('combobox', {name: 'クローン番号を選ぶ'});
    await expect(instance).toHaveValue(ids[2]);
    await expect(instance.locator('option:checked')).toHaveText('3 / 8');
    await removeClone(page, ids[0]);
    await expect(instance).toHaveValue(ids[2]);
    await expect(instance.locator('option:checked')).toHaveText('2 / 7');
    await removeClone(page, ids[2]);
    await expect(original).toHaveAttribute('aria-current', 'true');
    await expect(instance.locator('option:checked')).toHaveText('— / 6');
    await instance.selectOption('clone-8');
    await page.evaluate(() => (window as unknown as CloneHost).stopClones());
    await expect(pages).toHaveCount(0);
    await addClones(page, 1, 2);
    await expect(original).toHaveAttribute('aria-current', 'true');
    await expect(pages.getByRole('button', {name: /^クローン \d$/})).toHaveCount(2);
});
