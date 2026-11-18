import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);

test('the graph wait badge is a readable vector beside its line with a hoverable meaning', {timeout: 30_000}, async t => {
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
