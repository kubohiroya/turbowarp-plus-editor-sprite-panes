import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {functionLabel, layoutCallGraph, orderFunctions, readTargetFunctions, SpriteFunctionPane} from '../dist/sprite-function-pane.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent
});
const {createRoot} = await import('react-dom/client');

const fn = (id: string, proccode: string, x: number, y: number, patch: object = {}) =>
    ({id, proccode, argumentNames: [], warp: false, x, y, calls: 1, scriptCalls: 1, callees: [], ...patch});

function render(t: TestContext, props: object) {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    const draw = (next: object = {}) => act(() => {
        root.render(React.createElement(SpriteFunctionPane, {kind: 'functions', locale: 'ja', editable: true, ...props, ...next}));
    });
    draw();
    t.after(() => {
        act(() => root.unmount());
        container.remove();
    });
    return {container, draw};
}

const names = (container: Element) =>
    [...container.querySelectorAll('.tw-sprite-functions__name')].map(node => node.textContent);

test('definitions are read with their arguments, warp and how often this sprite calls them', () => {
    const data = readTargetFunctions({id: 'cat', blocks: {_blocks: {
        def: {id: 'def', opcode: 'procedures_definition', topLevel: true, x: 40, y: 300,
            inputs: {custom_block: {block: 'proto'}}},
        proto: {id: 'proto', opcode: 'procedures_prototype',
            mutation: {proccode: 'jump %s times %b', argumentnames: '["height","fast"]', warp: 'true'}},
        call1: {id: 'call1', opcode: 'procedures_call', parent: 'flag', mutation: {proccode: 'jump %s times %b'}},
        flag: {id: 'flag', opcode: 'event_whenflagclicked', topLevel: true},
        call2: {id: 'call2', opcode: 'procedures_call', parent: 'loop', mutation: {proccode: 'jump %s times %b'}},
        loop: {id: 'loop', opcode: 'control_repeat', parent: 'def'},
        other: {id: 'other', opcode: 'procedures_call', mutation: {proccode: 'elsewhere'}}
    }}});

    assert.deepEqual(data, {targetId: 'cat', isStage: false, functions: [{
        id: 'def', proccode: 'jump %s times %b', argumentNames: ['height', 'fast'], warp: true, x: 40, y: 300, calls: 2,
        scriptCalls: 1, callees: ['def']
    }]}, 'a call inside the definition is recursion; the green flag call comes from another script');
    assert.equal(functionLabel(data.functions[0]), 'jump (height) times <fast>');
});

test('functions can be ordered by name, in rows (Z) or in columns (N)', () => {
    // a b
    // c d  — with a slightly lower than b, as people place scripts by hand.
    const items = [fn('d', 'delta', 400, 300), fn('a', 'alpha', 20, 20), fn('c', 'Charlie', 20, 310), fn('b', 'bravo', 400, 30)];
    const ids = (order: 'name' | 'z' | 'n') => orderFunctions(items, order).map(item => item.id);

    assert.deepEqual(ids('name'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(ids('z'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(ids('n'), ['a', 'c', 'b', 'd']);
    assert.deepEqual(orderFunctions([fn('x', 'item 10', 0, 0), fn('y', 'item 9', 0, 0)], 'name').map(item => item.id),
        ['y', 'x'], 'numbers in names sort by value');
});

test('the order picker reorders the accordion', t => {
    const chosen: string[] = [];
    const {container} = render(t, {onSettingsChange: ({order}: {order: string}) => chosen.push(order), data: {targetId: 'cat', isStage: false,
        functions: [fn('b', 'bravo', 400, 20), fn('a', 'alpha', 400, 300), fn('c', 'charlie', 20, 20)]}});
    assert.deepEqual(names(container), ['alpha', 'bravo', 'charlie']);

    const select = container.querySelector('select');
    assert.deepEqual([...select.options].map(option => option.textContent), ['名前順', 'Z順（行ごと）', 'N順（列ごと）']);
    for (const [value, expected] of [['z', ['charlie', 'bravo', 'alpha']], ['n', ['charlie', 'bravo', 'alpha']]] as const) {
        act(() => {
            select.value = value;
            select.dispatchEvent(new window.Event('change', {bubbles: true}));
        });
        assert.deepEqual(names(container), expected);
    }
    assert.deepEqual(chosen, ['z', 'n']);
});

test('the pane starts in the order the view used before', t => {
    const {container} = render(t, {defaultSettings: {order: 'n'}, data: {targetId: 'cat', isStage: false,
        functions: [fn('a', 'alpha', 400, 20), fn('b', 'bravo', 20, 300)]}});
    assert.equal(container.querySelector('select').value, 'n');
    assert.deepEqual(names(container), ['bravo', 'alpha']);
});

test('opening an item mounts its editor and closing it disposes the editor', t => {
    const mounts: string[] = [];
    const disposed: string[] = [];
    const {container, draw} = render(t, {
        data: {targetId: 'cat', isStage: false, functions: [fn('a', 'alpha %s', 0, 0, {argumentNames: ['n']}), fn('b', 'bravo', 0, 50)]},
        mountEditor(element: HTMLElement, targetId: string, id: string, {editable}: {editable: boolean}) {
            assert.ok(element.isConnected);
            mounts.push(`${targetId}/${id}/${editable}`);
            return () => disposed.push(id);
        }
    });
    const [alpha, bravo] = container.querySelectorAll<HTMLButtonElement>('.tw-sprite-functions__toggle');
    assert.equal(alpha.getAttribute('aria-expanded'), 'false');
    assert.equal(container.querySelector('[data-function-editor]'), null, 'closed items have no editor');

    act(() => alpha.click());
    act(() => bravo.click());
    assert.equal(alpha.getAttribute('aria-expanded'), 'true');
    assert.equal(container.querySelector(`#${alpha.getAttribute('aria-controls')}`)
        ?.querySelector('[role="group"]')?.getAttribute('aria-label'), 'alpha (n) のコード');
    assert.deepEqual(mounts, ['cat/a/true', 'cat/b/true'], 'several functions can be open at once');

    // A refresh with new data keeps the open editors.
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('a', 'alpha %s', 0, 0, {argumentNames: ['n'], calls: 3}), fn('b', 'bravo', 0, 50)]}});
    assert.deepEqual(mounts, ['cat/a/true', 'cat/b/true']);

    // An inactive view gets read-only editors.
    draw({editable: false});
    assert.deepEqual(disposed, ['a', 'b']);
    assert.deepEqual(mounts.slice(2), ['cat/a/false', 'cat/b/false']);

    act(() => alpha.click());
    assert.deepEqual(disposed, ['a', 'b', 'a']);
    assert.equal(alpha.getAttribute('aria-expanded'), 'false');
});

test('a sprite without functions says how to make one', t => {
    const {container} = render(t, {locale: 'en', data: {targetId: 'stage', isStage: true, functions: []}});
    assert.match(container.querySelector('.tw-sprite-functions__empty').textContent, /^The stage has no functions/);
});

const callees = (id: string, list: string[]) => ({callees: list, scriptCalls: id === 'main' ? 1 : 0});

test('the call graph puts callers before callees, left to right or top to bottom', () => {
    // main calls draw and move; draw calls line; line calls draw back; move calls itself.
    const functions = [
        fn('line', 'line', 0, 0, callees('line', ['draw'])),
        fn('move', 'move', 0, 0, callees('move', ['move'])),
        fn('draw', 'draw', 0, 0, callees('draw', ['line'])),
        fn('main', 'main', 0, 0, callees('main', ['draw', 'move'])),
        fn('spare', 'spare', 0, 0, {calls: 0, scriptCalls: 0})
    ];
    const lr = layoutCallGraph(functions, 'LR');
    const layers = Object.fromEntries(lr.nodes.map(node => [node.fn.id, node.layer]));
    assert.deepEqual(layers, {draw: 1, line: 2, main: 0, move: 1, spare: 0});
    assert.deepEqual(Object.fromEntries(lr.edges.map(edge => [`${edge.from}>${edge.to}`, edge.kind])), {
        'line>draw': 'back', 'move>move': 'self', 'draw>line': 'forward', 'main>draw': 'forward', 'main>move': 'forward'
    });
    const at = (layout: typeof lr, id: string) => layout.nodes.find(node => node.fn.id === id);
    assert.ok(at(lr, 'main').x < at(lr, 'draw').x && at(lr, 'draw').x < at(lr, 'line').x, 'LR flows along x');
    assert.equal(at(lr, 'main').x, at(lr, 'spare').x);

    const td = layoutCallGraph(functions, 'TD');
    assert.ok(at(td, 'main').y < at(td, 'draw').y && at(td, 'draw').y < at(td, 'line').y, 'TD flows along y');
    assert.equal(at(td, 'main').y, at(td, 'spare').y);
    assert.ok(lr.width > td.width && td.height > lr.height, 'the graph grows along its flow');
});

test('the graph mode draws nodes and opens a function in a dialog editor', t => {
    const mounts: string[] = [];
    const disposed: string[] = [];
    const settings: object[] = [];
    const {container} = render(t, {
        defaultSettings: {mode: 'graph'},
        onSettingsChange: (next: object) => settings.push(next),
        data: {targetId: 'cat', isStage: false, functions: [
            fn('main', 'main', 0, 0, callees('main', ['draw'])), fn('draw', 'draw %s', 0, 0, {argumentNames: ['size'], scriptCalls: 0})
        ]},
        mountEditor(_element: HTMLElement, targetId: string, id: string, {editable}: {editable: boolean}) {
            mounts.push(`${targetId}/${id}/${editable}`);
            return () => disposed.push(id);
        }
    });
    assert.deepEqual([...container.querySelectorAll('[data-choice]')].map(node =>
        [node.textContent, node.getAttribute('aria-pressed')]),
    [['一覧', 'false'], ['呼び出し図', 'true'], ['左から右 (LR)', 'true'], ['上から下 (TD)', 'false']]);
    assert.deepEqual(names(container), ['main', 'draw (size)']);
    assert.deepEqual([...container.querySelectorAll('[data-edge]')].map(node => node.getAttribute('data-edge')), ['main>draw']);
    assert.equal(container.querySelectorAll('.tw-sprite-functions__entry').length, 1, 'only main is called from a script');

    act(() => container.querySelector<HTMLButtonElement>('[data-choice="TD"]').click());
    assert.equal(container.querySelector('figure').getAttribute('data-direction'), 'TD');
    assert.deepEqual(settings.at(-1), {mode: 'graph', order: 'name', direction: 'TD'});

    act(() => container.querySelector<HTMLButtonElement>('[data-function-key="draw"]').click());
    const dialog = container.querySelector('dialog');
    assert.equal(dialog.getAttribute('aria-label'), 'draw (size) のコード');
    assert.ok(dialog.hasAttribute('open'));
    assert.deepEqual(mounts, ['cat/draw/true']);
    const close = dialog.querySelector<HTMLButtonElement>('.tw-sprite-functions__close');
    assert.equal(close.getAttribute('aria-label'), '閉じる');
    assert.equal(close.textContent, '', 'the close button shows an X icon, not the word');
    act(() => close.click());
    assert.equal(container.querySelector('dialog'), null);
    assert.deepEqual(disposed, ['draw']);

    act(() => container.querySelector<HTMLButtonElement>('[data-choice="list"]').click());
    assert.equal(container.querySelector('figure'), null);
    assert.equal(container.querySelectorAll('.tw-sprite-functions__toggle').length, 2);
});
