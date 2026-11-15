import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {callGraphHighlight, functionLabel, layoutCallGraph, orderFunctions, readTargetFunctions, SpriteFunctionPane} from '../dist/sprite-function-pane.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent, WheelEvent: window.WheelEvent
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

test('hovering a function picks out its links and the functions at their other ends', () => {
    const edges = [
        {from: 'main', to: 'draw', kind: 'forward'}, {from: 'draw', to: 'line', kind: 'forward'},
        {from: 'draw', to: 'draw', kind: 'self'}, {from: 'line', to: 'draw', kind: 'back'},
        {from: 'main', to: 'line', kind: 'forward'}
    ] as const;
    const {edges: links, nodes} = callGraphHighlight(edges, 'draw');
    assert.deepEqual([...links], [['main>draw', 'in'], ['draw>line', 'out'], ['draw>draw', 'self'], ['line>draw', 'in']]);
    assert.deepEqual([...nodes], [['draw', 'self'], ['main', 'caller'], ['line', 'both']]);
});

function graphPane(t: TestContext) {
    const {container} = render(t, {
        defaultSettings: {mode: 'graph'},
        data: {targetId: 'cat', isStage: false, functions: [
            fn('main', 'main', 0, 0, callees('main', ['draw', 'line'])), fn('draw', 'draw', 0, 0, callees('draw', ['line'])),
            fn('line', 'line', 0, 0, callees('line', [])), fn('other', 'other', 0, 0, callees('other', []))
        ]}
    });
    const figure = container.querySelector('figure');
    // jsdom has no layout: give the frame a size and let the pane measure it.
    Object.defineProperties(figure, {clientWidth: {value: 400}, clientHeight: {value: 300}});
    act(() => window.dispatchEvent(new window.Event('resize')));
    const canvas = container.querySelector<HTMLElement>('.tw-sprite-functions__canvas');
    const transform = () => canvas.style.transform;
    const zoom = (action: string) => act(() => container.querySelector<HTMLButtonElement>(`[data-zoom="${action}"]`).click());
    return {container, figure, transform, zoom};
}

test('the call graph shows which links enter and leave a hovered or focused function', t => {
    const {container, figure} = graphPane(t);
    const highlighted = () => ({
        edges: [...container.querySelectorAll('[data-edge][data-highlight]')].map(node =>
            `${node.getAttribute('data-edge')}:${node.getAttribute('data-highlight')}`).sort(),
        nodes: [...container.querySelectorAll('.tw-sprite-functions__node[data-highlight]')].map(node =>
            `${node.getAttribute('data-function-key')}:${node.getAttribute('data-highlight')}`).sort()
    });
    const draw = container.querySelector('[data-function-key="draw"]');

    act(() => draw.dispatchEvent(new window.MouseEvent('pointerover', {bubbles: true})));
    assert.ok(figure.hasAttribute('data-highlighting'));
    assert.deepEqual(highlighted(), {edges: ['draw>line:out', 'main>draw:in'], nodes: ['draw:self', 'line:callee', 'main:caller']});
    assert.equal(container.querySelector('[data-edge="main>draw"]').getAttribute('marker-end'), `url(#${
        container.querySelector('marker[data-highlight="in"]').id})`, 'the arrow head takes the colour of its link');

    act(() => draw.dispatchEvent(new window.MouseEvent('pointerout', {bubbles: true})));
    assert.ok(!figure.hasAttribute('data-highlighting'));
    assert.deepEqual(highlighted(), {edges: [], nodes: []});

    act(() => container.querySelector<HTMLButtonElement>('[data-function-key="line"]').focus());
    assert.deepEqual(highlighted(), {edges: ['draw>line:in', 'main>line:in'], nodes: ['draw:caller', 'line:self', 'main:caller']});
});

test('the call graph zooms with − + = and Ctrl + wheel, and pans with the wheel and by dragging', t => {
    const {container, figure, transform, zoom} = graphPane(t);
    assert.deepEqual([...container.querySelectorAll('[data-zoom]')].map(node => node.getAttribute('aria-label')),
        ['縮小', '拡大', '元の大きさに戻す'], 'the same order as the code area');
    const start = transform();
    assert.match(start, /scale\(1\)$/);

    zoom('in');
    assert.match(transform(), /scale\(1\.2\)$/);
    zoom('out');
    zoom('out');
    assert.match(transform(), /scale\(0\.833/);
    zoom('reset');
    assert.equal(transform(), start);

    act(() => figure.dispatchEvent(new window.WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true,
        clientX: 0, clientY: 0})));
    assert.equal(transform(), start.replace('scale(1)', 'scale(1.2)').replace(/translate\(([\d.]+)px, ([\d.]+)px\)/,
        (_, x, y) => `translate(${x * 1.2}px, ${y * 1.2}px)`), 'Ctrl + wheel zooms around the pointer');
    zoom('reset');

    const wheel = new window.WheelEvent('wheel', {bubbles: true, cancelable: true, deltaX: 10, deltaY: 20});
    act(() => figure.dispatchEvent(wheel));
    assert.ok(wheel.defaultPrevented, 'the page does not scroll under the graph');
    const [, x0, y0] = start.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).map(Number);
    assert.equal(transform(), `translate(${x0 - 10}px, ${y0 - 20}px) scale(1)`);

    // Dragging from a function moves the graph and does not open the function.
    const node = container.querySelector('[data-function-key="main"]');
    act(() => {
        node.dispatchEvent(new window.MouseEvent('pointerdown', {bubbles: true, button: 0, clientX: 50, clientY: 50}));
        window.dispatchEvent(new window.MouseEvent('pointermove', {clientX: 80, clientY: 60}));
    });
    assert.ok(figure.hasAttribute('data-panning'));
    act(() => {
        window.dispatchEvent(new window.MouseEvent('pointerup', {clientX: 80, clientY: 60}));
        node.dispatchEvent(new window.MouseEvent('click', {bubbles: true}));
    });
    assert.equal(transform(), `translate(${x0 + 20}px, ${y0 - 10}px) scale(1)`);
    assert.equal(container.querySelector('dialog'), null);
    assert.ok(!figure.hasAttribute('data-panning'));
});

test('the call graph minimap shows every function and the part in view', t => {
    const {container} = graphPane(t);
    const map = container.querySelector('.tw-sprite-functions__minimap');
    assert.equal(map.getAttribute('aria-hidden'), 'true', 'the zoom buttons and focus already reach every function');
    assert.equal(map.querySelectorAll('rect:not(.tw-sprite-functions__minimap-view)').length, 4);
    assert.equal(map.querySelectorAll('path').length, 3);
    const view = map.querySelector('.tw-sprite-functions__minimap-view');
    assert.equal(view.getAttribute('width'), '400');
    assert.equal(view.getAttribute('height'), '300');
});
