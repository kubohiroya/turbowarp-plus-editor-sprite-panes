import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {SpriteEditorToolbar, spriteEditorSections} from '../dist/sprite-editor-toolbar.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent
});
const {createRoot} = await import('react-dom/client');

function render(t: TestContext, props: object) {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    act(() => root.render(React.createElement(SpriteEditorToolbar, {viewId: 'view', locale: 'ja', section: 'code',
        onSectionChange() {}, ...props})));
    t.after(() => {
        act(() => root.unmount());
        container.remove();
    });
    return container;
}

test('the sections read scripts, then media, then data, with a line before each group', t => {
    const container = render(t, {propertiesInVariables: true});
    const buttons = [...container.querySelectorAll('[role="tab"]')];
    assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')),
        ['自由配置', 'ハット・関数一覧', '呼び出し関係', 'コスチューム', '音', '変数', 'メッセージ']);
    assert.deepEqual(buttons.filter(button => button.hasAttribute('data-group-start')).map(button => button.getAttribute('aria-label')),
        ['コスチューム', '変数']);
});

test('saved layouts keep their section numbers, with the call graph added at the end', () => {
    assert.deepEqual(spriteEditorSections, ['code', 'costumes', 'sounds', 'variables', 'messages', 'functions', 'calls']);
});

test('a host without the own panes shows only the groups it has', t => {
    const container = render(t, {availableSections: ['code', 'costumes', 'sounds'], locale: 'en'});
    const buttons = [...container.querySelectorAll('[role="tab"]')];
    assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')), ['Free layout', 'Costumes', 'Sounds']);
    assert.deepEqual(buttons.filter(button => button.hasAttribute('data-group-start')).map(button => button.getAttribute('aria-label')),
        ['Costumes']);
});
