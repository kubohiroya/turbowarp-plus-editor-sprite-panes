import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {callGraphHighlight, callGraphNodeSize, FunctionFlowToggle, FunctionRelationToggles, functionLabel, layoutCallGraph, orderFunctions, readTargetFunctions, SpriteFunctionPane} from '../dist/sprite-function-pane.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent, WheelEvent: window.WheelEvent
});
const {createRoot} = await import('react-dom/client');

const fn = (id: string, proccode: string, x: number, y: number, patch: object = {}) =>
    ({id, kind: 'procedure', proccode, argumentNames: [], warp: false, x, y, calls: 1, scriptCalls: 1, callees: [], ...patch});

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
        id: 'def', kind: 'procedure', proccode: 'jump %s times %b', argumentNames: ['height', 'fast'], warp: true, x: 40, y: 300, calls: 2,
        scriptCalls: 1, callees: ['def'], uses: [{block: 'call1', script: 'flag'}, {block: 'call2', script: 'def'}]
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

test('the order picker reorders the list', t => {
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

test('clicking a function in the list opens it with the host', t => {
    const opened: string[] = [];
    const {container} = render(t, {
        onOpenFunction: ({id}: {id: string}) => opened.push(id),
        mountEditor: () => assert.fail('the list itself holds no editor'),
        data: {targetId: 'cat', isStage: false, functions: [fn('a', 'alpha %s', 0, 0, {argumentNames: ['n']}), fn('b', 'bravo', 0, 50)]}
    });
    const [alpha, bravo] = container.querySelectorAll<HTMLButtonElement>('.tw-sprite-functions__open');
    assert.equal(alpha.getAttribute('aria-label'), 'alpha (n) のコードを開く');
    assert.equal(alpha.hasAttribute('aria-expanded'), false, 'the list is not an accordion');
    act(() => alpha.click());
    act(() => bravo.click());
    act(() => alpha.click());
    assert.deepEqual(opened, ['a', 'b', 'a'], 'clicking again brings the function back to the front');
    assert.equal(container.querySelector('dialog'), null);
});

test('without a host opener a function picked in the list opens in the dialog', t => {
    const mounts: string[] = [];
    const disposed: string[] = [];
    const {container, draw} = render(t, {
        data: {targetId: 'cat', isStage: false, functions: [fn('a', 'alpha', 0, 0)]},
        mountEditor(element: HTMLElement, targetId: string, id: string, {editable}: {editable: boolean}) {
            assert.ok(element.isConnected);
            mounts.push(`${targetId}/${id}/${editable}`);
            return () => disposed.push(id);
        }
    });
    act(() => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__open').click());
    assert.equal(container.querySelector('dialog').getAttribute('aria-label'), 'alpha のコード');
    assert.deepEqual(mounts, ['cat/a/true']);
    // An inactive view gets a read-only editor.
    draw({editable: false});
    assert.deepEqual(mounts, ['cat/a/true', 'cat/a/false']);
    act(() => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__close').click());
    assert.equal(container.querySelector('dialog'), null);
    assert.deepEqual(disposed, ['a', 'a']);
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
    assert.deepEqual(layers, {draw: 1, line: 2, main: 0, move: 1, spare: 3});
    assert.deepEqual(Object.fromEntries(lr.edges.map(edge => [`${edge.from}>${edge.to}`, edge.kind])), {
        'line>draw': 'back', 'move>move': 'self', 'draw>line': 'forward', 'main>draw': 'forward', 'main>move': 'forward'
    });
    const at = (layout: typeof lr, id: string) => layout.nodes.find(node => node.fn.id === id);
    assert.ok(at(lr, 'main').x < at(lr, 'draw').x && at(lr, 'draw').x < at(lr, 'line').x, 'LR flows along x');

    const td = layoutCallGraph(functions, 'TD');
    assert.ok(at(td, 'main').y < at(td, 'draw').y && at(td, 'draw').y < at(td, 'line').y, 'TD flows along y');
    assert.ok(lr.width > td.width, 'the graph grows along its flow');

    // A function that calls none and that none calls sits apart, below the rest, whichever the flow.
    for (const layout of [lr, td]) {
        const spare = at(layout, 'spare');
        assert.equal(spare.isolated, true);
        assert.equal(layout.nodes.filter(node => node.isolated).length, 1);
        const lowest = Math.max(...layout.nodes.filter(node => !node.isolated).map(node => node.y + callGraphNodeSize.height));
        assert.ok(spare.y - lowest >= 72, 'with space between them');
        assert.equal(spare.x, 24, 'from the left edge');
        assert.equal(layout.height, spare.y + callGraphNodeSize.height + 24);
    }
});

test('isolated functions fill rows below the graph, at least four to a row', () => {
    const spares = ['a', 'b', 'c', 'd', 'e'].map(id => fn(id, id, 0, 0, {calls: 0, scriptCalls: 0}));
    const linked = [fn('main', 'main', 0, 0, callees('main', ['draw'])), fn('draw', 'draw', 0, 0)];
    const layout = layoutCallGraph([...spares, ...linked], 'TD');
    const rows = new Map<number, string[]>();
    for (const node of layout.nodes.filter(node => node.isolated)) rows.set(node.y, [...rows.get(node.y) ?? [], node.fn.id]);
    assert.deepEqual([...rows.values()], [['a', 'b', 'c', 'd'], ['e']], 'in name order');
    assert.ok(layout.width >= 24 * 2 + 4 * callGraphNodeSize.width + 3 * 18);

    // Only isolated functions: they start at the top.
    const alone = layoutCallGraph(spares.slice(0, 2), 'LR');
    assert.deepEqual(alone.nodes.map(node => [node.fn.id, node.x, node.y]), [['a', 24, 24], ['b', 24 + 176 + 18, 24]]);
    assert.deepEqual([alone.width, alone.height], [24 * 2 + 2 * 176 + 18, 24 * 2 + 44]);
});

test('the graph mode draws nodes and opens a function in a dialog editor', t => {
    const mounts: string[] = [];
    const disposed: string[] = [];
    const settings: object[] = [];
    const {container, draw} = render(t, {
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
    [['一覧', 'false'], ['呼び出し図', 'true']]);
    assert.deepEqual(names(container), ['main', 'draw (size)']);
    assert.deepEqual([...container.querySelectorAll('[data-edge]')].map(node => node.getAttribute('data-edge')), ['main>draw']);
    assert.equal(container.querySelectorAll('.tw-sprite-functions__entry').length, 1, 'only main is called from a script');

    draw({direction: 'TD'});
    assert.equal(container.querySelector('figure').getAttribute('data-direction'), 'TD');
    assert.equal(settings.length, 0, 'the host owns direction changes');

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
    assert.equal(container.querySelectorAll('.tw-sprite-functions__open').length, 2);
});

test('the external direction overrides saved settings and survives other settings changes', t => {
    const settings: object[] = [];
    const {container, draw} = render(t, {direction: 'TD', defaultSettings: {mode: 'graph', direction: 'LR'},
        onSettingsChange: next => settings.push(next),
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)]}});
    assert.equal(container.querySelector('figure').getAttribute('data-direction'), 'TD');
    assert.equal(container.querySelector('.tw-sprite-functions__flow'), null);
    act(() => container.querySelector<HTMLButtonElement>('[data-choice="list"]').click());
    assert.deepEqual(settings.at(-1), {mode: 'list', order: 'name', direction: 'TD', create: 'procedure'});
    const order = container.querySelector('select');
    act(() => {
        order.value = 'z';
        order.dispatchEvent(new window.Event('change', {bubbles: true}));
    });
    assert.deepEqual(settings.at(-1), {mode: 'list', order: 'z', direction: 'TD', create: 'procedure'});
    draw({direction: 'LR', view: 'graph'});
    assert.equal(container.querySelector('figure').getAttribute('data-direction'), 'LR');
    assert.equal(settings.length, 2, 'a controlled direction change does not emit a redundant settings update');
});

test('the rail direction group has two mutually exclusive labeled buttons', t => {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    const changes: string[] = [];
    const draw = (value: 'LR' | 'TD', locale = 'ja') => act(() => root.render(React.createElement(FunctionFlowToggle,
        {locale, value, onChange: next => changes.push(next)})));
    t.after(() => {act(() => root.unmount()); container.remove();});
    draw('LR');
    const [lr, td] = [...container.querySelectorAll<HTMLButtonElement>('button')];
    assert.equal(container.querySelectorAll('button').length, 2);
    assert.equal(lr.querySelectorAll('svg').length, 1);
    assert.equal(td.querySelectorAll('svg').length, 1);
    assert.equal(lr.getAttribute('aria-pressed'), 'true');
    assert.equal(td.getAttribute('aria-pressed'), 'false');
    assert.equal(lr.getAttribute('title'), '流れ: 左から右 (LR)');
    assert.equal(td.getAttribute('title'), '流れ: 上から下 (TD)');
    act(() => lr.click());
    assert.deepEqual(changes, [], 'the selected direction stays selected');
    act(() => td.click());
    assert.deepEqual(changes, ['TD']);
    draw('TD', 'en');
    assert.equal(lr.getAttribute('aria-pressed'), 'false');
    assert.equal(td.getAttribute('aria-pressed'), 'true');
    assert.equal(td.getAttribute('aria-label'), 'Flow: Top to bottom (TD)');
    act(() => lr.click());
    assert.deepEqual(changes, ['TD', 'LR']);
});

test('function and message graph filters retain only the nodes needed by their visible relations', t => {
    const endpoint = (targetId: string, scriptId: string, blockId = scriptId) => ({targetId, scriptId, blockId});
    const scriptRelations = [
        {kind: 'function', source: endpoint('cat', 'flag', 'call'), destination: endpoint('cat', 'main'), label: 'main', wait: true},
        {kind: 'function', source: endpoint('cat', 'main', 'call-draw'), destination: endpoint('cat', 'draw'), label: 'draw', wait: true},
        {kind: 'message', source: endpoint('cat', 'main', 'send'), destination: endpoint('cat', 'receive'), label: 'ready', wait: false},
        {kind: 'message', source: endpoint('cat', 'flag', 'wait'), destination: endpoint('other', 'foreign-receive'), label: 'ready', wait: true},
        {kind: 'message', source: endpoint('cat', 'main', 'send-draw'), destination: endpoint('cat', 'draw'), label: 'draw', wait: false},
        {kind: 'message', source: endpoint('foreign', 'unrelated-send'), destination: endpoint('other', 'unrelated-receive'), label: 'elsewhere', wait: false}
    ];
    const opened: object[] = [];
    const functions: string[] = [];
    const {container, draw} = render(t, {view: 'graph', selectedId: 'flag',
        onOpenRelationScript: value => opened.push(value), onOpenFunction: value => functions.push(value.id),
        data: {targetId: 'cat', isStage: false,
            functions: [fn('main', 'main', 0, 0), fn('draw', 'draw', 0, 0), fn('isolated', 'isolated', 0, 0)],
            scriptRelations, scripts: [
                {targetId: 'cat', scriptId: 'flag', label: 'Green flag'},
                {targetId: 'cat', scriptId: 'receive', label: 'Receive ready'},
                {targetId: 'other', scriptId: 'foreign-receive', label: 'Receive ready', targetName: 'Other'}
            ]}});
    const mainEdges = (kind: string) => container.querySelectorAll(`.tw-sprite-functions__edges > path[data-script-relation="${kind}"]`);
    const nodes = () => [...container.querySelectorAll('.tw-sprite-functions__node .tw-sprite-functions__name')]
        .map(node => node.textContent);
    assert.equal(mainEdges('function').length, 2);
    assert.equal(mainEdges('message').length, 3);
    assert.equal(nodes().length, 6);
    assert.ok(nodes().includes('isolated'));
    assert.equal(nodes().includes('unrelated-send'), false);
    assert.equal(container.querySelector('.tw-sprite-functions__notice'), null, 'script graphs are not covered by a functions-only empty notice');
    const flag = [...container.querySelectorAll<HTMLButtonElement>('[data-script-key]')].find(node => node.textContent === 'Green flag');
    assert.equal(flag.getAttribute('aria-current'), 'true');
    act(() => flag.click());
    const remote = container.querySelector<HTMLButtonElement>('[data-script-key][data-owner="other"]');
    act(() => remote.click());
    assert.deepEqual(opened, [endpoint('cat', 'flag'), endpoint('other', 'foreign-receive')]);
    assert.deepEqual(functions, [], 'script hats never enter the function editor');
    act(() => container.querySelector<HTMLButtonElement>('[data-function-key="main"]').click());
    assert.deepEqual(functions, ['main']);
    assert.equal(container.querySelectorAll('.tw-sprite-functions__relation-wait').length, 1);
    const shared = [...container.querySelectorAll<SVGPathElement>('.tw-sprite-functions__edges > path[data-edge="main>draw"]')];
    assert.equal(shared.length, 2);
    assert.notEqual(shared[0].getAttribute('d'), shared[1].getAttribute('d'), 'different relation kinds have separate lanes');

    draw({relationVisibility: {function: true, message: false}});
    assert.equal(mainEdges('function').length, 2);
    assert.equal(mainEdges('message').length, 0);
    assert.equal(container.querySelectorAll('[data-script-key]').length, 1, 'the caller hat stays while message-only scripts disappear');
    assert.equal(nodes().length, 4);
    assert.ok(nodes().includes('isolated'), 'functions ON retains isolated definitions');
    draw({relationVisibility: {function: false, message: true}});
    assert.equal(mainEdges('function').length, 0);
    assert.equal(mainEdges('message').length, 3);
    assert.equal(nodes().length, 5);
    assert.equal(nodes().includes('isolated'), false);
    draw({relationVisibility: {function: false, message: false}});
    assert.equal(nodes().length, 0);
    assert.equal(container.querySelectorAll('[data-edge]').length, 0);
    assert.ok(container.querySelector('.tw-sprite-functions__minimap'));
    assert.ok(container.querySelector('.tw-sprite-functions__zoom'));
});

test('a message-only graph can show scripts without any function definitions', t => {
    const {container} = render(t, {view: 'graph', relationVisibility: {function: false, message: true},
        data: {targetId: 'cat', isStage: false, functions: [], scriptRelations: [{kind: 'message',
            source: {targetId: 'cat', blockId: 'send', scriptId: 'flag'},
            destination: {targetId: 'cat', blockId: 'receive', scriptId: 'receive'}, label: 'ready', wait: false}],
            scripts: [{targetId: 'cat', scriptId: 'flag', label: 'Green flag'},
                {targetId: 'cat', scriptId: 'receive', label: 'Receive ready'}]}});
    assert.equal(container.querySelectorAll('[data-script-key]').length, 2);
    assert.equal(container.querySelectorAll('[data-function-key]').length, 0);
    assert.equal(container.querySelector('.tw-sprite-functions__notice'), null);
});

test('each node pair has one edge per kind, with receiver-side message names, wait modes, and foreign owners', t => {
    const endpoint = (targetId: string, scriptId: string) => ({targetId, scriptId, blockId: scriptId});
    const send = (name: string, wait = false) => ({kind: 'message', label: name, wait,
        source: endpoint('cat', 'entry'), destination: endpoint('cat', 'worker')});
    const {container, draw} = render(t, {view: 'graph', direction: 'LR',
        data: {targetId: 'cat', isStage: false, functions: [fn('entry', 'entry', 0, 0), fn('worker', 'worker', 0, 0)],
            scripts: [{targetId: 'other', scriptId: 'remote', label: 'remote_task', targetName: 'Robot Sprite'},
                {targetId: 'stage', scriptId: 'backdrop', label: 'Backdrop Ready', targetName: 'Stage BG', isStage: true}],
            scriptRelations: [
                {kind: 'function', label: 'worker', wait: true, source: endpoint('cat', 'entry'), destination: endpoint('cat', 'worker')},
                send('Start Signal'), send('Start Signal'), send('Finish Signal', true), send('Mixed Signal'), send('Mixed Signal', true),
                {kind: 'function', label: 'remote_task', wait: true, source: endpoint('cat', 'entry'), destination: endpoint('other', 'remote')},
                {kind: 'message', label: 'Backdrop Ready', wait: true, source: endpoint('cat', 'entry'), destination: endpoint('stage', 'backdrop')}
            ]}});
    for (const direction of ['LR', 'TD']) {
        draw({direction});
        const paths = [...container.querySelectorAll<SVGPathElement>('.tw-sprite-functions__edges > path[data-edge="entry>worker"]')];
        assert.equal(paths.length, 2);
        assert.deepEqual(paths.map(path => path.getAttribute('data-script-relation')), ['function', 'message']);
        assert.notEqual(paths[0].getAttribute('d'), paths[1].getAttribute('d'));
        const label = container.querySelector('.tw-sprite-functions__edge-label[data-edge="entry>worker"]');
        assert.equal(label.getAttribute('data-script-relation'), 'message');
        const rows = [...label.querySelectorAll('.tw-sprite-functions__edge-label-row')];
        assert.deepEqual(rows.map(row => row.getAttribute('data-message-name')), ['Start Signal', 'Finish Signal', 'Mixed Signal']);
        assert.deepEqual(rows.map(row => row.querySelector('text').textContent), ['💬 Start Signal', '💬 Finish Signal', '💬 Mixed Signal']);
        assert.deepEqual(rows.map(row => row.querySelectorAll('.tw-sprite-functions__relation-wait').length), [0, 1, 1]);
        assert.equal(rows[2].querySelector('title').textContent, 'Mixed Signal · 送る / 送って待つ');
        const visible = [...container.querySelectorAll('.tw-sprite-functions__edge-label text')].map(node => node.textContent);
        assert.ok(container.textContent.includes('Robot Sprite'));
        assert.ok(visible.includes('remote_task'));
        assert.ok(container.textContent.includes('背景'));
        assert.ok(visible.includes('💬 Backdrop Ready'));
        assert.equal(visible.includes('Stage BG'), false, 'target names are shown only in nodes');
        assert.equal(container.querySelector('.tw-sprite-functions__edge-label-owner'), null);
        assert.equal(visible.includes('Robot Sprite'), false);
        assert.equal(visible.includes('背景'), false);
    }
});

test('graph filter buttons are independent and their tooltips explain the current action', t => {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    const changes: object[] = [];
    const draw = (value: {function: boolean; message: boolean}, locale = 'ja') =>
        act(() => root.render(React.createElement(FunctionRelationToggles, {locale, value, onChange: next => changes.push(next)})));
    t.after(() => {act(() => root.unmount()); container.remove();});
    draw({function: true, message: true});
    const functions = container.querySelector<HTMLButtonElement>('[data-relation-kind="function"]');
    const messages = container.querySelector<HTMLButtonElement>('[data-relation-kind="message"]');
    assert.equal(functions.getAttribute('aria-label'), '関数');
    assert.equal(messages.getAttribute('aria-label'), 'メッセージ');
    assert.equal(functions.getAttribute('title'), '関数の呼び出し関係を隠す');
    assert.equal(messages.getAttribute('title'), 'メッセージの送受信関係を隠す');
    act(() => functions.click());
    assert.deepEqual(changes.at(-1), {function: false, message: true});
    draw({function: false, message: true});
    assert.equal(functions.getAttribute('aria-pressed'), 'false');
    assert.equal(functions.getAttribute('title'), '関数の呼び出し関係を表示');
    act(() => messages.click());
    assert.deepEqual(changes.at(-1), {function: false, message: false});
    draw({function: false, message: false}, 'en');
    assert.equal(functions.getAttribute('title'), 'Show function calls');
    assert.equal(messages.getAttribute('title'), 'Show message sends and receivers');
});

test('controlled graph filters survive other settings changes without replacing the host value', t => {
    const settings: object[] = [];
    const visibility = {function: false, message: true};
    const {container} = render(t, {view: 'list', direction: 'TD', relationVisibility: visibility,
        defaultSettings: {relationVisibility: {function: true, message: false}},
        onSettingsChange: next => settings.push(next), data: {targetId: 'cat', isStage: false, functions: []}});
    const select = container.querySelector('select');
    act(() => {select.value = 'n'; select.dispatchEvent(new window.Event('change', {bubbles: true}));});
    assert.deepEqual(settings.at(-1), {mode: 'list', order: 'n', direction: 'TD', create: 'procedure', relationVisibility: visibility});
});

// The NAME of a named-functions block is a text input; a reporter dropped on it leaves the shadow below.
const text = (id: string, value: string, parent: string) =>
    ({[id]: {id, opcode: 'text', shadow: true, parent, fields: {TEXT: {name: 'TEXT', value}}}});
const input = (id: string, block = id) => ({block, shadow: id});

test('named functions are read with Scratch functions, and calls between the two kinds become edges', () => {
    const data = readTargetFunctions({id: 'cat', blocks: {_blocks: {
        greet: {id: 'greet', opcode: 'kubohiroyanamedfunctions_defineFunction', topLevel: true, x: 10, y: 20,
            inputs: {NAME: input('greet-name'), DESCRIPTION: input('greet-text')},
            fields: {SCOPE: {value: 'sprite'}, EXPORT: {value: 'tool'}}},
        ...text('greet-name', ' greet ', 'greet'),
        ...text('greet-text', 'Says hello.', 'greet'),
        // Saved before SCOPE existed: for all sprites.
        old: {id: 'old', opcode: 'kubohiroyanamedfunctions_defineFunction', topLevel: true, inputs: {NAME: input('old-name')}},
        ...text('old-name', 'legacy', 'old'),
        // A reporter decides this name at run time, so it cannot be listed.
        dynamic: {id: 'dynamic', opcode: 'kubohiroyanamedfunctions_defineFunction', topLevel: true,
            inputs: {NAME: input('dynamic-name', 'answer')}},
        ...text('dynamic-name', 'hidden', 'dynamic'),
        answer: {id: 'answer', opcode: 'sensing_answer', parent: 'dynamic'},
        // greet calls the custom block, which starts greet back and calls legacy from the menu.
        say: {id: 'say', opcode: 'procedures_call', parent: 'greet', mutation: {proccode: 'say hi'}},
        def: {id: 'def', opcode: 'procedures_definition', topLevel: true, inputs: {custom_block: {block: 'proto'}}},
        proto: {id: 'proto', opcode: 'procedures_prototype', parent: 'def',
            mutation: {proccode: 'say hi', argumentnames: '[]', warp: 'false'}},
        start: {id: 'start', opcode: 'kubohiroyanamedfunctions_startFunction', parent: 'def', inputs: {NAME: input('start-name')}},
        ...text('start-name', 'greet', 'start'),
        menu: {id: 'menu', opcode: 'kubohiroyanamedfunctions_callFunctionFromMenu', parent: 'start', fields: {FUNCTION: {value: 'legacy'}}},
        // The green flag calls greet by name.
        flag: {id: 'flag', opcode: 'event_whenflagclicked', topLevel: true},
        call: {id: 'call', opcode: 'kubohiroyanamedfunctions_callFunction', parent: 'flag', inputs: {NAME: input('call-name')}},
        ...text('call-name', 'greet', 'call'),
        // Another extension's block of the same shape is not read unless asked for.
        other: {id: 'other', opcode: 'someoneelse_defineFunction', topLevel: true, inputs: {NAME: input('other-name')}},
        ...text('other-name', 'other', 'other')
    }}});
    const byId = Object.fromEntries(data.functions.map(item => [item.id, item]));
    assert.deepEqual(Object.keys(byId).sort(), ['def', 'greet', 'old']);
    assert.deepEqual(byId.greet, {id: 'greet', kind: 'named', proccode: 'greet', argumentNames: [], warp: false, x: 10, y: 20,
        calls: 2, scriptCalls: 1, callees: ['def'], scope: 'sprite', description: 'Says hello.',
        uses: [{block: 'start', script: 'def'}, {block: 'call', script: 'flag'}]});
    assert.equal(byId.old.scope, 'global');
    assert.equal(byId.old.calls, 1);
    assert.deepEqual(byId.def.callees.sort(), ['greet', 'old']);
    assert.equal(functionLabel(byId.greet), 'greet');

    const composed = readTargetFunctions({id: 'cat', blocks: {_blocks: {
        other: {id: 'other', opcode: 'someoneelse_defineFunction', topLevel: true, inputs: {NAME: input('other-name')}},
        ...text('other-name', 'other', 'other')
    }}}, {extensions: ['someoneelse']});
    assert.deepEqual(composed.functions.map(item => item.proccode), ['other']);
});

const N = 'kubohiroyanamedfunctions';
/** A `define function` hat named `name`, for all sprites unless `scope` says otherwise, with a body of `body`. */
const defineFunction = (id: string, name: string, scope = 'global', next?: string) => ({
    [id]: {id, opcode: `${N}_defineFunction`, topLevel: true, next, inputs: {NAME: input(`${id}-name`)},
        fields: {SCOPE: {value: scope}}},
    ...text(`${id}-name`, name, id)
});
const callFunction = (id: string, name: string, parent: string) => ({
    [id]: {id, opcode: `${N}_callFunction`, parent, inputs: {NAME: input(`${id}-name`)}},
    ...text(`${id}-name`, name, id)
});

test('global functions of other sprites join the reading with the links into and out of this sprite', () => {
    // The cat's jump calls the stage's global log; the dog's global bark calls the cat's global meow.
    const cat = {id: 'cat', getName: () => 'Cat', blocks: {_blocks: {
        def: {id: 'def', opcode: 'procedures_definition', topLevel: true, inputs: {custom_block: {block: 'proto'}}},
        proto: {id: 'proto', opcode: 'procedures_prototype', parent: 'def', mutation: {proccode: 'jump', argumentnames: '[]'}},
        ...callFunction('to-log', 'log', 'def'),
        ...defineFunction('meow', 'meow'),
        flag: {id: 'flag', opcode: 'event_whenflagclicked', topLevel: true},
        ...callFunction('flag-log', 'log', 'flag')
    }}};
    const stage = {id: 'stage', isStage: true, getName: () => 'Stage', blocks: {_blocks: {
        ...defineFunction('log', 'log'),
        ...defineFunction('unused', 'unused')
    }}};
    const dog = {id: 'dog', sprite: {name: 'Dog'}, blocks: {_blocks: {
        ...defineFunction('bark', 'bark', 'global', 'bark-meow'),
        ...callFunction('bark-meow', 'meow', 'bark'),
        // A function only the dog can call is not a global one, so its call is left out.
        ...defineFunction('wag', 'wag', 'sprite'),
        ...callFunction('wag-meow', 'meow', 'wag')
    }}};
    const data = readTargetFunctions(cat, {others: [cat, stage, dog], getTargetThumbnail: id => `preview:${id}`});
    assert.deepEqual(data.functions.find(fn => fn.id === 'def').callees, ['stage:log']);
    assert.deepEqual(data.globals.map(fn => ({id: fn.id, name: fn.proccode, owner: fn.owner, callees: fn.callees,
        calls: fn.calls, scriptCalls: fn.scriptCalls})).sort((a, b) => a.id < b.id ? -1 : 1), [
        {id: 'dog:bark', name: 'bark', owner: {targetId: 'dog', name: 'Dog', isStage: false, functionId: 'bark', thumbnailUrl: 'preview:dog'},
            callees: ['meow'], calls: 0, scriptCalls: 0},
        {id: 'stage:log', name: 'log', owner: {targetId: 'stage', name: 'Stage', isStage: true, functionId: 'log', thumbnailUrl: 'preview:stage'},
            callees: [], calls: 2, scriptCalls: 1}
    ], 'only the global functions linked to this sprite, counted by its own calls');
    assert.equal(readTargetFunctions(cat).globals, undefined, 'without the other targets nothing else is read');

    // A sprite's own function of a name wins over a global one elsewhere.
    const own = readTargetFunctions({id: 'cat', blocks: {_blocks: {...defineFunction('mine', 'log', 'sprite'),
        ...defineFunction('caller', 'caller', 'sprite'), ...callFunction('c', 'log', 'caller')}}}, {others: [stage]});
    assert.equal(own.globals, undefined);
    assert.deepEqual(own.functions.find(fn => fn.id === 'caller').callees, ['mine']);
});

test('the call graph draws global functions grey, naming the sprite of one defined elsewhere', t => {
    const opened: string[] = [];
    const {container} = render(t, {
        view: 'graph',
        onOpenFunction: ({id}: {id: string}) => opened.push(id),
        data: {targetId: 'cat', isStage: false, functions: [
            fn('jump', 'jump', 0, 0, {callees: ['stage:log']}),
            fn('meow', 'meow', 0, 0, {kind: 'named', scope: 'global', calls: 0, scriptCalls: 0})
        ], globals: [
            fn('stage:log', 'log', 0, 0, {kind: 'named', scope: 'global', owner: {targetId: 'stage', name: 'Stage', isStage: true, functionId: 'log'}}),
            fn('dog:bark', 'bark', 0, 0, {kind: 'named', scope: 'global', callees: ['meow'], calls: 0, scriptCalls: 0,
                owner: {targetId: 'dog', name: 'Dog', isStage: false, functionId: 'bark'}})
        ]}
    });
    const node = (id: string) => container.querySelector<HTMLButtonElement>(`[data-function-key="${id}"]`);
    assert.deepEqual(['jump', 'meow', 'stage:log', 'dog:bark'].map(id => node(id).getAttribute('data-scope')),
        [null, 'global', 'global', 'global'], 'every global function is grey, this sprite\'s too');
    assert.equal(node('stage:log').querySelector('.tw-sprite-functions__name').textContent, '背景');
    assert.equal(node('dog:bark').querySelector('.tw-sprite-functions__name').textContent, 'Dog');
    assert.equal(node('dog:bark').querySelector('.tw-sprite-functions__owner'), null);
    assert.equal(node('dog:bark').getAttribute('aria-label'), 'Dog · bark');
    assert.match(node('dog:bark').title, /bark/);
    assert.equal(node('meow').querySelector('.tw-sprite-functions__owner'), null);
    assert.match(node('dog:bark').title, /^Dog のグローバル関数/);
    assert.deepEqual([...container.querySelectorAll('[data-edge]')].map(edge => edge.getAttribute('data-edge')).sort(),
        ['dog:bark>meow', 'jump>stage:log']);
    // The host opens a foreign function using the original owner metadata.
    act(() => node('dog:bark').click());
    act(() => node('meow').click());
    assert.deepEqual(opened, ['dog:bark', 'meow']);
    assert.equal(node('dog:bark').getAttribute('aria-disabled'), null);
    // meow is called from the dog, and the dog's bark is counted there, so neither reads as unused.
    assert.equal(node('meow').hasAttribute('data-unused'), false);
    assert.equal(node('dog:bark').hasAttribute('data-unused'), false);
    assert.equal(node('jump').hasAttribute('data-unused'), false);
});

test('named functions gather in their own section below the standard ones, with their scope and description', t => {
    const {container, draw} = render(t, {data: {targetId: 'cat', isStage: false, functions: [
        fn('greet', 'greet', 0, 0, {kind: 'named', scope: 'global', description: 'Says hello.'}),
        fn('jump', 'jump', 0, 0)
    ]}});
    assert.deepEqual([...container.querySelectorAll('.tw-sprite-functions__group')].map(node => node.textContent),
        ['関数', 'TurboWarp Plus 名前付き関数']);
    const [jump, greet] = container.querySelectorAll('.tw-sprite-functions__item');
    assert.equal(greet.closest('[data-list]').getAttribute('data-list'), 'named');
    // The section says what they are, so the items need not.
    assert.deepEqual([...greet.querySelectorAll('.tw-sprite-functions__badge')].map(node => node.textContent),
        ['すべてのスプライト', '1か所で使用']);
    assert.equal(greet.querySelector('.tw-sprite-functions__name').getAttribute('title'), 'Says hello.');
    assert.equal(greet.getAttribute('data-kind'), 'named');
    assert.deepEqual([...jump.querySelectorAll('.tw-sprite-functions__badge')].map(node => node.textContent), ['1か所で使用']);

    // Without named functions there is no section for them, and a list of functions alone needs no headings.
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)]}});
    assert.equal(container.querySelector('.tw-sprite-functions__group'), null);
    // The call graph keeps one set of nodes, each named function marked as such.
    draw({defaultSettings: {mode: 'graph'}, view: 'graph', data: {targetId: 'cat', isStage: false, functions: [
        fn('greet', 'greet', 0, 0, {kind: 'named'}), fn('jump', 'jump', 0, 0)]}});
    assert.equal(container.querySelector('.tw-sprite-functions__group'), null);
});

function typeName(dialog: Element, name: string) {
    const input = dialog.querySelector<HTMLInputElement>('input[type="text"]');
    act(() => {
        // React tracks the value it set; go through the native setter as typing does.
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, name);
        input.dispatchEvent(new window.Event('input', {bubbles: true}));
    });
}
const addDialog = (container: Element) => container.querySelector('.tw-sprite-functions__add-dialog');
const submit = (dialog: Element) => act(async () => {
    dialog.querySelector('form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
});

test('the add button below the list asks for a name and a kind, and opens what it makes', async t => {
    const made: string[] = [];
    const settings: object[] = [];
    let reply: () => Promise<string | void> = async () => 'new-hop';
    const {container, draw} = render(t, {
        onSettingsChange: (next: object) => settings.push(next),
        onCreate: (kind: string, name: string) => {
            made.push(`${kind}:${name}`);
            return reply();
        },
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)]}
    });
    const add = () => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__add');
    // Below the list, at its start.
    assert.equal(container.querySelector('.tw-sprite-functions__list').nextElementSibling,
        container.querySelector('.tw-sprite-functions__create'));
    assert.equal(add().textContent, '新しい関数を追加');

    act(() => add().click());
    let dialog = addDialog(container);
    assert.equal(dialog.querySelector('h2').textContent, '新しい関数を追加');
    assert.equal(window.document.activeElement, dialog.querySelector('input[type="text"]'), 'the name field takes the focus');
    const submitButton = dialog.querySelector<HTMLButtonElement>('.tw-sprite-functions__add-submit');
    assert.ok(submitButton.disabled, 'a name is needed');
    typeName(dialog, '  hop  ');
    assert.equal(submitButton.disabled, false);
    await submit(dialog);
    assert.deepEqual(made, ['procedure:hop'], 'the name is trimmed; the standard kind comes first');
    assert.equal(addDialog(container), null, 'the dialog closes once the function is made');
    // The host refreshes the data with the new function, which then opens.
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0), fn('new-hop', 'hop', 0, 50)]}});
    assert.equal(container.querySelector('dialog').getAttribute('aria-label'), 'hop のコード');
    act(() => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__close').click());

    // The kind picked is remembered for the next time.
    act(() => add().click());
    dialog = addDialog(container);
    const radios = dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    assert.deepEqual([...radios].map(radio => radio.parentElement.textContent), ['標準（ブロック定義）', 'TurboWarp-Plus の名前付き関数']);
    act(() => radios[1].click());
    assert.deepEqual(settings.at(-1), {mode: 'list', order: 'name', direction: 'LR', create: 'named'});

    // A failure stays in the dialog, and typing clears it.
    reply = async () => { throw Object.assign(new Error('taken'), {code: 'duplicate'}); };
    typeName(dialog, 'jump');
    await submit(dialog);
    assert.deepEqual(made, ['procedure:hop', 'named:jump']);
    assert.equal(dialog.querySelector('[role="alert"]').textContent, '同じ名前の関数がすでにあります。');
    typeName(dialog, 'jump2');
    assert.equal(dialog.querySelector('[role="alert"]'), null);
    reply = async () => { throw Object.assign(new Error('no extension'), {code: 'unavailable'}); };
    await submit(dialog);
    assert.equal(dialog.querySelector('[role="alert"]').textContent,
        '拡張機能「TurboWarp-Named-Functions」を読み込めませんでした。');

    act(() => dialog.querySelector<HTMLButtonElement>('.tw-sprite-functions__add-actions button[type="button"]').click());
    assert.equal(addDialog(container), null, 'cancel closes it');
    act(() => add().click());
    assert.ok(addDialog(container).querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].checked);
    act(() => addDialog(container).querySelector<HTMLButtonElement>('.tw-sprite-functions__close').click());

    draw({editable: false});
    assert.ok(add().disabled, 'an inactive view cannot add');
});

test('in the call graph the add button sits in the bottom left corner, and a new function opens in the dialog', async t => {
    const {container, draw} = render(t, {
        view: 'graph',
        defaultSettings: {mode: 'graph', create: 'named'},
        onCreate: async () => 'made',
        mountEditor: () => undefined,
        data: {targetId: 'cat', isStage: false, functions: [fn('draw', 'draw', 0, 0)]}
    });
    const corner = container.querySelector('.tw-sprite-functions__graph > .tw-sprite-functions__corner');
    assert.ok(corner, 'inside the graph');
    assert.equal(container.querySelector('.tw-sprite-functions__create'), null, 'not also below it');
    act(() => corner.querySelector<HTMLButtonElement>('.tw-sprite-functions__add').click());
    typeName(addDialog(container), 'function1');
    await submit(addDialog(container));
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('draw', 'draw', 0, 0),
        fn('made', 'function1', 0, 0, {kind: 'named', scope: 'sprite'})]}});
    assert.equal(container.querySelector('dialog').getAttribute('aria-label'), 'function1 のコード');
    assert.equal(container.querySelector('[data-function-key="made"]').getAttribute('aria-current'), 'true',
        'and is picked out in the graph');

    // Without functions the graph stays, blank, with a notice that points to the button in its corner.
    draw({data: {targetId: 'cat', isStage: false, functions: []}});
    const figure = container.querySelector('figure');
    assert.ok(figure, 'the graph is still drawn');
    assert.equal(figure.querySelectorAll('[data-function-key]').length, 0);
    assert.equal(figure.querySelector('.tw-sprite-functions__notice[role="status"]').textContent,
        'このスプライトには関数がありません。左下の「＋ 新しい関数を追加」から作れます。');
    assert.ok(figure.querySelector('.tw-sprite-functions__corner .tw-sprite-functions__add'));
    assert.equal(figure.querySelector('.tw-sprite-functions__flow'), null);
    assert.equal(container.querySelector('.tw-sprite-functions__empty'), null, 'no line about My Blocks');
    // The list points below, to its own button.
    draw({view: 'list', data: {targetId: 'stage', isStage: true, functions: []}});
    assert.equal(container.querySelector('.tw-sprite-functions__empty').textContent,
        'ステージには関数がありません。下の「＋ 新しい関数を追加」から作れます。');
});

test('with a host opener the call graph opens functions there instead of in its dialog', async t => {
    const opened: string[] = [];
    const {container, draw} = render(t, {
        defaultSettings: {mode: 'graph'},
        onCreate: async () => 'made',
        onOpenFunction: ({id}: {id: string}) => opened.push(id),
        mountEditor: () => undefined,
        data: {targetId: 'cat', isStage: false, functions: [fn('draw', 'draw', 0, 0)]}
    });
    act(() => container.querySelector<HTMLButtonElement>('[data-function-key="draw"]').click());
    assert.deepEqual(opened, ['draw']);
    assert.equal(container.querySelector('dialog'), null);
    // A function made in the graph opens there too, once the host lists it.
    act(() => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__add').click());
    typeName(addDialog(container), 'made');
    await submit(addDialog(container));
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('draw', 'draw', 0, 0), fn('made', 'made', 0, 0)]}});
    assert.deepEqual(opened, ['draw', 'made']);
    assert.equal(container.querySelector('dialog'), null);
    // The host's selection wins over the function just added.
    draw({selectedId: 'draw'});
    assert.equal(container.querySelector('[aria-current="true"]').getAttribute('data-function-key'), 'draw');
    // Opening the same function again still reaches the host.
    act(() => container.querySelector<HTMLButtonElement>('[data-function-key="draw"]').click());
    assert.deepEqual(opened, ['draw', 'made', 'draw']);
});

test('as its own section the list shows the hat scripts above the functions, and opens either', t => {
    const scripts: string[] = [];
    const functions: string[] = [];
    const {container, draw} = render(t, {
        view: 'list',
        defaultSettings: {mode: 'graph'},
        onOpenScript: ({id}: {id: string}) => scripts.push(id),
        onOpenFunction: ({id}: {id: string}) => functions.push(id),
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)], hats: [
            {id: 'flag', label: '緑の旗が押されたとき', x: 300, y: 0},
            {id: 'click', label: 'このスプライトが押されたとき', x: 0, y: 0}
        ]}
    });
    assert.equal(container.querySelector('section').getAttribute('aria-label'), 'ハット・関数一覧');
    assert.equal(container.querySelector('[data-choice="graph"]'), null, 'a section of its own has no view switch');
    assert.deepEqual([...container.querySelectorAll('.tw-sprite-functions__group')].map(node => node.textContent), ['ハット', '関数']);
    assert.deepEqual(names(container), ['このスプライトが押されたとき', '緑の旗が押されたとき', 'jump']);

    act(() => container.querySelector<HTMLButtonElement>('[data-hat-key="flag"]').click());
    act(() => container.querySelector<HTMLButtonElement>('[data-function-key="jump"]').click());
    assert.deepEqual(scripts, ['flag']);
    assert.deepEqual(functions, ['jump']);
    assert.equal(container.querySelector('[data-hat-key="flag"]').getAttribute('aria-label'), '緑の旗が押されたとき のスクリプトを開く');

    // Hats follow the order picker too: Z reads rows from the left.
    act(() => {
        const select = container.querySelector('select');
        select.value = 'z';
        select.dispatchEvent(new window.Event('change', {bubbles: true}));
    });
    assert.deepEqual(names(container).slice(0, 2), ['このスプライトが押されたとき', '緑の旗が押されたとき']);

    // Without functions the hats stay, with the hint how to make a function below them.
    draw({data: {targetId: 'cat', isStage: false, functions: [], hats: [{id: 'flag', label: '緑の旗が押されたとき', x: 0, y: 0}]}});
    assert.deepEqual(names(container), ['緑の旗が押されたとき']);
    assert.ok(container.querySelector('.tw-sprite-functions__empty'));
});

test('as its own section the call graph has no view switch and leaves the hats out', t => {
    const {container} = render(t, {
        view: 'graph',
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)],
            hats: [{id: 'flag', label: '緑の旗が押されたとき', x: 0, y: 0}]}
    });
    assert.equal(container.querySelector('section').getAttribute('aria-label'), '呼び出し関係');
    assert.equal(container.querySelector('[data-choice="list"]'), null);
    assert.equal(container.querySelector('figure > .tw-sprite-functions__flow'), null,
        'the host places the flow control in the section rail');
    assert.equal(container.querySelector('.tw-sprite-functions__bar'), null, 'with nothing left above the graph');
    // The graph places functions by who calls whom, so it has no order to pick.
    assert.equal(container.querySelector('select'), null);
    assert.ok(container.querySelector('figure'));
    assert.equal(container.querySelector('[data-hat-key]'), null);
});

test('the list highlights what is shown beside it, marks functions and hats, and keeps it in view', t => {
    const drawing = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    drawing.setAttribute('data-drawing', 'flag');
    const {container, draw} = render(t, {
        view: 'list', selectedId: 'jump', onOpenScript() {}, onOpenFunction() {},
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)],
            hats: [{id: 'flag', label: '緑の旗 が押されたとき', x: 0, y: 0, thumbnail: drawing}]}
    });
    const current = () => [...container.querySelectorAll('[aria-current="true"]')].map(node =>
        node.getAttribute('data-function-key') ?? node.getAttribute('data-hat-key'));
    assert.deepEqual(current(), ['jump']);
    assert.ok(container.querySelector('[data-function-key="jump"] .tw-sprite-functions__icon'), 'a function shows f(x)');
    const thumbnail = container.querySelector('[data-hat-key="flag"] .tw-sprite-functions__thumbnail > svg');
    assert.equal(thumbnail?.getAttribute('data-drawing'), 'flag');
    assert.notEqual(thumbnail, drawing, 'the pane shows a copy, so one drawing can serve several views');
    draw({selectedId: 'flag'});
    assert.deepEqual(current(), ['flag']);
});

test('the uses of a function open in a dialog, and picking one shows that block in its script', t => {
    const scripts: [string, string?][] = [];
    const functions: [string, string?][] = [];
    const {container} = render(t, {
        view: 'list',
        onOpenScript: ({id}: {id: string}, options?: {block?: string}) => scripts.push([id, options?.block]),
        onOpenFunction: ({id}: {id: string}, options?: {block?: string}) => functions.push([id, options?.block]),
        data: {targetId: 'cat', isStage: false, functions: [
            fn('jump', 'jump', 0, 0, {calls: 3, uses: [{block: 'c1', script: 'flag'}, {block: 'c2', script: 'land'},
                {block: 'c3', script: 'loose'}]}),
            fn('land', 'land', 0, 50, {calls: 0, uses: []})
        ], hats: [{id: 'flag', label: '緑の旗 が押されたとき', x: 0, y: 0}]}
    });
    const button = container.querySelector<HTMLButtonElement>('[data-uses-key="jump"]');
    assert.equal(button.textContent, '3か所で使用');
    assert.equal(button.closest('[data-function-key]'), null, 'the uses button sits beside the open button, not in it');
    const open = () => {
        act(() => container.querySelector<HTMLButtonElement>('[data-uses-key="jump"]').click());
        return container.querySelector('dialog');
    };
    let dialog = open();
    assert.equal(dialog.getAttribute('aria-label'), 'jump を使っている箇所');
    assert.deepEqual([...dialog.querySelectorAll('[data-use-block]')].map(node => node.textContent),
        ['緑の旗 が押されたとき の中', 'land の中', 'ハットのないスクリプト の中']);
    assert.equal(dialog.querySelector('.tw-sprite-functions__close').getAttribute('aria-label'), '閉じる');

    act(() => dialog.querySelector<HTMLButtonElement>('[data-use-block="c1"]').click());
    assert.equal(container.querySelector('dialog'), null, 'picking a use closes the dialog');
    dialog = open();
    act(() => dialog.querySelector<HTMLButtonElement>('[data-use-block="c2"]').click());
    dialog = open();
    act(() => dialog.querySelector<HTMLButtonElement>('[data-use-block="c3"]').click());
    assert.deepEqual(scripts, [['flag', 'c1'], ['loose', 'c3']]);
    assert.deepEqual(functions, [['land', 'c2']]);

    act(() => container.querySelector<HTMLButtonElement>('[data-uses-key="land"]').click());
    assert.equal(container.querySelector('dialog .tw-sprite-functions__empty').textContent,
        'この関数を呼んでいるブロックはありません。');
    act(() => container.querySelector<HTMLButtonElement>('dialog .tw-sprite-functions__close').click());
    assert.equal(container.querySelector('dialog'), null);
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

    // Dragging the background moves the graph without moving or opening a node.
    act(() => {
        figure.dispatchEvent(new window.MouseEvent('pointerdown', {bubbles: true, button: 0, clientX: 50, clientY: 50}));
        window.dispatchEvent(new window.MouseEvent('pointermove', {clientX: 80, clientY: 60}));
    });
    assert.ok(figure.hasAttribute('data-panning'));
    act(() => {
        window.dispatchEvent(new window.MouseEvent('pointerup', {clientX: 80, clientY: 60}));
        figure.dispatchEvent(new window.MouseEvent('click', {bubbles: true, detail: 1}));
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

test('hand-placed graph positions restore per target and direction and survive hidden relation kinds', t => {
    const data = {targetId: 'cat', isStage: false, functions: [
        fn('entry', 'entry', 10, 20, callees('entry', ['worker'])), fn('worker', 'worker', 30, 40)
    ]};
    const snapshot = structuredClone(data);
    const positions = {cat: {LR: {worker: {x: -80, y: -60}}, TD: {worker: {x: 250, y: 100}}},
        other: {LR: {worker: {x: 10, y: 20}}}};
    const {container, draw} = render(t, {view: 'graph', direction: 'LR', data, defaultSettings: {graphPositions: positions}});
    const point = () => {
        const node = container.querySelector<HTMLElement>('[data-function-key="worker"]').parentElement;
        return {x: parseFloat(node.style.left), y: parseFloat(node.style.top)};
    };
    assert.deepEqual(point(), positions.cat.LR.worker);
    const mini = container.querySelector<SVGRectElement>('[data-node-key="worker"]');
    assert.deepEqual([Number(mini.getAttribute('x')), Number(mini.getAttribute('y'))], [-80, -60]);
    const area = container.querySelector('.tw-sprite-functions__minimap svg').getAttribute('viewBox').split(' ').map(Number);
    assert.ok(area[0] < -80 && area[1] < -60, 'negative positions remain inside the navigable minimap area');
    draw({direction: 'TD'});
    assert.deepEqual(point(), positions.cat.TD.worker);
    draw({direction: 'LR'});
    assert.deepEqual(point(), positions.cat.LR.worker);
    draw({data: {...data, targetId: 'other'}});
    assert.deepEqual(point(), positions.other.LR.worker);
    draw({data, relationVisibility: {function: false, message: false}});
    assert.equal(container.querySelector('[data-function-key="worker"]'), null);
    draw({data, relationVisibility: {function: true, message: true}});
    assert.deepEqual(point(), positions.cat.LR.worker);
    assert.deepEqual(data, snapshot, 'diagram settings do not modify the script block positions');
});


test('the 0.9 messageGraph API preserves foreign ownership, unmatched scripts, and arrow-only settings', t => {
    const script = (id, targetId = 'cat', patch = {}) => ({id, targetId, targetName: targetId === 'cat' ? 'Cat' : 'Dog',
        isStage: false, scriptId: id.split(':').at(-1), opcode: 'event_whenbroadcastreceived', receivedMessage: 'go', x: 0, y: 0, ...patch});
    const data = {targetId: 'cat', isStage: false, functions: [],
        globals: [fn('dog:global', 'global', 0, 0, {kind: 'named', scope: 'global',
            owner: {targetId: 'dog', name: 'Dog', isStage: false, functionId: 'global'}, uses: [{block: 'call', script: 'flag'}]})],
        messageGraph: {scripts: [script('flag'), script('dog:flag', 'dog'), script('unmatched'),
            script('dog:producer', 'dog', {definition: fn('producer', 'produce', 0, 0,
                {uses: [{block: 'foreign-call', script: 'flag'}]})})],
            edges: [{from: 'flag', to: 'dog:flag', messageKey: 'go', messageName: 'go', wait: true}]}};
    const opened = [];
    const {container, draw} = render(t, {view: 'graph', data, onOpenScript: item => opened.push(item)});
    const source = 'script:["cat","flag"]';
    const foreign = 'script:["dog","flag"]';
    const calls = [...container.querySelectorAll('path[data-edge][data-script-relation="function"]')]
        .map(edge => edge.getAttribute('data-edge')).sort();
    assert.deepEqual(calls, [`${foreign}>dog:producer`, `${source}>dog:global`].sort());
    const receiver = container.querySelector<HTMLButtonElement>(`[data-script-key='${foreign}']`);
    act(() => receiver.click());
    assert.equal(opened[0].id, 'flag');
    assert.equal(opened[0].targetId, 'dog');
    const before = [...container.querySelectorAll('.tw-sprite-functions__nodes > li')].map(node => node.getAttribute('style'));
    const path = container.querySelector('[data-edge][data-script-relation="function"]').getAttribute('d');
    draw({defaultSettings: undefined, data});
    // Settings are restored on a fresh mount, while controlled direction/filter props remain separate.
    const hidden = render(t, {view: 'graph', data, defaultSettings: {showMessages: false}}).container;
    assert.equal(hidden.querySelector('[data-edge][data-script-relation="message"]'), null);
    assert.deepEqual([...hidden.querySelectorAll('.tw-sprite-functions__nodes > li')].map(node => node.getAttribute('style')), before);
    assert.equal(hidden.querySelector('[data-edge][data-script-relation="function"]').getAttribute('d'), path);
    assert.equal(hidden.querySelectorAll('[data-script-key]').length, 3, 'unmatched local scripts remain present');
    const controlled = render(t, {view: 'graph', data, defaultSettings: {showCalls: false, showMessages: false},
        relationVisibility: {function: true, message: true}}).container;
    assert.ok(controlled.querySelector('path[data-edge][data-script-relation="function"]'));
    assert.ok(controlled.querySelector('path[data-edge][data-script-relation="message"]'),
        'new controlled relation filters override legacy saved arrow settings');
});

test('external function labels contain the function once and their nodes contain only the target', t => {
    const endpoint = (targetId, scriptId) => ({targetId, scriptId, blockId: scriptId});
    const remote = fn('dog:bark', 'bark', 0, 0, {owner: {targetId: 'dog', name: 'Dog', isStage: false, functionId: 'bark', thumbnailUrl: 'data:image/svg+xml,dog'}});
    const stage = fn('stage:log', 'log', 0, 0, {owner: {targetId: 'stage', name: 'Stage', isStage: true, functionId: 'log', thumbnailUrl: 'data:image/svg+xml,stage'}});
    const opened = [];
    const {container} = render(t, {view: 'graph', onOpenFunction: item => opened.push(item),
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)], globals: [remote, stage],
            scriptRelations: [remote, stage].map(fn => ({kind: 'function', source: endpoint('cat', 'jump'),
                destination: endpoint(fn.owner.targetId, fn.owner.functionId), label: fn.proccode, wait: false}))}});
    for (const [item, owner] of [[remote, 'Dog'], [stage, '背景']]) {
        const label = container.querySelector(`[data-edge="jump>${item.id}"].tw-sprite-functions__edge-label`);
        assert.deepEqual([...label.querySelectorAll('text')].map(node => node.textContent), [item.proccode]);
        const node = container.querySelector<HTMLButtonElement>(`[data-function-key="${item.id}"]`);
        assert.equal(node.querySelector('.tw-sprite-functions__name').textContent, owner);
        assert.equal(node.getAttribute('aria-label'), `${owner} · ${item.proccode}`);
        assert.match(node.title, new RegExp(item.proccode));
        const image = node.querySelector('img');
        assert.equal(image.getAttribute('src'), item.owner.thumbnailUrl);
        assert.equal(image.getAttribute('alt'), '');
        assert.equal(image.draggable, false);
        act(() => node.click());
        assert.equal(opened.at(-1).owner.targetId, item.owner.targetId);
    }
});

test('scanner data keeps self-sends and reverse messages readable while explicit endpoint data stays authoritative', t => {
    const scripts = ['a', 'b'].map(id => ({id, targetId: 'cat', targetName: 'Cat', isStage: false,
        scriptId: id, opcode: 'event_whenbroadcastreceived', receivedMessage: id, x: 0, y: 0}));
    for (const direction of ['LR', 'TD']) {
        const messageGraph = {scripts, edges: [
            {from: 'a', to: 'b', messageKey: 'go', messageName: 'go', wait: false},
            {from: 'b', to: 'a', messageKey: 'back', messageName: 'back', wait: false},
            ...[false, true].map(wait => ({from: 'a', to: 'a', messageKey: 'self', messageName: 'self', wait}))
        ]};
        const data = {targetId: 'cat', isStage: false, functions: [], messageGraph};
        const {container} = render(t, {view: 'graph', defaultSettings: {direction}, data});
        assert.equal(container.querySelectorAll('path[data-edge][data-kind="back"]').length, 1);
        assert.equal(container.querySelectorAll('.tw-sprite-functions__edge-label-row[data-message-name="self"]').length, 1);
        assert.equal(container.querySelectorAll('.tw-sprite-functions__relation-wait').length, 1);
        const transforms = [...container.querySelectorAll('.tw-sprite-functions__edge-label')].map(node => node.getAttribute('transform'));
        assert.equal(new Set(transforms).size, 3, 'forward, reverse, and self labels occupy distinct receiving positions');
        const explicit = render(t, {view: 'graph', data: {...data, scripts: scripts.map(script => ({...script, label: script.id})),
            scriptRelations: []}}).container;
        assert.equal(explicit.querySelectorAll('.tw-sprite-functions__node').length, 0,
            'scanner nodes never override the explicit relation filter and endpoint list');
    }
});

test('readTargetFunctions preserves the shared message scanner and describeScript callback', () => {
    const target = {id: 'cat', variables: {go: {name: 'Start', type: 'broadcast_msg'}}, blocks: {_blocks: {
        receive: {id: 'receive', opcode: 'event_whenbroadcastreceived', topLevel: true,
            fields: {BROADCAST_OPTION: {id: 'go', value: 'Start'}}}
    }}};
    const data = readTargetFunctions(target, {describeScript: (targetId, scriptId) => `${targetId}/${scriptId}`});
    assert.equal(data.messageGraph.scripts[0].label, 'cat/receive');
    assert.equal(data.messageGraph.scripts[0].receivedMessage, 'Start');
    assert.deepEqual(data.messageGraph.edges, []);
});


test('script names and target names use separate complete rows and long names grow all graph geometry', t => {
    const endpoint = (scriptId: string) => ({targetId: 'cat', scriptId, blockId: scriptId});
    const normal = {targetId: 'cat', scriptId: 'flag', label: '緑の旗が押されたとき', targetName: 'スプライト1'};
    const data = {targetId: 'cat', isStage: false, functions: [fn('worker', 'worker', 0, 0)], scripts: [normal],
        scriptRelations: [{kind: 'function', source: endpoint('flag'), destination: endpoint('worker'), label: 'worker', wait: false}]};
    const {container, draw} = render(t, {view: 'graph', direction: 'LR', data});
    const script = () => container.querySelector<HTMLElement>('[data-script-key]');
    assert.equal(script().querySelector('.tw-sprite-functions__name').textContent, normal.label);
    assert.equal(script().querySelector('.tw-sprite-functions__name').children.length, 1);
    assert.equal(script().querySelector('.tw-sprite-functions__owner').textContent, normal.targetName);
    assert.equal(script().parentElement.style.height, '44px');
    const long = {...normal, label: normal.label.repeat(4), targetName: normal.targetName.repeat(5)};
    for (const direction of ['LR', 'TD']) {
        draw({direction, data: {...data, scripts: [long]}});
        assert.equal(script().querySelector('.tw-sprite-functions__name').textContent, long.label);
        assert.equal(script().querySelector('.tw-sprite-functions__owner').textContent, long.targetName);
        const height = parseFloat(script().parentElement.style.height);
        assert.ok(height > 44);
        for (const node of container.querySelectorAll<HTMLElement>('.tw-sprite-functions__nodes > li')) {
            assert.equal(parseFloat(node.style.height), height);
        }
        for (const node of container.querySelectorAll<SVGRectElement>('.tw-sprite-functions__minimap rect[data-node-key]')) {
            assert.equal(Number(node.getAttribute('height')), height);
        }
        const values = container.querySelector('path[data-edge]').getAttribute('d').match(/-?[\d.]+/g).map(Number);
        const source = script().parentElement;
        assert.equal(values[1], parseFloat(source.style.top) + (direction === 'LR' ? height / 2 : height));
    }
});
