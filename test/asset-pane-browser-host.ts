// SPDX-License-Identifier: MPL-2.0
// Shared browser host extracted from sprite-asset-pane.browser.ts.
import type {TestContext} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium, type Page} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://sprite-asset-pane.test';

export async function openAssetPane(t: TestContext, html: string): Promise<Page> {
    const browser = await chromium.launch({headless: true, executablePath: process.env.SPRITE_PROPERTIES_CHROME});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 640, height: 480}});
    const routes = new Map<string, string | URL>([
        ['/pen-icon.js', new URL('../dist/pen-icon.js', import.meta.url)],
        ['/sprite-asset-pane.js', new URL('../dist/sprite-asset-pane.js', import.meta.url)],
        ['/sprite-clone-inspector.js', new URL('../dist/sprite-clone-inspector.js', import.meta.url)],
        ['/sprite-editor-toolbar.css', new URL('../src/sprite-editor-toolbar.css', import.meta.url)],
        ['/block-image.js', new URL('../dist/block-image.js', import.meta.url)],
        ['/pane-dialog.js', new URL('../dist/pane-dialog.js', import.meta.url)],
        ['/sprite-variable-edit.js', require.resolve('@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit')],
        ['/native-tile-title.js', new URL('../dist/native-tile-title.js', import.meta.url)],
        ['/sprite-properties.js', new URL('../dist/sprite-properties.js', import.meta.url)],
        ['/sprite-asset-pane.css', new URL('../src/sprite-asset-pane.css', import.meta.url)],
        ['/dialog-styles.css', require.resolve('@kubohiroya/turbowarp-plus-editor-windows/styles.css')],
        ...['react', 'react-dom'].map(name => [
            `/${name}.umd.js`, path.join(path.dirname(require.resolve(name + '/package.json')), 'umd', name + '.development.js')
        ] as const)
    ]);
    await page.route(origin + '/**', async route => {
        const {pathname} = new URL(route.request().url());
        if (pathname === '/') return route.fulfill({contentType: 'text/html', body: html});
        if (pathname === '/react.js') {
            return route.fulfill({contentType: 'application/javascript', body: 'export const {useRef, useState} = window.React; export default window.React;'});
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
