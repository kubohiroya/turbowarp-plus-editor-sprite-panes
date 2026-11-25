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
window.mountPane = ({locale = 'en', messagesOnly = false, foreignFunctions = false, defaultSettings, controlled = false, staticRelations = false} = {}) => {
    const sender = messagesOnly ? {...send, id: 'flag', scriptId: 'flag',
        opcode: 'event_whenflagclicked', label: 'When green flag clicked', definition: undefined} : send;
    const data = {targetId: 'cat', isStage: false, functions: messagesOnly ? [] : [alpha, beta],
        messageGraph: {scripts: [sender, receive], edges: [{...edge, from: sender.id}]}};
    if (staticRelations) {
        const endpoint = (targetId, scriptId) => ({targetId, scriptId, blockId: scriptId});
        data.scriptRelations = [
            {kind: 'function', source: endpoint('cat', 'alpha'), destination: endpoint('cat', 'beta'), label: 'beta', wait: false},
            {kind: 'message', source: endpoint('cat', 'alpha'), destination: endpoint('dog', 'receive'), label: 'go', wait: false}
        ];
        data.scripts = [{targetId: 'cat', scriptId: 'alpha', label: 'alpha', targetName: 'Cat'},
            {targetId: 'cat', scriptId: 'beta', label: 'beta', targetName: 'Cat'},
            {targetId: 'dog', scriptId: 'receive', label: 'When I receive go', targetName: 'Dog'}];
    }
    if (foreignFunctions) {
        data.functions = [{...alpha, callees: ['beta', 'dog:global', 'stage:global']}, beta];
        data.globals = ['dog', 'stage'].map(id => ({...fn(id + ':global'), proccode: id + '_task',
            owner: {targetId: id, functionId: 'global', name: id === 'dog' ? 'Dog' : 'Stage', isStage: id === 'stage',
                thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJvcmFuZ2UiLz48L3N2Zz4='}}));
    }
    let saved = {...defaultSettings};
    const render = () => ReactDOM.flushSync(() => {
        const visibility = saved.relationVisibility ?? {function: saved.showCalls !== false, message: saved.showMessages !== false};
        controlsRoot.render(React.createElement(React.Fragment, null,
            React.createElement(FunctionFlowToggle, {locale, value: saved.direction ?? 'LR', onChange: direction => {saved = {...saved, direction}; render();}}),
            React.createElement(FunctionRelationToggles, {locale, value: visibility,
                onChange: value => {
                    if (controlled) saved = {...saved, relationVisibility: value};
                    else {mountCount++; saved = {...saved, showCalls: value.function, showMessages: value.message};}
                    window.changes.push(saved); render();
                }})));
        root.render(React.createElement(SpriteFunctionPane, {
        key: mountCount, kind: 'functions', view: 'graph', locale, editable: true, data, defaultSettings: saved, direction: saved.direction,
        ...(controlled ? {relationVisibility: visibility} : {}),
        onSettingsChange: settings => window.changes.push(settings),
        onOpenFunction: item => window.opened.push({kind: 'function', id: item.id}),
        onOpenScript: item => window.opened.push({kind: 'script', id: item.id, targetId: item.targetId})
    }));
    });
    mountCount++; render();
};
window.mountPane();
window.mountLabelPane = (direction, long = false) => {
    const hat = long ? '緑の旗が押されたときから長い名前の処理を始める'.repeat(3) : '緑の旗が押されたとき';
    const own = long ? 'スプライトの長い表示名'.repeat(4) : 'スプライト1';
    const foreign = long ? '遠くのスプライトの長い表示名'.repeat(4) : 'スプライト2';
    const worker = {...fn('worker'), proccode: long ? 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW' : 'worker'};
    const remote = {...fn('other:global'), proccode: 'remote_task',
        owner: {targetId: 'other', functionId: 'global', name: foreign, isStage: false,
            thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJvcmFuZ2UiLz48L3N2Zz4='}};
    const endpoint = (targetId, scriptId) => ({targetId, scriptId, blockId: scriptId});
    const data = {targetId: 'cat', isStage: false, functions: [worker], globals: [remote],
        scripts: [{targetId: 'cat', scriptId: 'flag', label: hat, targetName: own},
            {targetId: 'other', scriptId: 'receive', label: long ? 'とても長いメッセージを受け取ったとき'.repeat(3) : 'goを受け取ったとき', targetName: foreign}],
        scriptRelations: [
            {kind: 'function', label: worker.proccode, wait: false, source: endpoint('cat', 'flag'), destination: endpoint('cat', 'worker')},
            {kind: 'function', label: worker.proccode, wait: false, source: endpoint('cat', 'worker'), destination: endpoint('cat', 'worker')},
            {kind: 'function', label: 'remote_task', wait: false, source: endpoint('cat', 'worker'), destination: endpoint('other', 'global')},
            {kind: 'message', label: 'go', wait: true, source: endpoint('cat', 'flag'), destination: endpoint('other', 'receive')}
        ]};
    ReactDOM.flushSync(() => root.render(React.createElement(SpriteFunctionPane, {key: ++mountCount,
        locale: 'ja', editable: true, view: 'graph', direction, data,
        onSettingsChange: settings => window.changes.push(settings)})));
    return {hat, own, foreign, worker: worker.proccode};
};
const focusedData = {targetId: 'cat', isStage: false,
    functions: Array.from({length: 12}, (_, i) => fn('step-' + i)),
    hats: [{id: 'idle-hat', label: 'Unconnected hat', x: 0, y: 0}], scripts: [],
    scriptRelations: Array.from({length: 11}, (_, i) => ({kind: 'function', label: 'step-' + (i + 1), wait: false,
        source: {targetId: 'cat', scriptId: 'step-' + i, blockId: 'step-' + i},
        destination: {targetId: 'cat', scriptId: 'step-' + (i + 1), blockId: 'step-' + (i + 1)}}))};
window.focusScript = (selectedId, focusRequest) => ReactDOM.flushSync(() => root.render(React.createElement(SpriteFunctionPane,
    {key: 'focused-graph', locale: 'en', editable: true, view: 'graph', data: focusedData, selectedId, focusRequest})));
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

for (const staticRelations of [false, true]) test(`controlled relation filters hide their own arrows and labels without remounting (${staticRelations ? 'Editor relations' : 'scanned messages'})`, async t => {
    const page = await openPage(t);
    await page.evaluate(staticRelations => (window as any).mountPane({controlled: true, staticRelations}), staticRelations);
    const graph = page.locator('figure');
    await graph.evaluate(node => { (node as any).controlledFixtureIdentity = true; });
    const calls = page.getByRole('button', {name: 'Functions', exact: true});
    const messages = page.getByRole('button', {name: 'Messages', exact: true});
    const verify = async (functions: boolean, broadcasts: boolean) => {
        await expect(calls).toHaveAttribute('aria-pressed', String(functions));
        await expect(messages).toHaveAttribute('aria-pressed', String(broadcasts));
        await expect(relation(page, 'call')).toHaveCount(Number(functions));
        await expect(relation(page, 'message')).toHaveCount(Number(broadcasts));
        await expect(page.locator('.tw-sprite-functions__edge-label')).toHaveCount(Number(broadcasts));
        assert.equal(await graph.evaluate(node => Boolean((node as any).controlledFixtureIdentity)), true);
    };
    await verify(true, true);
    await calls.click();
    await verify(false, true);
    await messages.click();
    await verify(false, false);
    await calls.click();
    await verify(true, false);
    await page.evaluate(staticRelations => (window as any).mountPane({controlled: true, staticRelations,
        defaultSettings: (window as any).changes.at(-1)}), staticRelations);
    await graph.evaluate(node => { (node as any).controlledFixtureIdentity = true; });
    await verify(true, false);
    await messages.click();
    await verify(true, true);
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
    for (const [id, owner] of [['dog', 'Dog'], ['stage', 'ステージ']]) {
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


test('hat and owner labels use complete separate rows and long names resize connected geometry in both directions', async t => {
    const page = await openPage(t);
    const source = page.locator('[data-script-key="script:[\\"cat\\",\\"flag\\"]"]');
    await page.evaluate(() => (window as any).mountLabelPane('LR'));
    await expect(source.locator('.tw-sprite-functions__name')).toHaveText('緑の旗が押されたとき');
    await expect(source.locator('.tw-sprite-functions__owner')).toHaveText('スプライト1');
    assert.equal(await source.locator('.tw-sprite-functions__name > span').count(), 1);
    assert.equal(await source.locator('.tw-sprite-functions__owner > span').count(), 1);
    assert.equal((await source.boundingBox()).height, 44);
    assert.ok((await source.locator('.tw-sprite-functions__owner').boundingBox()).y >
        (await source.locator('.tw-sprite-functions__name').boundingBox()).y);
    await screenshot(page, 'node-label-two-rows');
    for (const direction of ['LR', 'TD']) {
        const names = await page.evaluate(direction => (window as any).mountLabelPane(direction, true), direction);
        await expect(source.locator('.tw-sprite-functions__name')).toHaveText(names.hat);
        await expect(source.locator('.tw-sprite-functions__owner')).toHaveText(names.own);
        const worker = page.locator('[data-function-key="worker"]');
        const remote = page.locator('[data-function-key="other:global"]');
        assert.equal(await worker.locator('.tw-sprite-functions__name').textContent(), names.worker);
        assert.equal(await remote.locator('.tw-sprite-functions__name').textContent(), names.foreign);
        await expect(remote.locator('.tw-sprite-functions__owner')).toHaveCount(0);
        const metrics = await page.locator('.tw-sprite-functions__node').evaluateAll(nodes => nodes.map(node => {
            const box = node.getBoundingClientRect();
            const li = node.parentElement as HTMLElement;
            const key = node.getAttribute('data-function-key') ?? node.getAttribute('data-script-key');
            const mini = [...document.querySelectorAll('[data-node-key]')].find(item => item.getAttribute('data-node-key') === key);
            const lines = [...node.querySelectorAll('.tw-sprite-functions__node-text .tw-sprite-functions__name > span, .tw-sprite-functions__node-text .tw-sprite-functions__owner > span')];
            return {height: box.height, width: box.width, mini: Number(mini.getAttribute('height')), worldHeight: parseFloat(li.style.height),
                clear: lines.every(line => {
                    const range = document.createRange(); range.selectNodeContents(line);
                    const text = range.getBoundingClientRect();
                    return text.left >= box.left + 1 && text.right <= box.right - 1 && text.top >= box.top + 1 && text.bottom <= box.bottom - 1;
                })};
        }));
        assert.equal(new Set(metrics.map(item => item.height)).size, 1);
        assert.ok(metrics.every(item => item.height > 44 && item.width === 176 && item.clear));
        assert.ok(metrics.every(item => item.mini === item.worldHeight));
        await expect(page.locator('.tw-sprite-functions__edge-label-owner')).toHaveCount(0);
        const message = page.locator('.tw-sprite-functions__edge-label[data-script-relation="message"]');
        await expect(message.locator('text')).toHaveText('💬 go');
        await expect(message.locator('.tw-sprite-functions__relation-wait')).toHaveCount(0);
        const geometry = await page.locator('figure').evaluate(graph => {
            const nodes = [...graph.querySelectorAll('.tw-sprite-functions__node')];
            const worker = nodes.find(node => node.getAttribute('data-function-key') === 'worker').parentElement as HTMLElement;
            const path = graph.querySelector<SVGPathElement>('.tw-sprite-functions__edges > path[data-edge$=">worker"][data-kind="forward"]');
            const point = path.getPointAtLength(path.getTotalLength());
            const height = parseFloat(worker.style.height);
            const expected = graph.getAttribute('data-direction') === 'LR' ?
                {x: parseFloat(worker.style.left), y: parseFloat(worker.style.top) + height / 2} :
                {x: parseFloat(worker.style.left) + 88, y: parseFloat(worker.style.top)};
            return Math.hypot(point.x - expected.x, point.y - expected.y);
        });
        assert.ok(geometry < .1, 'receiving anchors use the expanded node height');
        // Moving a tall source updates its paths and the diagram position stored for the minimap.
        await source.hover();
        const box = await source.boundingBox();
        const incident = page.locator('.tw-sprite-functions__edges > path[data-script-relation="message"]');
        const before = await incident.getAttribute('d');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2 + 24, {steps: 4}); await page.mouse.up();
        assert.ok(await page.evaluate(() => Boolean((window as any).changes.at(-1)?.graphPositions)));
        assert.notEqual(await incident.getAttribute('d'), before);
        const saved = await page.evaluate(direction => (window as any).changes.at(-1).graphPositions.cat[direction]['script:["cat","flag"]'], direction);
        const mini = await page.locator('[data-node-key="script:[\\"cat\\",\\"flag\\"]"]').evaluate(node => ({x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y'))}));
        assert.deepEqual(mini, saved);
        assert.ok(await message.getAttribute('transform'));
        await screenshot(page, `node-label-long-${direction}`);
    }
});

test('requested scripts center in the graph, retain their relations, and can be focused again after panning', async t => {
    const page = await openPage(t);
    await page.evaluate(() => (window as any).focusScript('step-11', 1));
    const graph = page.locator('.tw-sprite-functions__graph');
    const selected = page.locator('.tw-sprite-functions__node[aria-current="true"]');
    const distance = async () => {
        const node = await selected.boundingBox(), frame = await graph.boundingBox();
        return Math.hypot(node.x + node.width / 2 - frame.x - frame.width / 2,
            node.y + node.height / 2 - frame.y - frame.height / 2);
    };
    await expect(selected).toHaveAttribute('data-function-key', 'step-11');
    await expect(selected).toHaveAttribute('data-highlight', 'self');
    await expect.poll(distance).toBeLessThan(2);
    await expect(graph.locator('[data-edge="step-10>step-11"]')).toHaveCount(1);
    await graph.hover({position: {x: 20, y: 20}});
    await page.mouse.wheel(100, 70);
    await expect.poll(distance).toBeGreaterThan(20);
    await page.mouse.move(740, 520);
    await page.evaluate(() => (window as any).focusScript('step-11', 2));
    await expect.poll(distance).toBeLessThan(2);
    await page.evaluate(() => {document.querySelector('main').style.width = '420px';});
    await expect.poll(distance).toBeLessThan(2);
    await page.evaluate(() => (window as any).focusScript('idle-hat', 3));
    await expect(selected).toHaveText('Unconnected hat');
    await expect(selected).toHaveAttribute('data-highlight', 'self');
    await expect.poll(distance).toBeLessThan(2);
});
