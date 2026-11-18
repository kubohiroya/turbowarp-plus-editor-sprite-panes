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
import {SpriteFunctionPane, FunctionFlowToggle, FunctionRelationToggles} from '/dist/sprite-function-pane.js';
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
document.querySelector('main').innerHTML = '<div id=controls></div><div id=pane style=height:100%></div>';
const controlsRoot = ReactDOM.createRoot(document.querySelector('#controls'));
const root = ReactDOM.createRoot(document.querySelector('#pane'));
window.opened = [];
window.changes = [];
let mountCount = 0;
window.mountPane = ({locale = 'en', messagesOnly = false, foreignFunctions = false, defaultSettings} = {}) => {
    const sender = messagesOnly ? {...send, id: 'flag', scriptId: 'flag',
        opcode: 'event_whenflagclicked', label: 'When green flag clicked', definition: undefined} : send;
    const data = {targetId: 'cat', isStage: false, functions: messagesOnly ? [] : [alpha, beta],
        messageGraph: {scripts: [sender, receive], edges: [{...edge, from: sender.id}]}};
    if (foreignFunctions) {
        data.functions = [{...alpha, callees: ['beta', 'dog:global', 'stage:global']}, beta];
        data.globals = ['dog', 'stage'].map(id => ({...fn(id + ':global'), proccode: id + '_task',
            owner: {targetId: id, functionId: 'global', name: id === 'dog' ? 'Dog' : 'Stage', isStage: id === 'stage',
                thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJvcmFuZ2UiLz48L3N2Zz4='}}));
    }
    let saved = {...defaultSettings};
    const render = () => ReactDOM.flushSync(() => {
        controlsRoot.render(React.createElement(React.Fragment, null,
            React.createElement(FunctionFlowToggle, {locale, value: saved.direction ?? 'LR', onChange: direction => {saved = {...saved, direction}; render();}}),
            React.createElement(FunctionRelationToggles, {locale, value: {function: saved.showCalls !== false, message: saved.showMessages !== false},
                onChange: value => {mountCount++; saved = {...saved, showCalls: value.function, showMessages: value.message}; window.changes.push(saved); render();}})));
        root.render(React.createElement(SpriteFunctionPane, {
        key: mountCount, kind: 'functions', view: 'graph', locale, editable: true, data, defaultSettings: saved, direction: saved.direction,
        onSettingsChange: settings => window.changes.push(settings),
        onOpenFunction: item => window.opened.push({kind: 'function', id: item.id}),
        onOpenScript: item => window.opened.push({kind: 'script', id: item.id, targetId: item.targetId})
    }));
    });
    mountCount++; render();
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
    await page.locator('[data-relation-kind="message"]').waitFor();
    return page;
}

const relation = (page: Page, kind: 'call' | 'message') =>
    page.locator(`.tw-sprite-functions__edges path[data-edge][data-script-relation="${kind === 'call' ? 'function' : 'message'}"]`);

async function screenshot(page: Page, name: string) {
    const directory = process.env.CALL_GRAPH_SCREENSHOT_DIR;
    if (!directory) return;
    await mkdir(directory, {recursive: true});
    await page.screenshot({path: path.join(directory, name + '.png')});
}

test('the two arrow toggles cover all four states and keep their settings when remounted', async t => {
    const page = await openPage(t);
    const calls = page.locator('[data-relation-kind="function"]');
    const messages = page.locator('[data-relation-kind="message"]');
    await expect(calls).toHaveAttribute('aria-pressed', 'true');
    await expect(messages).toHaveAttribute('aria-pressed', 'true');
    await expect(relation(page, 'call')).toHaveCount(1);
    await expect(relation(page, 'message')).toHaveCount(1);
    await expect(page.locator('.tw-sprite-functions__edge-label')).toContainText('💬 go');

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
    await expect(page.locator('.tw-sprite-functions__edge-label')).toContainText('💬 go');
    await screenshot(page, 'call-graph-en');
});

test('hidden message arrows do not highlight their receiver and controls still change flow and zoom', async t => {
    const page = await openPage(t);
    const alpha = page.locator('.tw-sprite-functions__node[data-function-key="alpha"]');
    const beta = page.locator('.tw-sprite-functions__node[data-function-key="beta"]');
    const receiver = page.locator('.tw-sprite-functions__node[data-script-key]');
    await alpha.hover();
    await expect(receiver).toHaveAttribute('data-highlight', 'callee');
    await page.locator('[data-relation-kind="message"]').click();
    await alpha.hover();
    await expect(beta).toHaveAttribute('data-highlight', 'callee');
    assert.equal(await receiver.getAttribute('data-highlight'), null);

    await page.locator('[data-direction="TD"]').click();
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

test('Japanese and English relationship controls retain descriptive tooltips outside the graph in both themes', async t => {
    const page = await openPage(t);
    for (const locale of ['ja', 'en']) {
        await page.evaluate(locale => (window as any).mountPane({locale}), locale);
        for (const dark of [false, true]) {
            await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
            for (const kind of ['function', 'message']) {
                const button = page.locator(`[data-relation-kind="${kind}"]`);
                await expect(button).toHaveAttribute('aria-pressed', 'true');
                assert.ok(await button.getAttribute('title'));
                assert.equal(await button.evaluate(node => Boolean(node.closest('.tw-sprite-functions__graph'))), false);
            }
            for (const direction of ['LR', 'TD']) {
                const button = page.locator(`.tw-sprite-functions__flow-toggle [data-direction="${direction}"]`);
                assert.ok(await button.getAttribute('title'));
                await expect(button.locator('svg')).toHaveCount(1);
            }
            await screenshot(page, `call-graph-${locale}-${dark ? 'dark' : 'light'}`);
        }
    }
});


test('foreign function nodes show costume thumbnails and only target names while labels and navigation keep the functions', async t => {
    const page = await openPage(t);
    await page.evaluate(() => (window as any).mountPane({locale: 'ja', foreignFunctions: true}));
    for (const [id, owner] of [['dog', 'Dog'], ['stage', '背景']]) {
        const node = page.locator(`[data-function-key="${id}:global"]`);
        await expect(node.locator('.tw-sprite-functions__name')).toHaveText(owner);
        await expect(node.locator('.tw-sprite-functions__owner')).toHaveCount(0);
        const image = node.locator('img');
        await expect(image).toHaveAttribute('alt', '');
        assert.equal(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0), true);
        const bounds = await image.boundingBox();
        assert.equal(bounds.width, 22);
        assert.equal(bounds.height, 22);
        await expect(node).toHaveAccessibleName(`${owner} · ${id}_task`);
        const label = page.locator(`.tw-sprite-functions__edge-label[data-edge="alpha>${id}:global"]`);
        await expect(label.locator('text')).toHaveText(`${id}_task`);
        await node.focus();
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => (window as any).opened.at(-1)), {kind: 'function', id: `${id}:global`});
    }
});
