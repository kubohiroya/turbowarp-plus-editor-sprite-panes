import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';

const require = createRequire(import.meta.url);
const messageScanner = require.resolve('@kubohiroya/turbowarp-plus-editor-project-model/project-messages');
const origin = 'http://sprite-panes.test';
const toolbar = '/example/sprite-editor-toolbar.html';
const files = new Map([
    [toolbar, fileURLToPath(new URL('../example/sprite-editor-toolbar.html', import.meta.url))],
    ['/dist/sprite-editor-toolbar.js', fileURLToPath(new URL('../dist/sprite-editor-toolbar.js', import.meta.url))],
    ['/dist/sprite-function-pane.js', fileURLToPath(new URL('../dist/sprite-function-pane.js', import.meta.url))],
    ['/src/sprite-editor-toolbar.css', fileURLToPath(new URL('../src/sprite-editor-toolbar.css', import.meta.url))],
    ['/src/sprite-asset-pane.css', fileURLToPath(new URL('../src/sprite-asset-pane.css', import.meta.url))]
]);
for (const name of ['react', 'react-dom']) {
    const entry = `/umd/${name}.development.js`;
    files.set('/node_modules/' + name + entry, path.join(path.dirname(require.resolve(name + '/package.json')), entry));
}

async function openExample(t) {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 900, height: 600}});
    await page.route(origin + '/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/project-messages.js') return route.fulfill({contentType: 'application/javascript', body: await readFile(messageScanner)});
        if (pathname === '/dist/message-call-graph.js') return route.fulfill({contentType: 'application/javascript',
            body: (await readFile(new URL('../dist/message-call-graph.js', import.meta.url), 'utf8')).replace("'@kubohiroya/turbowarp-plus-editor-project-model/project-messages'", "'/project-messages.js'")});
        if (pathname === '/example/react.js') {
            return route.fulfill({contentType: 'application/javascript', body: 'export default window.React;'});
        }
        const filename = files.get(pathname);
        if (!filename) return route.fulfill({status: 404});
        return route.fulfill({
            body: await readFile(filename),
            contentType: pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'application/javascript'
        });
    });
    return page;
}

test('the sprite toolbar selects one section and searches in the active section', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.goto(origin + toolbar);
    const toolbarRoot = page.locator('.tw-plus-sprite-toolbar');
    const strip = page.getByRole('tablist');
    const tooltip = page.locator('.tw-plus-sprite-toolbar-tooltip');
    const selected = page.getByRole('tab', {selected: true});
    const unselected = page.getByRole('tab', {selected: false});
    const tabs = strip.getByRole('tab');
    await expect(strip).toHaveAttribute('aria-orientation', 'vertical');
    await expect(tabs).toHaveCount(7);
    // The script views come first, then the media, then the data of the project.
    assert.deepEqual(await tabs.evaluateAll(nodes => nodes.map(node => node.id.replace(/^.*-section-/, ''))),
        ['code', 'functions', 'calls', 'costumes', 'sounds', 'variables', 'messages']);
    await expect(selected).toHaveAccessibleName('自由配置');
    const tabBounds = await Promise.all((await tabs.all()).map(async tab => {
        await expect(tab).toHaveText('');
        await expect(tab).toHaveCSS('padding', '0px');
        return tab.boundingBox();
    }));
    const panel = await page.getByRole('tabpanel').boundingBox();
    const rail = await strip.boundingBox();
    // A button is the size of what it shows, so the rail keeps the same shape whatever its height.
    // A line sets the three groups apart: scripts, media, and data.
    const gap = 2;
    const groupGap = 9;
    assert.ok(tabBounds.every((tab, index) => {
        const previous = tabBounds[index - 1];
        const step = index === 3 || index === 5 ? gap + groupGap : gap;
        return tab.width === 28 && tab.height === 28 && tab.x + tab.width <= panel.x &&
            tab.x === tabBounds[0].x && (!previous || Math.abs(tab.y - previous.y - previous.height - step) < 0.1);
    }));
    await selected.hover();
    await expect(tooltip).toHaveText('自由配置');
    assert.ok((await tooltip.boundingBox()).x >= panel.x);
    await page.mouse.move(800, 400);
    await expect(tooltip).toHaveCount(0);
    // The selection is a bar against the panel edge and a tinted icon, not a filled slab.
    await expect(selected).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(selected).toHaveCSS('color', 'rgb(133, 92, 214)');
    assert.equal(await selected.evaluate(node => getComputedStyle(node, '::before').backgroundColor), 'rgb(133, 92, 214)');
    await expect(unselected.first()).toHaveCSS('color', 'rgb(89, 89, 89)');
    await expect(unselected.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(strip).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await selected.press('ArrowDown');
    await expect(selected).toHaveAccessibleName('ハット・関数一覧');
    await selected.press('ArrowDown');
    await expect(selected).toHaveAccessibleName('呼び出し関係');
    await selected.press('ArrowDown');
    await expect(selected).toHaveAccessibleName('コスチューム');
    await expect(selected).toBeFocused();
    await expect(tooltip).toHaveText('コスチューム');
    await selected.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(selected).toHaveCount(1);
    await expect(unselected.first()).toHaveAccessibleName('自由配置');
    await expect(unselected.first()).toHaveCSS('color', 'rgb(89, 89, 89)');
    const search = page.getByRole('combobox');
    await expect(search).toHaveAttribute('placeholder', '検索');
    await search.fill('block');
    await expect(page.getByRole('option')).toHaveCount(2);
    await search.press('ArrowUp');
    await expect(page.getByRole('option', {selected: true})).toHaveText('Second block');
    await search.press('Enter');
    await expect(page.getByRole('tabpanel')).toHaveText('costumes: Second block');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.getByRole('button', {name: 'English'}).click();
    await expect(search).toHaveAttribute('placeholder', 'Search');
    await expect(selected).toHaveAccessibleName('Costumes');
    await page.getByRole('button', {name: 'Switch target'}).click();
    await selected.hover();
    await expect(selected).toHaveAccessibleName('Backdrops');
    await expect(tooltip).toHaveText('Backdrops');
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--color-scheme', 'dark');
        document.documentElement.style.setProperty('--dv-activegroup-visiblepanel-tab-background-color', '#111');
        document.documentElement.style.setProperty('--dv-inactivegroup-visiblepanel-tab-background-color', '#2e2e2e');
        document.documentElement.style.setProperty('--input-background', 'rgb(46, 52, 64)');
    });
    await expect(selected).toHaveCSS('color', 'rgb(133, 92, 214)');
    assert.equal(await selected.evaluate(node => getComputedStyle(node, '::before').backgroundColor), 'rgb(133, 92, 214)');
    await expect(unselected.first()).toHaveCSS('color', 'rgb(189, 189, 189)');
    await expect(unselected.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(strip).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(search).toHaveCSS('background-color', 'rgb(46, 52, 64)');
    await toolbarRoot.evaluate(element => element.setAttribute('data-active-group', 'false'));
    await expect(strip).toHaveCSS('background-color', 'rgb(46, 46, 46)');

    await page.locator('.tw-plus-sprite-tab-slot--split').evaluate(element => {element.style.height = '120px';});
    await selected.press('End');
    await expect(selected).toHaveAccessibleName('Messages');
    await expect(selected).toBeFocused();
    await expect(selected).toHaveCSS('height', '28px');
    await expect(tooltip).toHaveText('Messages');
    assert.ok(await strip.evaluate(element => element.scrollTop > 0));
});

test('rail controls change graph direction and independently filter function and message relations by keyboard', {timeout: 30_000}, async t => {
    const page = await openExample(t);
    await page.setViewportSize({width: 900, height: 1000});
    await page.goto(origin + toolbar);
    await page.evaluate(async () => {
        const {SpriteEditorToolbar} = await import('/dist/sprite-editor-toolbar.js');
        const {FunctionFlowToggle, FunctionRelationToggles, SpriteFunctionPane} = await import('/dist/sprite-function-pane.js');
        const {React, ReactDOM} = globalThis as any;
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = '/src/sprite-asset-pane.css';
        document.head.append(style);
        const container = document.createElement('div');
        container.id = 'rail-controls-example';
        container.className = 'pane';
        document.body.append(container);
        function Example() {
            const [direction, setDirection] = React.useState('LR');
            const [section, setSection] = React.useState('calls');
            const [visibility, setVisibility] = React.useState({function: true, message: true});
            const functions = ['jump', 'spare'].map(id => ({id, kind: 'procedure', proccode: id,
                argumentNames: [], warp: false, x: 0, y: 0, calls: 0, scriptCalls: 0, callees: []}));
            const data = {targetId: 'cat', isStage: false, functions,
                scripts: [{targetId: 'cat', scriptId: 'flag', label: 'Green flag'},
                    {targetId: 'cat', scriptId: 'receive', label: 'Receive ready'}],
                scriptRelations: [{kind: 'function', source: {targetId: 'cat', blockId: 'call', scriptId: 'flag'},
                    destination: {targetId: 'cat', blockId: 'jump', scriptId: 'jump'}, label: 'jump', wait: true},
                    {kind: 'message', source: {targetId: 'cat', blockId: 'send', scriptId: 'flag'},
                        destination: {targetId: 'cat', blockId: 'receive', scriptId: 'receive'}, label: 'ready', wait: false}]};
            return React.createElement('div', {className: 'tw-plus-sprite-tab-slot--split', style: {height: 320}},
                React.createElement('div', {className: 'tw-plus-sprite-tab-toolbar'},
                    React.createElement(SpriteEditorToolbar, {viewId: 'flow', locale: 'en', section,
                        onSectionChange: setSection, sectionControls: section === 'calls' ?
                            React.createElement(React.Fragment, null,
                                React.createElement(FunctionFlowToggle, {locale: 'en', value: direction, onChange: setDirection}),
                                React.createElement(FunctionRelationToggles, {locale: 'en', value: visibility, onChange: setVisibility})) : null})),
                React.createElement('div', {className: 'tw-plus-sprite-tab-body'},
                    React.createElement(SpriteFunctionPane, {kind: 'functions', locale: 'en', editable: true,
                        view: 'graph', direction, relationVisibility: visibility, data, onCreate: async () => undefined})));
        }
        ReactDOM.createRoot(container).render(React.createElement(Example));
    });
    const root = page.locator('#rail-controls-example');
    const toggle = root.locator('.tw-sprite-functions__flow-toggle');
    const tabs = root.getByRole('tablist');
    const graph = root.locator('figure');
    const functions = root.getByRole('button', {name: 'Functions', exact: true});
    const messages = root.getByRole('button', {name: 'Messages', exact: true});
    const edges = (kind: string) => graph.locator(`.tw-sprite-functions__edges > path[data-script-relation="${kind}"]`);
    const nodes = graph.locator('.tw-sprite-functions__node');
    const controls = root.locator('.tw-plus-sprite-toolbar-section-controls');
    const lr = toggle.locator('[data-direction="LR"]');
    const td = toggle.locator('[data-direction="TD"]');
    await expect(lr).toHaveAttribute('aria-pressed', 'true');
    await expect(td).toHaveAttribute('aria-pressed', 'false');
    await expect(lr).toHaveAttribute('title', 'Flow: Left to right (LR)');
    await expect(td).toHaveAttribute('title', 'Flow: Top to bottom (TD)');
    await expect(toggle).toHaveCSS('width', '34px');
    await expect(toggle).toHaveCSS('height', '82px');
    await expect(lr).toHaveCSS('height', '40px');
    await expect(td).toHaveCSS('height', '40px');
    await expect(functions).toHaveCSS('height', '40px');
    await expect(messages).toHaveCSS('height', '40px');
    const directions = await toggle.locator('button').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return {x: box.x, y: box.y, width: box.width, height: box.height};
    }));
    assert.ok(Math.abs(directions[0].x - directions[1].x) < 1 &&
        Math.abs(directions[0].y + directions[0].height - directions[1].y) < 1, 'LR and TD are clearly stacked vertically');
    await expect(graph).toHaveAttribute('data-direction', 'LR');
    assert.equal(await tabs.locator('button:not([role="tab"])').count(), 0);
    const rail = await root.locator('.tw-plus-sprite-toolbar-rail').boundingBox();
    let bounds = await controls.boundingBox();
    const controlsTop = bounds.y;
    assert.ok(bounds.x >= rail.x && bounds.x + bounds.width <= rail.x + rail.width);
    const lowest = await messages.boundingBox();
    const add = await root.locator('.tw-sprite-functions__add').boundingBox();
    assert.ok(Math.abs(lowest.y + lowest.height - add.y - add.height) <= 1,
        'the lowest button aligns with the Add function button');
    const flowBounds = await toggle.boundingBox();
    const functionBounds = await functions.boundingBox();
    assert.ok(Math.abs(flowBounds.y + flowBounds.height + 21 - functionBounds.y) <= 1 &&
        Math.abs(functionBounds.y + functionBounds.height - lowest.y) <= 1, 'the direction and relation groups have a half-button gap, and relation segments meet');
    await expect(controls).toHaveCSS('gap', '20px');
    await expect(toggle).toHaveCSS('border-radius', '5px');
    await expect(root.locator('.tw-sprite-functions__relation-toggles')).toHaveCSS('border-radius', '5px');
    await expect(functions).toHaveCSS('border-radius', '0px');
    await td.focus();
    await td.press('Enter');
    await expect(graph).toHaveAttribute('data-direction', 'TD');
    await expect(td).toHaveAttribute('aria-pressed', 'true');
    await expect(lr).toHaveAttribute('aria-pressed', 'false');
    await expect(td).toBeFocused();
    await lr.focus();
    await lr.press('Space');
    await expect(graph).toHaveAttribute('data-direction', 'LR');
    await expect(lr).toHaveAttribute('aria-pressed', 'true');
    await expect(td).toHaveAttribute('aria-pressed', 'false');
    await expect(root.locator('figure .tw-sprite-functions__flow-toggle')).toHaveCount(0);
    await expect(functions).toHaveAttribute('title', 'Hide function calls');
    await expect(messages).toHaveAttribute('title', 'Hide message sends and receivers');
    await expect(edges('function')).toHaveCount(1);
    await expect(edges('message')).toHaveCount(1);
    await expect(nodes).toHaveCount(4);
    const colors = await graph.locator('.tw-sprite-functions__edges > path').evaluateAll(paths => paths.map(path => ({
        color: getComputedStyle(path).stroke, dash: getComputedStyle(path).strokeDasharray})));
    assert.notEqual(colors[0].color, colors[1].color);
    assert.notEqual(colors[0].dash, colors[1].dash);
    await functions.focus();
    await functions.press('Enter');
    await expect(functions).toHaveAttribute('aria-pressed', 'false');
    await expect(functions).toHaveAttribute('title', 'Show function calls');
    await expect(edges('function')).toHaveCount(0);
    await expect(edges('message')).toHaveCount(1);
    await expect(nodes).toHaveCount(2);
    await expect(functions).toBeFocused();
    await messages.focus();
    await messages.press('Space');
    await expect(messages).toHaveAttribute('title', 'Show message sends and receivers');
    await expect(nodes).toHaveCount(0);
    await functions.click();
    await expect(edges('function')).toHaveCount(1);
    await expect(edges('message')).toHaveCount(0);
    await expect(nodes).toHaveCount(3);
    await messages.click();
    await expect(nodes).toHaveCount(4);
    await root.evaluate(element => {element.style.setProperty('--looks-secondary', '#2463bc');});
    await expect(messages).toHaveCSS('background-color', 'rgb(36, 99, 188)');
    await expect(functions).toHaveCSS('background-color', 'rgb(36, 99, 188)');
    await expect(functions).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(functions.locator('svg')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(lr).toHaveCSS('background-color', 'rgb(36, 99, 188)');
    await expect(lr).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(td).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await root.evaluate(element => {element.style.setProperty('--looks-secondary', '#bc4530');});
    await expect(messages).toHaveCSS('background-color', 'rgb(188, 69, 48)');
    await functions.click();
    await expect(functions).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await functions.click();
    const addAfterThemeChange = await root.locator('.tw-sprite-functions__add').boundingBox();
    const lowestAfterThemeChange = await messages.boundingBox();
    assert.ok(Math.abs(lowestAfterThemeChange.y + lowestAfterThemeChange.height - addAfterThemeChange.y - addAfterThemeChange.height) <= 1,
        'the bottom button and Add function share their bottom edge');
    await tabs.evaluate(element => {element.scrollTop = element.scrollHeight;});
    bounds = await controls.boundingBox();
    assert.ok(Math.abs(bounds.y - controlsTop) <= 1, 'tab scrolling leaves the group in place');
    await root.locator('.tw-plus-sprite-tab-slot--split').evaluate(element => {element.style.height = '180px';});
    await messages.scrollIntoViewIfNeeded();
    await expect(messages).toHaveCSS('min-height', '40px');
    assert.ok(await messages.evaluate(button => {
        const box = button.getBoundingClientRect();
        const hit = button.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit?.closest('button') === button;
    }), 'the last control remains reachable in a short pane');
    await root.getByRole('tab', {name: 'Calls', exact: true}).focus();
    await root.getByRole('tab', {name: 'Calls', exact: true}).press('Home');
    await expect(root.getByRole('tab', {name: 'Free layout', exact: true})).toBeFocused();
    await expect(toggle).toHaveCount(0, 'the host offers direction only in the calls section');
});

