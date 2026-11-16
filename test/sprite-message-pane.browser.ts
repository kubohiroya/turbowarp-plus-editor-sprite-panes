import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://sprite-message-pane.test';
// The message pane is mounted on its own, outside `.tw-sprite-variables`, as the Editor mounts it.
const html = `<!doctype html>
<link rel="stylesheet" href="/sprite-asset-pane.css">
<script src="/react.umd.js"></script>
<script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js","@kubohiroya/turbowarp-plus-editor-project-model/project-messages":"/project-messages.js"}}</script>
<main style="width: 350px; height: 340px"></main>
<script type="module">
import {SpriteMessagePane} from '/sprite-message-pane.js';
const send = {
    direction: 'send', id: 'go', fieldValue: 'go', name: 'go', wait: false, key: 'go',
    targetId: 'cat', targetName: 'Cat', isStage: false, blockId: 'block-1', opcode: 'event_broadcast',
    scriptId: 'flag', scriptOpcode: 'event_whenflagclicked'
};
const data = {
    targetId: 'cat', isStage: false, sends: [send], receives: [], elsewhere: [],
    messages: [{key: 'go', id: 'go', name: 'go', status: 'sendOnly', sends: [send], receives: []}]
};
ReactDOM.createRoot(document.querySelector('main')).render(React.createElement(SpriteMessagePane, {
    kind: 'messages', locale: 'en', editable: true, data, onRename() {}
}));
</script>`;

async function openPage(t) {
    const browser = await chromium.launch({executablePath: process.env.SPRITE_PROPERTIES_CHROME});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 640, height: 480}});
    const routes = new Map([
        ['/pen-icon.js', new URL('../dist/pen-icon.js', import.meta.url)],
        ['/block-image.js', new URL('../dist/block-image.js', import.meta.url)],
        ['/pane-dialog.js', new URL('../dist/pane-dialog.js', import.meta.url)],
        ['/sprite-message-pane.js', new URL('../dist/sprite-message-pane.js', import.meta.url)],
        ['/project-messages.js', require.resolve('@kubohiroya/turbowarp-plus-editor-project-model/project-messages')],
        ['/sprite-asset-pane.css', new URL('../src/sprite-asset-pane.css', import.meta.url)],
        ...['react', 'react-dom'].map(name => [
            `/${name}.umd.js`, path.join(path.dirname(require.resolve(name + '/package.json')), 'umd', name + '.development.js')
        ])
    ]);
    await page.route(origin + '/**', async route => {
        const {pathname} = new URL(route.request().url());
        if (pathname === '/') return route.fulfill({contentType: 'text/html', body: html});
        if (pathname === '/react.js') {
            return route.fulfill({contentType: 'application/javascript', body: 'export default window.React;'});
        }
        const source = routes.get(pathname);
        if (!source) return route.fulfill({status: 404});
        return route.fulfill({
            contentType: pathname.endsWith('.css') ? 'text/css' : 'application/javascript',
            body: await readFile(source)
        });
    });
    await page.goto(origin);
    return page;
}

test('the rename dialog of the message pane shows its confirm button', async t => {
    const page = await openPage(t);
    await page.getByRole('button', {name: 'Actions for “go”'}).click();
    await page.getByRole('menuitem', {name: 'Rename message'}).click();
    const dialog = page.getByRole('dialog', {name: 'Rename message'});
    const confirm = dialog.getByRole('button', {name: 'Rename', exact: true});
    await confirm.waitFor();
    const style = await confirm.evaluate(node => {
        const {color, backgroundColor} = getComputedStyle(node);
        return {color, backgroundColor};
    });
    // White text on the accent, as in the variable pane, not on a transparent background.
    assert.equal(style.color, 'rgb(255, 255, 255)');
    assert.notEqual(style.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.notEqual(style.backgroundColor, 'transparent');
});
