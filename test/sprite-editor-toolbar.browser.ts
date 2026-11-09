import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://sprite-panes.test';
const toolbar = '/example/sprite-editor-toolbar.html';
const files = new Map([
    [toolbar, fileURLToPath(new URL('../example/sprite-editor-toolbar.html', import.meta.url))],
    ['/dist/sprite-editor-toolbar.js', fileURLToPath(new URL('../dist/sprite-editor-toolbar.js', import.meta.url))],
    ['/src/sprite-editor-toolbar.css', fileURLToPath(new URL('../src/sprite-editor-toolbar.css', import.meta.url))]
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
    await expect(tabs).toHaveCount(5);
    await expect(selected).toHaveAccessibleName('コード');
    const tabBounds = await Promise.all((await tabs.all()).map(async tab => {
        await expect(tab).toHaveText('');
        await expect(tab).toHaveCSS('padding', '0px');
        return tab.boundingBox();
    }));
    const panel = await page.getByRole('tabpanel').boundingBox();
    const rail = await strip.boundingBox();
    // A button is the size of what it shows, so the rail keeps the same shape whatever its height.
    // The two sections that survey the sprite are set apart from the three that edit the project.
    const gap = 2;
    const groupGap = 9;
    assert.ok(tabBounds.every((tab, index) => {
        const previous = tabBounds[index - 1];
        const step = index === 3 ? gap + groupGap : gap;
        return tab.width === 28 && tab.height === 28 && tab.x + tab.width <= panel.x &&
            tab.x === tabBounds[0].x && (!previous || Math.abs(tab.y - previous.y - previous.height - step) < 0.1);
    }));
    const lastTab = tabBounds.at(-1);
    assert.ok(lastTab.y + lastTab.height < rail.y + rail.height - 40, 'the rail is not divided among its buttons');
    await selected.hover();
    await expect(tooltip).toHaveText('コード');
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
    await expect(selected).toHaveAccessibleName('コスチューム');
    await expect(selected).toBeFocused();
    await expect(tooltip).toHaveText('コスチューム');
    await selected.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(selected).toHaveCount(1);
    await expect(unselected.first()).toHaveAccessibleName('コード');
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

