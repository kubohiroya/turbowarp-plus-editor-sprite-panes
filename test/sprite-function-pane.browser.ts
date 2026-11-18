import assert from 'node:assert/strict';
import {test, type TestContext} from 'node:test';
import {mkdir, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium, expect, type Page} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://sprite-function-pane.test';
const html = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="/sprite-asset-pane.css">
<style>
body { margin: 0; font-family: sans-serif; }
main { width: 680px; height: 460px; }
.dark { --ui-white: #20242c; --ui-primary: #272c35; --text-primary: #f0f1f3;
    --text-primary-transparent: #bdc4d0; --ui-black-transparent: #606977; }
</style>
<script src="/react.umd.js"></script>
<script src="/react-dom.umd.js"></script>
<script type="importmap">{"imports":{"react":"/react.js","@kubohiroya/turbowarp-plus-editor-project-model/project-messages":"/project-messages.js"}}</script>
<main></main>
<script type="module">
import {SpriteFunctionPane} from '/dist/sprite-function-pane.js';
const fn = (id, callees = []) => ({id, kind: 'procedure', proccode: id,
    argumentNames: [], warp: false, x: 0, y: 0, calls: 1, scriptCalls: 0, callees});
const alpha = fn('alpha', ['beta']);
const beta = fn('beta');
const receive = {id: 'dog:receive', targetId: 'dog', targetName: 'Dog', isStage: false,
    scriptId: 'receive', opcode: 'event_whenbroadcastreceived', x: 0, y: 0,
    label: 'When I receive go'};
const send = {id: 'alpha', targetId: 'cat', targetName: 'Cat', isStage: false,
    scriptId: 'alpha', opcode: 'procedures_definition', x: 0, y: 0, definition: alpha};
const edge = {from: 'alpha', to: 'dog:receive', messageKey: 'go', messageName: 'go', wait: false};
const root = ReactDOM.createRoot(document.querySelector('main'));
window.opened = [];
window.changes = [];
let mountCount = 0;
window.mountPane = ({locale = 'en', messagesOnly = false, defaultSettings} = {}) => {
    const sender = messagesOnly ? {...send, id: 'flag', scriptId: 'flag',
        opcode: 'event_whenflagclicked', label: 'When green flag clicked', definition: undefined} : send;
    const data = {targetId: 'cat', isStage: false, functions: messagesOnly ? [] : [alpha, beta],
        messageGraph: {scripts: [sender, receive], edges: [{...edge, from: sender.id}]}};
    ReactDOM.flushSync(() => root.render(React.createElement(SpriteFunctionPane, {
        key: ++mountCount, kind: 'functions', view: 'graph', locale, editable: true, data, defaultSettings,
        onSettingsChange: settings => window.changes.push(settings),
        onOpenFunction: item => window.opened.push({kind: 'function', id: item.id}),
        onOpenScript: item => window.opened.push({kind: 'script', id: item.id, targetId: item.targetId})
    })));
};
window.mountPane();
</script>`;

async function openPage(t: TestContext): Promise<Page> {
    const browser = await chromium.launch({headless: true, executablePath: process.env.SPRITE_PROPERTIES_CHROME});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 760, height: 540}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, [], 'the mounted graph has no browser errors'));
    const routes = new Map([
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
        const source = routes.get(pathname) ??
            (/^\/dist\/[a-z0-9-]+\.js$/i.test(pathname) ? new URL('..' + pathname, import.meta.url) : undefined);
        if (!source) return route.fulfill({status: 404});
        return route.fulfill({contentType: pathname.endsWith('.css') ? 'text/css' : 'application/javascript',
            body: await readFile(source)});
    });
    await page.goto(origin);
    await page.locator('[data-edge-toggle="messages"]').waitFor();
    return page;
}

const relation = (page: Page, kind: 'call' | 'message') =>
    page.locator(`.tw-sprite-functions__edges path[data-edge][data-relation="${kind}"]`);

async function screenshot(page: Page, name: string) {
    const directory = process.env.CALL_GRAPH_SCREENSHOT_DIR;
    if (!directory) return;
    await mkdir(directory, {recursive: true});
    await page.screenshot({path: path.join(directory, name + '.png')});
}

test('the two arrow toggles cover all four states and keep their settings when remounted', async t => {
    const page = await openPage(t);
    const calls = page.locator('[data-edge-toggle="calls"]');
    const messages = page.locator('[data-edge-toggle="messages"]');
    await expect(calls).toHaveAttribute('aria-pressed', 'true');
    await expect(messages).toHaveAttribute('aria-pressed', 'true');
    await expect(relation(page, 'call')).toHaveCount(1);
    await expect(relation(page, 'message')).toHaveCount(1);
    await expect(page.locator('.tw-sprite-functions__edge-label')).toHaveText('go');

    await calls.click();
    await expect(relation(page, 'call')).toHaveCount(0);
    await expect(relation(page, 'message')).toHaveCount(1);
    await messages.click();
    await expect(relation(page, 'call')).toHaveCount(0);
    await expect(relation(page, 'message')).toHaveCount(0);
    await expect(page.locator('.tw-sprite-functions__edge-label')).toHaveCount(0);
    await calls.click();
    await expect(relation(page, 'call')).toHaveCount(1);
    await expect(relation(page, 'message')).toHaveCount(0);
    await page.evaluate(() => (window as any).mountPane({defaultSettings: (window as any).changes.at(-1)}));
    await expect(calls).toHaveAttribute('aria-pressed', 'true');
    await expect(messages).toHaveAttribute('aria-pressed', 'false');
    await expect(relation(page, 'call')).toHaveCount(1);
    await expect(relation(page, 'message')).toHaveCount(0);
    await messages.click();
    await expect(relation(page, 'message')).toHaveCount(1);
    await expect(page.locator('.tw-sprite-functions__edge-label')).toHaveText('go');
    await screenshot(page, 'call-graph-en');
});

test('hidden message arrows do not highlight their receiver and controls still change flow and zoom', async t => {
    const page = await openPage(t);
    const alpha = page.locator('.tw-sprite-functions__node[data-function-key="alpha"]');
    const beta = page.locator('.tw-sprite-functions__node[data-function-key="beta"]');
    const receiver = page.locator('.tw-sprite-functions__node[data-script-key]');
    await alpha.hover();
    await expect(receiver).toHaveAttribute('data-highlight', 'callee');
    await page.locator('[data-edge-toggle="messages"]').click();
    await alpha.hover();
    await expect(beta).toHaveAttribute('data-highlight', 'callee');
    assert.equal(await receiver.getAttribute('data-highlight'), null);

    await page.locator('[data-choice="TD"]').click();
    await expect(page.locator('.tw-sprite-functions__graph')).toHaveAttribute('data-direction', 'TD');
    const transform = await page.locator('.tw-sprite-functions__canvas').getAttribute('style');
    await page.locator('[data-zoom="in"]').click();
    assert.notEqual(await page.locator('.tw-sprite-functions__canvas').getAttribute('style'), transform);
    await page.locator('[data-zoom="reset"]').click();
    await expect(relation(page, 'message')).toHaveCount(0);
    await expect(relation(page, 'call')).toHaveCount(1);
});

test('a project with messages and no functions opens the receiver in its owning sprite', async t => {
    const page = await openPage(t);
    await page.evaluate(() => (window as any).mountPane({messagesOnly: true}));
    await expect(page.locator('.tw-sprite-functions__node[data-script-key]')).toHaveCount(2);
    await expect(relation(page, 'call')).toHaveCount(0);
    await expect(relation(page, 'message')).toHaveCount(1);
    await expect(page.locator('.tw-sprite-functions__notice')).toHaveCount(0);
    const receiver = page.locator('.tw-sprite-functions__node[data-script-key]').filter({hasText: 'When I receive go'});
    const colors = await receiver.evaluate(node => ({color: getComputedStyle(node).color,
        background: getComputedStyle(node).backgroundColor}));
    assert.notEqual(colors.color, colors.background, 'the script label remains visible on its node');
    await receiver.click();
    assert.deepEqual(await page.evaluate(() => (window as any).opened),
        [{kind: 'script', id: 'receive', targetId: 'dog'}]);
});

test('Japanese and English toggles stay inside the top right of a narrow graph in both themes', async t => {
    const page = await openPage(t);
    for (const [locale, labels] of [['ja', ['関数呼び出し', 'メッセージ送受信']],
        ['en', ['Function calls', 'Messages']]] as const) {
        await page.evaluate(locale => {
            document.querySelector('main')!.style.width = '280px';
            (window as any).mountPane({locale});
        }, locale);
        for (const dark of [false, true]) {
            await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
            const graph = await page.locator('.tw-sprite-functions__graph').boundingBox();
            assert.ok(graph);
            for (const [index, kind] of ['calls', 'messages'].entries()) {
                const button = page.locator(`[data-edge-toggle="${kind}"]`);
                await expect(button).toHaveAccessibleName(labels[index]);
                await expect(button).toHaveAttribute('title', labels[index]);
                const rect = await button.boundingBox();
                assert.ok(rect);
                assert.ok(rect.x >= graph.x && rect.x + rect.width <= graph.x + graph.width,
                    `${locale} ${kind} stays within the graph horizontally`);
                assert.ok(rect.y >= graph.y && rect.y + rect.height < graph.y + graph.height / 2,
                    `${locale} ${kind} stays near the top of the graph`);
                const colors = await button.evaluate(node => ({color: getComputedStyle(node).color,
                    background: getComputedStyle(node).backgroundColor}));
                assert.notEqual(colors.color, colors.background, 'the pressed label is visible');
            }
            await screenshot(page, `call-graph-${locale}-narrow-${dark ? 'dark' : 'light'}`);
        }
    }
});
