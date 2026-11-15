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
    assert.deepEqual(settings.at(-1), {mode: 'graph', order: 'name', direction: 'TD', create: 'procedure'});

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

test('the create button switches between the two kinds and opens what it makes', async t => {
    const made: string[] = [];
    const settings: object[] = [];
    let reply: () => Promise<string | void> = async () => 'new-jump';
    const {container, draw} = render(t, {
        onSettingsChange: (next: object) => settings.push(next),
        onCreate: (kind: string) => {
            made.push(kind);
            return reply();
        },
        data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0)]}
    });
    const main = () => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__create-main');
    const kind = container.querySelector<HTMLButtonElement>('.tw-sprite-functions__create-kind');
    // Below the list, at its start.
    assert.equal(container.querySelector('.tw-sprite-functions__list').nextElementSibling,
        container.querySelector('.tw-sprite-functions__create'));
    assert.equal(main().textContent, '新しい関数(標準)を作成');
    assert.equal(kind.getAttribute('aria-label'), '作成する関数の種類を切り替える');

    await act(async () => main().click());
    assert.deepEqual(made, ['procedure']);
    // The host refreshes the data with the new function, which then opens.
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('jump', 'jump', 0, 0), fn('new-jump', 'hop', 0, 50)]}});
    assert.equal(container.querySelector('dialog').getAttribute('aria-label'), 'hop のコード');
    act(() => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__close').click());

    act(() => kind.click());
    assert.equal(main().textContent, '新しい関数(TurboWarp-Plus)を作成');
    assert.equal(container.querySelector('.tw-sprite-functions__split').getAttribute('data-kind'), 'named');
    assert.deepEqual(settings.at(-1), {mode: 'list', order: 'name', direction: 'LR', create: 'named'});

    // A cancelled dialog makes nothing and says nothing.
    reply = async () => undefined;
    await act(async () => main().click());
    assert.deepEqual(made, ['procedure', 'named']);
    assert.equal(container.querySelector('[role="alert"]'), null);

    reply = async () => { throw Object.assign(new Error('no extension'), {code: 'unavailable'}); };
    await act(async () => main().click());
    assert.equal(container.querySelector('[role="alert"]').textContent,
        '拡張機能「TurboWarp-Named-Functions」を読み込めませんでした。');
    act(() => kind.click());
    assert.equal(container.querySelector('[role="alert"]'), null, 'switching the kind clears the message');
    assert.equal(main().textContent, '新しい関数(標準)を作成');

    draw({editable: false});
    assert.ok(main().disabled && kind.disabled, 'an inactive view cannot create');
});

test('in the call graph a new function opens in the dialog', async t => {
    const {container, draw} = render(t, {
        defaultSettings: {mode: 'graph', create: 'named'},
        onCreate: async () => 'made',
        mountEditor: () => undefined,
        data: {targetId: 'cat', isStage: false, functions: []}
    });
    assert.equal(container.querySelector('.tw-sprite-functions__create-main').textContent, '新しい関数(TurboWarp-Plus)を作成');
    await act(async () => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__create-main').click());
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('made', 'function1', 0, 0, {kind: 'named', scope: 'sprite'})]}});
    assert.equal(container.querySelector('dialog').getAttribute('aria-label'), 'function1 のコード');
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
    await act(async () => container.querySelector<HTMLButtonElement>('.tw-sprite-functions__create-main').click());
    draw({data: {targetId: 'cat', isStage: false, functions: [fn('draw', 'draw', 0, 0), fn('made', 'made', 0, 0)]}});
    assert.deepEqual(opened, ['draw', 'made']);
    assert.equal(container.querySelector('dialog'), null);
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
    assert.ok(container.querySelector('[data-choice="LR"]'), 'the flow switch stays');
    // The flow buttons show icons and keep their names for tooltips and screen readers.
    const flow = container.querySelector<HTMLButtonElement>('[data-choice="TD"]');
    assert.ok(flow.querySelector('svg'));
    assert.equal(flow.getAttribute('title'), '上から下 (TD)');
    assert.equal(flow.textContent, '上から下 (TD)');
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
