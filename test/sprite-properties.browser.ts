import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://sprite-panes.test';
const files = new Map([
    ['/example/sprite-properties.html', new URL('../example/sprite-properties.html', import.meta.url)],
    ['/example/.build/sprite-properties.js', new URL('../example/.build/sprite-properties.js', import.meta.url)],
    ['/dist/sprite-properties.js', new URL('../dist/sprite-properties.js', import.meta.url)],
    ['/src/sprite-properties.css', new URL('../src/sprite-properties.css', import.meta.url)],
    ...['react', 'react-dom'].map(name => [
        `/${name}.umd.js`, path.join(path.dirname(require.resolve(name + '/package.json')), 'umd', name + '.development.js')
    ])
]);

let browser;
before(async () => {
    browser = await chromium.launch({executablePath: process.env.SPRITE_PROPERTIES_CHROME});
});
after(() => browser?.close());

async function withFixture(run) {
    const page = await browser.newPage({viewport: {width: 1200, height: 850}});
    try {
        await page.route(origin + '/**', async route => {
            const {pathname} = new URL(route.request().url());
            if (pathname === '/react.js') return route.fulfill({contentType: 'application/javascript',
                body: 'export default window.React; export const {useRef, useState} = window.React;'});
            const file = files.get(pathname);
            if (!file) return route.fulfill({status: 404});
            const contentType = pathname.endsWith('.html') ? 'text/html' :
                pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
            return route.fulfill({contentType, body: await readFile(file)});
        });
        await page.goto(origin + '/example/sprite-properties.html');
        await page.getByRole('region', {name: 'Sprite properties'}).waitFor();
        await run(page);
    } finally {
        await page.close();
    }
}

const resize = (page, width, height) => page.evaluate(([w, h]) => {
    window.spriteFixture.resize(w, h);
}, [width, height]);
test('sprite properties and direction use two panels that reflow in narrow panes', () => withFixture(async page => {
    for (const [locale, name, rotation] of [
        ['en', 'Sprite name', 'Rotation style'], ['ja', 'スプライト名', '回転方法']
    ]) {
        await page.evaluate(language => window.spriteFixture.changeLocale(language), locale);
        const basic = page.locator('.tw-sprite-properties__basic');
        const attributes = basic.locator('.tw-sprite-properties__attributes > .tw-sprite-properties__field');
        const direction = page.locator('.tw-sprite-properties__direction');
        assert.equal(await basic.getByRole('textbox', {name}).count(), 1);
        assert.equal(await direction.getByRole('spinbutton').count(), 1);
        const rotationButtons = direction.getByRole('radiogroup', {name: rotation});
        const dial = direction.getByRole('slider');
        await resize(page, 900, 300);
        const [left, right, buttons, circle, nameInput, directionInput] = await Promise.all([
            basic.boundingBox(), direction.boundingBox(), rotationButtons.boundingBox(), dial.boundingBox(),
            basic.getByRole('textbox', {name}).boundingBox(), direction.getByRole('spinbutton').boundingBox()
        ]);
        assert.ok(left.x + left.width < right.x);
        assert.ok(buttons.x + buttons.width < circle.x);
        assert.ok(directionInput.y + directionInput.height < buttons.y);
        const row = await attributes.evaluateAll(elements => elements.map(element => {
            const {x, y, right} = element.getBoundingClientRect();
            return {x, y, right};
        }));
        assert.equal(row.length, 4);
        assert.ok(nameInput.y + nameInput.height < row[0].y);
        assert.equal(new Set(row.map(box => box.y)).size, 1);
        assert.ok(row[3].x - row[2].right <= 10);

        for (const width of [490, 210, 145]) {
            await resize(page, width, 700);
            const [top, bottom] = await Promise.all([basic.boundingBox(), direction.boundingBox()]);
            assert.ok(top.y + top.height < bottom.y);
            assert.equal(await page.locator('.tw-sprite-properties').evaluate(element =>
                element.scrollWidth <= element.clientWidth), true);
        }
    }
    await resize(page, 210, 145);
    assert.equal(await page.locator('.tw-sprite-properties').evaluate(element =>
        element.scrollHeight > element.clientHeight && element.scrollWidth <= element.clientWidth
    ), true);
}));

test('reflow retains drafts and focus, keyboard order stays stable, Enter and blur commit once', () => withFixture(async page => {
    const name = page.getByRole('textbox', {name: 'Sprite name'});
    await name.fill('Renamed cat');
    await resize(page, 210, 520);
    assert.equal(await name.inputValue(), 'Renamed cat');
    assert.equal(await name.evaluate(element => element === element.ownerDocument.activeElement), true);
    await name.press('Enter');
    await page.getByRole('spinbutton', {name: 'x', exact: true}).focus();
    await resize(page, 900, 140);
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits), [
        {id: 'Cat', patch: {name: 'Renamed cat'}}
    ]);
    for (const width of [900, 210]) {
        await resize(page, width, 520);
        await name.focus();
        const keyboardOrder = [];
        for (let index = 0; index < 8; index++) {
            keyboardOrder.push(await page.evaluate(() => document.activeElement.getAttribute('aria-label')));
            await page.keyboard.press('Tab');
        }
        assert.deepEqual(keyboardOrder, ['Sprite name', 'x', 'y', 'Show', 'Size', 'Direction', 'All around', 'Direction dial']);
    }
}));

test('direction dial previews drag angles, commits once and follows the rotation style', () => withFixture(async page => {
    await resize(page, 540, 310);
    const dial = page.getByRole('slider', {name: 'Direction dial'});
    const input = page.getByRole('spinbutton', {name: 'Direction'});
    const style = page.getByRole('radiogroup', {name: 'Rotation style'});
    const edits = () => page.evaluate(() => window.spriteFixture.edits);
    async function drag(from: [number, number], to: [number, number], preview?: string) {
        const box = await dial.boundingBox();
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        await page.mouse.move(centerX + from[0], centerY + from[1]);
        await page.mouse.down();
        await page.mouse.move(centerX + to[0], centerY + to[1], {steps: 5});
        if (preview !== undefined) assert.equal(await input.inputValue(), preview);
        await page.mouse.up();
    }
    await drag([15, 0], [0, -20], '0');
    assert.deepEqual(await edits(), [{id: 'Cat', patch: {direction: 0}}]);
    assert.equal(await dial.getAttribute('aria-valuenow'), '0');
    await dial.press('Shift+ArrowRight');
    assert.equal(await input.inputValue(), '15');
    await style.getByRole('radio', {name: 'Left-right'}).check();
    assert.equal(await dial.getAttribute('aria-valuenow'), '90');
    assert.equal(await input.inputValue(), '15');
    await drag([15, 0], [-17, -12], '-90');
    assert.equal(await dial.getAttribute('aria-valuenow'), '-90');
    assert.equal(await input.inputValue(), '-90');
    await style.getByRole('radio', {name: "Don't rotate"}).check();
    assert.equal(await dial.getAttribute('aria-disabled'), 'true');
    assert.equal(await dial.getAttribute('aria-valuenow'), '90');
    const before = await edits();
    await drag([15, 0], [-17, -12]);
    assert.deepEqual(await edits(), before);
    await input.fill('-35');
    await input.press('Enter');
    assert.equal(await input.inputValue(), '-35');
    await style.getByRole('radio', {name: 'All around'}).check();
    assert.equal(await dial.getAttribute('aria-valuenow'), '-35');
}));

test('all properties are committed against one target, stale drafts are discarded, stage is disabled', () => withFixture(async page => {
    const name = page.getByRole('textbox', {name: 'Sprite name'});
    const x = page.getByRole('spinbutton', {name: 'x', exact: true});
    const y = page.getByRole('spinbutton', {name: 'y', exact: true});
    const visibility = page.getByRole('radiogroup', {name: 'Visibility'});
    const show = visibility.getByRole('radio', {name: 'Show'});
    const hide = visibility.getByRole('radio', {name: 'Hide'});
    const size = page.getByRole('spinbutton', {name: 'Size'});
    const direction = page.getByRole('spinbutton', {name: 'Direction'});
    const rotation = page.getByRole('radiogroup', {name: 'Rotation style'});

    await name.fill('Discard this draft');
    await page.evaluate(() => window.spriteFixture.select('Dog'));
    await page.waitForFunction(() => document.querySelector('#panel input').value === 'Dog');
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits), []);
    await page.evaluate(() => window.spriteFixture.update('Dog', {x: 15.75}));
    await page.waitForFunction(() => document.querySelector('#panel input[aria-label="x"]').value === '16');
    assert.equal(await x.inputValue(), '16');

    await name.fill('New Dog');
    await name.press('Enter');
    await x.fill('-12.5');
    await y.fill('22');
    await y.press('Tab');
    assert.equal(await show.isChecked(), true);
    await show.press('ArrowRight');
    assert.equal(await hide.isChecked(), true);
    assert.equal(await show.isChecked(), false);
    await size.fill('75');
    await direction.fill('-45');
    await direction.press('Tab');
    await rotation.getByRole('radio', {name: "Don't rotate"}).check();
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits), [
        {id: 'Dog', patch: {name: 'New Dog'}},
        {id: 'Dog', patch: {x: -12.5}},
        {id: 'Dog', patch: {y: 22}},
        {id: 'Dog', patch: {visible: false}},
        {id: 'Dog', patch: {size: 75}},
        {id: 'Dog', patch: {direction: -45}},
        {id: 'Dog', patch: {rotationStyle: "don't rotate"}}
    ]);

    await x.fill('');
    await x.press('e');
    await x.press('Enter');
    assert.equal(await page.evaluate(() => window.spriteFixture.edits.length), 7);

    await x.fill('');
    await x.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits.at(-1)), {id: 'Dog', patch: {x: 0}});

    await name.fill('Uncommitted stage switch');
    await page.evaluate(() => window.spriteFixture.select('Stage'));
    await page.waitForFunction(() => document.querySelector('#panel input').disabled);
    assert.equal(await page.locator('#panel :is(input,select):disabled').count(), 10);
    assert.equal(await page.evaluate(() => window.spriteFixture.edits.length), 8);
}));
