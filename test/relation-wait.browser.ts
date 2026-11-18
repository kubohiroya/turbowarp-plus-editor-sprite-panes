import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
const messageScanner = require.resolve('@kubohiroya/turbowarp-plus-editor-project-model/project-messages');

async function openPane(t) {
    const browser = await chromium.launch({headless: true});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 800, height: 600}});
    const origin = 'http://relation-wait.test';
    const files = new Map([
        ['/pane.js', fileURLToPath(new URL('../dist/sprite-function-pane.js', import.meta.url))],
        ['/pane.css', fileURLToPath(new URL('../src/sprite-asset-pane.css', import.meta.url))],
        ['/react-umd.js', path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js')],
        ['/react-dom-umd.js', path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js')]
    ]);
    await page.route(origin + '/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/project-messages.js') return route.fulfill({contentType: 'application/javascript', body: await readFile(messageScanner)});
        if (pathname === '/message-call-graph.js') return route.fulfill({contentType: 'application/javascript',
            body: (await readFile(new URL('../dist/message-call-graph.js', import.meta.url), 'utf8')).replace("'@kubohiroya/turbowarp-plus-editor-project-model/project-messages'", "'/project-messages.js'")});
        if (pathname === '/') return route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="ja">
            <link rel="stylesheet" href="/pane.css"><style>#root{width:600px;height:400px}</style><div id="root"></div>
            <script src="/react-umd.js"></script><script src="/react-dom-umd.js"></script>
            <script type="importmap">{"imports":{"react":"/react.js"}}</script></html>`});
        if (pathname === '/react.js') return route.fulfill({contentType: 'application/javascript', body: 'export default window.React;'});
        const file = files.get(pathname);
        return file ? route.fulfill({body: await readFile(file), contentType: pathname.endsWith('.css') ? 'text/css' : 'application/javascript'}) :
            route.fulfill({status: 404});
    });
    await page.goto(origin);
    return page;
}

test('the graph wait badge is a readable vector beside its line with a hoverable meaning', {timeout: 30_000}, async t => {
    const page = await openPane(t);
    await page.evaluate(async () => {
        const {SpriteFunctionPane} = await import('/pane.js');
        const {React, ReactDOM} = globalThis as any;
        const node = {id: 'jump', kind: 'procedure', proccode: 'jump', argumentNames: [], warp: false,
            x: 0, y: 0, calls: 1, scriptCalls: 0, callees: []};
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(SpriteFunctionPane, {
            kind: 'functions', locale: 'ja', editable: true, view: 'graph', direction: 'TD',
            relationVisibility: {function: false, message: true}, data: {targetId: 'cat', isStage: false, functions: [node],
                scripts: [{targetId: 'cat', scriptId: 'receive', label: 'go を受け取ったとき'}], scriptRelations: [{
                    kind: 'message', label: 'go', wait: true, source: {targetId: 'cat', scriptId: 'jump', blockId: 'wait'},
                    destination: {targetId: 'cat', scriptId: 'receive', blockId: 'receive'}
                }]}}));
    });
    const badge = page.locator('.tw-sprite-functions__relation-wait');
    await badge.waitFor();
    const inspect = () => badge.evaluate(group => {
        const rect = group.querySelector('rect').getBoundingClientRect();
        const line = document.querySelector<SVGPathElement>('.tw-sprite-functions__edges > path[data-wait="true"]');
        const bounds = line.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return {width: rect.width, height: rect.height, title: group.querySelector('title').textContent,
            glyph: group.querySelector('path').getAttribute('d'), text: group.querySelector('text')?.textContent,
            separate: rect.right < bounds.left || rect.left > bounds.right || rect.bottom < bounds.top || rect.top > bounds.bottom,
            hit: document.elementFromPoint(x, y)?.closest('.tw-sprite-functions__relation-wait') === group};
    });
    let result = await inspect();
    assert.ok(Math.abs(result.width - 20) < .1 && Math.abs(result.height - 20) < .1);
    assert.equal(result.title, '送って待つ');
    assert.equal(result.glyph, 'M1 1h14M1 15h14M2 1v3l12 8v3M14 1v3l-12 8v3M2 4h12M2 12h12');
    assert.equal(result.text, undefined);
    assert.equal(result.separate, true, 'the badge and line bounding boxes do not overlap');
    assert.equal(result.hit, true, 'the native title is reachable at the badge center');
    await badge.hover();
    await page.getByRole('button', {name: '拡大', exact: true}).click();
    result = await inspect();
    assert.ok(Math.abs(result.width - 20) < .1 && Math.abs(result.height - 20) < .1);
    assert.equal(result.separate, true);
});

test('dragging a graph node follows zoom, preserves navigation, and commits or cancels only diagram settings', {timeout: 30_000}, async t => {
    const page = await openPane(t);
    await page.evaluate(async () => {
        const {SpriteFunctionPane} = await import('/pane.js');
        const {React, ReactDOM} = globalThis as any;
        const node = (id: string) => ({id, kind: 'procedure', proccode: id, argumentNames: [], warp: false,
            x: 0, y: 0, calls: 1, scriptCalls: 0, callees: []});
        const endpoint = (id: string) => ({targetId: 'cat', scriptId: id, blockId: id});
        const recorded = {settings: [] as any[], opened: [] as string[], root: undefined as any};
        (globalThis as any).dragFixture = recorded;
        recorded.root = ReactDOM.createRoot(document.getElementById('root'));
        recorded.root.render(React.createElement(SpriteFunctionPane, {kind: 'functions', locale: 'ja', editable: true,
            view: 'graph', direction: 'TD', selectedId: 'worker', onSettingsChange: value => recorded.settings.push(value),
            onOpenFunction: fn => recorded.opened.push(fn.id), data: {targetId: 'cat', isStage: false,
                functions: [node('entry'), node('worker')], scriptRelations: [
                    {kind: 'function', source: endpoint('entry'), destination: endpoint('worker'), label: 'worker', wait: true},
                    {kind: 'function', source: endpoint('worker'), destination: endpoint('worker'), label: 'worker', wait: true},
                    {kind: 'message', source: endpoint('entry'), destination: endpoint('worker'), label: 'ready', wait: true}
                ]}}));
    });
    const worker = page.locator('[data-function-key="worker"]');
    const figure = page.locator('figure');
    const point = () => worker.evaluate(node => ({x: parseFloat((node.parentElement as HTMLElement).style.left),
        y: parseFloat((node.parentElement as HTMLElement).style.top)}));
    await worker.waitFor();
    await page.getByRole('button', {name: '拡大', exact: true}).click();
    const start = await point();
    const canvas = page.locator('.tw-sprite-functions__canvas');
    const transform = await canvas.evaluate(node => (node as HTMLElement).style.transform);
    const incident = page.locator('.tw-sprite-functions__edges > path[data-edge="entry>worker"]').first();
    const self = page.locator('.tw-sprite-functions__edges > path[data-edge="worker>worker"]');
    const message = page.locator('.tw-sprite-functions__edge-label[data-edge="entry>worker"]');
    const before = {edge: await incident.getAttribute('d'), self: await self.getAttribute('d'), label: await message.getAttribute('transform')};
    const box = await worker.boundingBox();
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + box.height / 2 + 36, {steps: 5});
    await page.waitForFunction(() => document.querySelector('figure').getAttribute('data-node-dragging') === 'worker');
    let current = await point();
    assert.ok(Math.abs(current.x - start.x - 50) < .1 && Math.abs(current.y - start.y - 30) < .1);
    assert.equal(await figure.getAttribute('data-panning'), null);
    assert.equal(await canvas.evaluate(node => (node as HTMLElement).style.transform), transform, 'bounds changes do not move the viewport during a drag');
    assert.notEqual(await incident.getAttribute('d'), before.edge);
    assert.notEqual(await self.getAttribute('d'), before.self);
    assert.notEqual(await message.getAttribute('transform'), before.label);
    const mini = page.locator('[data-node-key="worker"]');
    assert.ok(Math.abs(Number(await mini.getAttribute('x')) - current.x) < .1);
    await page.mouse.up();
    await page.waitForFunction(() => (globalThis as any).dragFixture.settings.length === 1);
    assert.equal(await figure.getAttribute('data-node-dragging'), null);
    assert.equal(await canvas.evaluate(node => (node as HTMLElement).style.transform), transform, 'release does not recenter the graph');
    const recorded = await page.evaluate(() => (globalThis as any).dragFixture.settings.at(-1));
    assert.deepEqual(recorded.graphPositions.cat.TD.worker, current);
    assert.deepEqual(await page.evaluate(() => (globalThis as any).dragFixture.opened), [], 'the release click does not open a function');
    await worker.press('Enter');
    await page.waitForFunction(() => (globalThis as any).dragFixture.opened.length === 1);
    assert.deepEqual(await page.evaluate(() => (globalThis as any).dragFixture.opened), ['worker']);

    const next = await worker.boundingBox();
    await page.mouse.move(next.x + 20, next.y + next.height / 2);
    await page.mouse.down();
    await page.mouse.move(next.x + 56, next.y + next.height / 2 + 24, {steps: 3});
    await page.waitForFunction(() => document.querySelector('figure').hasAttribute('data-node-dragging'));
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 1})));
    await page.mouse.up();
    assert.deepEqual(await point(), current, 'pointer cancel restores the committed position');
    assert.equal(await page.evaluate(() => (globalThis as any).dragFixture.settings.length), 1);
    await page.mouse.move(next.x + 96, next.y + next.height / 2 + 60);
    assert.deepEqual(await point(), current, 'cancelled gestures have no remaining move listener');
    const last = await worker.boundingBox();
    await page.mouse.move(last.x + 20, last.y + last.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + 44, last.y + last.height / 2 + 12, {steps: 3});
    await page.waitForFunction(() => document.querySelector('figure').hasAttribute('data-node-dragging'));
    await page.evaluate(() => (globalThis as any).dragFixture.root.unmount());
    await page.mouse.move(100, 100);
    await page.mouse.up();
    assert.equal(await figure.count(), 0);
    assert.equal(await page.evaluate(() => (globalThis as any).dragFixture.settings.length), 1, 'unmount removes the pending drag listeners');
});
