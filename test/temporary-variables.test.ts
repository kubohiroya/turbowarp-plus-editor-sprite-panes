import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {EventEmitter} from 'node:events';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {readTemporaryVariables, watchTemporaryVariables} from '../dist/temporary-variables.js';
import {SpriteAssetPane} from '../dist/sprite-asset-pane.js';
import {SpriteCloneInspector, SpriteClonePagination, SpriteCloneVariables} from '../dist/sprite-clone-inspector.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent, FormData: window.FormData
});
const {createRoot} = await import('react-dom/client');

type Blocks = Record<string, object>;
let nextId = 0;
/** A temporary variable block whose VAR input holds fixed text, or a reporter when name is null. */
function block(blocks: Blocks, opcode: string, name: string | null, parent?: string) {
    const id = 'b' + ++nextId;
    const shadow = 's' + nextId;
    blocks[shadow] = {opcode: 'text', fields: {TEXT: {value: name ?? 'ignored'}}};
    let input: string = shadow;
    if (name === null) {
        input = 'r' + nextId;
        blocks[input] = {opcode: 'operator_join', inputs: {}};
    }
    blocks[id] = {opcode: 'lmsTempVars2_' + opcode, parent, inputs: {VAR: {block: input, shadow}}};
    return id;
}

/** A custom block definition, with a block under it so a temporary variable block can sit deeper. */
function definition(blocks: Blocks, id: string, proccode: string, argumentnames: string[]) {
    blocks[id] = {opcode: 'procedures_definition', parent: null, inputs: {custom_block: {block: id + '-prototype', shadow: id + '-prototype'}}};
    blocks[id + '-prototype'] = {opcode: 'procedures_prototype', parent: id,
        mutation: {proccode, argumentnames: JSON.stringify(argumentnames)}};
    blocks[id + '-body'] = {opcode: 'control_repeat', parent: id};
    return id + '-body';
}

function project({paused = false, loaded = true} = {}) {
    const events = new EventEmitter();
    const sprite: {clones: object[]} = {clones: []};
    const stage = {id: 'stage', isStage: true, isOriginal: true, blocks: {_blocks: {} as Blocks}, getName: () => 'Stage'};
    const cat = {id: 'cat', isStage: false, isOriginal: true, sprite, blocks: {_blocks: {} as Blocks}, getName: () => 'Cat'};
    const clone = {...cat, id: 'cat-clone', isOriginal: false};
    sprite.clones.push(cat, clone);
    const runtime = {
        targets: [stage, cat, clone],
        threads: [] as {target: object; variables?: Record<string, unknown>}[],
        getTargetById: (id: string) => runtime.targets.find(target => target.id === id),
        ioDevices: {clock: {_paused: paused}},
        ...loaded && {ext_lmsTempVars2: {runtimeVariables: {} as Record<string, unknown>}},
        on: (event: string, listener: () => void) => events.on(event, listener),
        removeListener: (event: string, listener: () => void) => events.removeListener(event, listener),
        emit: (event: string) => events.emit(event)
    };
    return {runtime, stage, cat, clone};
}

test('a sprite lists the thread variables its code names with fixed text, with their uses', () => {
    const {runtime, cat, stage} = project();
    block(cat.blocks._blocks, 'setThreadVariable', 'i');
    block(cat.blocks._blocks, 'changeThreadVariable', 'i');
    block(cat.blocks._blocks, 'getThreadVariable', 'i');
    block(cat.blocks._blocks, 'forEachThreadVariable', 'n');
    block(cat.blocks._blocks, 'getThreadVariable', null);
    block(cat.blocks._blocks, 'setRuntimeVariable', 'score');
    block(stage.blocks._blocks, 'setThreadVariable', 'onStage');

    assert.deepEqual(readTemporaryVariables(runtime, 'cat'), {
        paused: false,
        thread: [
            {name: 'i', fixed: true, read: 1, write: 2, functions: [{}]},
            {name: 'n', fixed: true, read: 0, write: 1, functions: [{}]}
        ]
    });
});

test('a thread variable names the functions whose code sets it', () => {
    const {runtime, cat} = project();
    const blocks = cat.blocks._blocks;
    const jump = definition(blocks, 'jump', 'jump %s times %b', ['height', 'fast']);
    const walk = definition(blocks, 'walk', 'walk', []);
    block(blocks, 'setThreadVariable', 'i', jump);
    block(blocks, 'changeThreadVariable', 'i', jump);
    block(blocks, 'forEachThreadVariable', 'i', walk);
    block(blocks, 'setThreadVariable', 'i');
    block(blocks, 'getThreadVariable', 'only read', walk);

    assert.deepEqual(readTemporaryVariables(runtime, 'cat').thread, [
        {name: 'i', fixed: true, read: 0, write: 4, functions: [
            {id: 'jump', label: 'jump (height) times <fast>'}, {id: 'walk', label: 'walk'}, {}
        ]},
        {name: 'only read', fixed: true, read: 1, write: 0, functions: []}
    ]);
});

test('the stage also lists the runtime variables named anywhere in the project', () => {
    const {runtime, cat, stage} = project();
    block(cat.blocks._blocks, 'setRuntimeVariable', 'score');
    block(stage.blocks._blocks, 'runtimeVariableExists', 'score');
    block(stage.blocks._blocks, 'deleteRuntimeVariable', 'level');
    block(stage.blocks._blocks, 'setThreadVariable', 'tmp');

    const result = readTemporaryVariables(runtime, 'stage');
    assert.deepEqual(result.thread, [{name: 'tmp', fixed: true, read: 0, write: 1, functions: [{}]}]);
    const stageScript = {targetId: 'stage', targetName: 'Stage', stage: true};
    assert.deepEqual(result.runtime, [
        {name: 'score', fixed: true, read: 1, write: 1,
            functions: [{targetId: 'cat', targetName: 'Cat'}], readers: [stageScript], writers: []},
        {name: 'level', fixed: true, read: 0, write: 1, functions: [], readers: [], writers: [stageScript]}
    ]);
});

test('a runtime variable names the functions that define, read and rewrite it, in every sprite', () => {
    const {runtime, cat, clone, stage} = project();
    const catBlocks = cat.blocks._blocks;
    const reset = definition(catBlocks, 'reset', 'reset score', []);
    const add = definition(catBlocks, 'add', 'add %s', ['points']);
    const show = definition(stage.blocks._blocks, 'show', 'show score', []);
    block(catBlocks, 'setRuntimeVariable', 'score', reset);
    block(catBlocks, 'changeRuntimeVariable', 'score', add);
    block(catBlocks, 'getRuntimeVariable', 'score', add);
    block(catBlocks, 'deleteRuntimeVariable', 'score', reset);
    block(stage.blocks._blocks, 'getRuntimeVariable', 'score', show);
    block(stage.blocks._blocks, 'runtimeVariableExists', 'score');
    // A clone shares the blocks of its sprite, so its functions are not listed twice.
    assert.equal(clone.blocks, cat.blocks);

    const at = (targetId: string, targetName: string, fn: object = {}) =>
        ({...fn, targetId, targetName, ...targetId === 'stage' && {stage: true}});
    assert.deepEqual(readTemporaryVariables(runtime, 'stage').runtime, [{
        name: 'score', fixed: true, read: 3, write: 3,
        functions: [at('cat', 'Cat', {id: 'reset', label: 'reset score'})],
        readers: [at('stage', 'Stage', {id: 'show', label: 'show score'}), at('stage', 'Stage'),
            at('cat', 'Cat', {id: 'add', label: 'add (points)'})],
        writers: [at('cat', 'Cat', {id: 'add', label: 'add (points)'}), at('cat', 'Cat', {id: 'reset', label: 'reset score'})]
    }]);
});

test('a project without the extension has no temporary variables to list', () => {
    const {runtime} = project({loaded: false});
    assert.equal(readTemporaryVariables(runtime, 'cat'), undefined);
    assert.equal(readTemporaryVariables(runtime, 'missing'), undefined);
});

test('while paused, the values of the sprite and its clones are read, including names built at run time', () => {
    const {runtime, cat, clone, stage} = project({paused: true});
    block(cat.blocks._blocks, 'setThreadVariable', 'i');
    block(cat.blocks._blocks, 'setThreadVariable', 'unused');
    runtime.threads.push(
        {target: stage, variables: {i: 'stage value'}},
        {target: cat, variables: {i: 3}},
        {target: clone, variables: {i: 'a', item_2: true}},
        {target: cat}
    );
    runtime.ext_lmsTempVars2.runtimeVariables = {score: 10};

    assert.deepEqual(readTemporaryVariables(runtime, 'cat'), {
        paused: true,
        thread: [
            {name: 'i', fixed: true, read: 0, write: 1, functions: [{}], values: [
                {owner: {targetName: 'Cat', thread: 2}, value: '3'},
                {owner: {targetName: 'Cat', clone: 1, thread: 3}, value: 'a'}
            ]},
            {name: 'unused', fixed: true, read: 0, write: 1, functions: [{}], values: []},
            {name: 'item_2', fixed: false, read: 0, write: 0, functions: [], values: [
                {owner: {targetName: 'Cat', clone: 1, thread: 3}, value: 'true'}
            ]}
        ]
    });
    assert.deepEqual(readTemporaryVariables(runtime, 'stage').runtime,
        [{name: 'score', fixed: false, read: 0, write: 0, functions: [], readers: [], writers: [], values: [{value: '10'}]}]);
});

test('the watcher reports pauses, resumes, and values changed by single steps', (t: TestContext) => {
    t.mock.timers.enable({apis: ['setInterval']});
    const {runtime, cat} = project();
    let calls = 0;
    const stop = watchTemporaryVariables(runtime, () => calls++, 100);

    runtime.ioDevices.clock._paused = true;
    runtime.emit('RUNTIME_PAUSED');
    assert.equal(calls, 1);
    t.mock.timers.tick(100);
    assert.equal(calls, 1, 'nothing changed during the pause');
    runtime.threads.push({target: cat, variables: {i: 1}});
    t.mock.timers.tick(100);
    assert.equal(calls, 2, 'a single step changed a value');

    runtime.ioDevices.clock._paused = false;
    runtime.emit('RUNTIME_UNPAUSED');
    assert.equal(calls, 3);
    t.mock.timers.tick(500);
    assert.equal(calls, 3, 'no polling after the pause');

    stop();
    runtime.emit('RUNTIME_PAUSED');
    assert.equal(calls, 3);
});

function render(t: TestContext, element: React.ReactElement) {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    act(() => root.render(element));
    t.after(() => {
        act(() => root.unmount());
        container.remove();
    });
    return container;
}

const text = (nodes: Iterable<Element>) => [...nodes].map(node => node.textContent.trim());
const rows = (section: Element) => [...section.querySelectorAll('tbody tr')].map(row => text(row.querySelectorAll('th, td')));

test('the pane lists thread and runtime variables after the global variables', t => {
    const container = render(t, React.createElement(SpriteAssetPane, {
        kind: 'variables', locale: 'ja', editable: true, global: {canAddCloudVariable: true},
        variables: [{id: 'v', name: 'score', value: 0}], onWrite() {},
        temporaryVariables: {
            paused: false,
            thread: [{name: 'i', fixed: true, read: 1, write: 2,
                functions: [{id: 'jump', label: 'jump (height)'}, {}]}],
            runtime: []
        }
    }));
    const sections = [...container.querySelectorAll('section[data-temporary-scope]')];
    assert.deepEqual(sections.map(node => node.getAttribute('aria-label')), ['スレッド変数', 'ランタイム変数']);
    assert.deepEqual(text(sections[0].querySelectorAll('thead th')), ['変数名', '定義した関数', '読み取り', '変更']);
    assert.deepEqual(rows(sections[0]), [['i', 'jump (height)関数の外', '1', '2']]);
    assert.deepEqual([...sections[0].querySelectorAll('[data-function-id]')].map(node => node.getAttribute('data-function-id')),
        ['jump']);
    assert.match(sections[0].textContent, /一時停止すると/);
    assert.match(sections[1].textContent, /固定テキストで書いたものはありません/);
    // The temporary sections come after the table of the ordinary variables.
    const tables = [...container.querySelectorAll('table')];
    assert.equal(tables[0].closest('section[data-temporary-scope]'), null);
});

test('while paused, the pane shows each value with the thread that holds it', t => {
    const container = render(t, React.createElement(SpriteAssetPane, {
        kind: 'variables', locale: 'ja', editable: true, variables: [], onWrite() {},
        temporaryVariables: {
            paused: true,
            thread: [
                {name: 'tmp', fixed: false, read: 0, write: 0, values: [{owner: {targetName: 'Cat', thread: 2}, value: 'x'}]},
                {name: 'i', fixed: true, read: 1, write: 1, values: [
                    {owner: {targetName: 'Cat', thread: 1}, value: '3'},
                    {owner: {targetName: 'Cat', clone: 2, thread: 4}, value: '5'}
                ]},
                {name: 'j', fixed: true, read: 0, write: 1, values: []}
            ]
        }
    }));
    const section = container.querySelector('section[data-temporary-scope="thread"]');
    assert.equal(container.querySelector('section[data-temporary-scope="runtime"]'), null);
    assert.deepEqual(text(section.querySelectorAll('thead th')), ['変数名', '定義した関数', '値', '読み取り', '変更']);
    assert.deepEqual(rows(section), [
        ['i', '', 'Cat・スレッド 13Cat（クローン 2）・スレッド 45', '1', '1'],
        ['j', '', '未定義', '0', '1'],
        ['tmp実行時の名前', '', 'Cat・スレッド 2x', '0', '0']
    ]);
});

test('the runtime variables show the functions that define, read and rewrite them', t => {
    const cat = (fn: object = {}) => ({...fn, targetId: 'cat', targetName: 'Cat'});
    const container = render(t, React.createElement(SpriteAssetPane, {
        kind: 'variables', locale: 'ja', editable: true, variables: [], onWrite() {},
        temporaryVariables: {
            paused: false, thread: [],
            runtime: [{name: 'score', fixed: true, read: 1, write: 2,
                functions: [cat({id: 'reset', label: 'reset score'})],
                readers: [{targetId: 'stage', targetName: 'Stage', stage: true}],
                writers: [cat({id: 'add', label: 'add (points)'}), cat()]}]
        }
    }));
    const section = container.querySelector('section[data-temporary-scope="runtime"]');
    assert.deepEqual(text(section.querySelectorAll('thead th')),
        ['変数名', '定義した関数', '参照している関数', '書き換えている関数', '読み取り', '変更']);
    assert.deepEqual(rows(section), [['score', 'Catreset score', '背景関数の外', 'Catadd (points)Cat関数の外', '1', '2']]);
    const cells = (column: string) => [...section.querySelectorAll(`[data-column="${column}"] li`)]
        .map(item => [item.getAttribute('data-target-id'), item.getAttribute('data-function-id')]);
    assert.deepEqual(cells('writers'), [['cat', 'add'], ['cat', null]]);
});

test('a clone’s variable pane keeps the temporary variables of its sprite', t => {
    const listeners = new Map<string, Set<() => void>>();
    const base = {
        isStage: false, x: 0, y: 0, size: 100, direction: 90, visible: true, rotationStyle: 'all around',
        variables: {}, getName: () => 'Cat'
    };
    const sprite = {clones: [] as {id: string}[]};
    const original = {...base, id: 'cat', isOriginal: true, sprite};
    const clone = {...base, id: 'clone', isOriginal: false, sprite};
    sprite.clones.push(original, clone);
    const vm = {
        runtime: {
            getTargetById: (id: string) => sprite.clones.find(target => target.id === id),
            on(event: string, listener: () => void) {
                listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
            },
            removeListener: (event: string, listener: () => void) => listeners.get(event)?.delete(listener),
            requestRedraw() {}
        },
        setVariableValue: () => true
    };
    const pane = React.createElement(SpriteAssetPane, {
        kind: 'variables', locale: 'en', editable: true, variables: [], onWrite() {},
        temporaryVariables: {paused: false, thread: [{name: 'i', fixed: true, read: 0, write: 1}]}
    });
    const view = {viewId: 'view', targetId: 'cat', locale: 'en'};
    const container = render(t, React.createElement(SpriteCloneInspector, {vm},
        React.createElement(SpriteClonePagination, view),
        React.createElement(SpriteCloneVariables, {...view, editable: true}, pane)));
    act(() => (container.querySelector('button[aria-label="Clone 1"]') as HTMLElement).click());
    assert.match(container.textContent, /Editing clone 1/);
    assert.deepEqual(rows(container.querySelector('section[data-temporary-scope="thread"]')), [['i', '', '0', '1']]);
});

test('each column header sorts the whole table, ascending and then descending', t => {
    const at = (label?: string) => ({targetId: 'cat', targetName: 'Cat', ...label && {id: label, label}});
    const container = render(t, React.createElement(SpriteAssetPane, {
        kind: 'variables', locale: 'en', editable: true, variables: [], onWrite() {},
        temporaryVariables: {
            paused: true, thread: [],
            runtime: [
                {name: 'b', fixed: true, read: 5, write: 1, functions: [at('reset')], readers: [], writers: [],
                    values: [{value: '10'}]},
                {name: 'a', fixed: true, read: 1, write: 3, functions: [at()], readers: [], writers: [],
                    values: [{value: '2'}]},
                {name: 'c', fixed: false, read: 0, write: 0, functions: [], readers: [], writers: [],
                    values: [{value: 'x'}]}
            ]
        }
    }));
    const section = container.querySelector('section[data-temporary-scope="runtime"]');
    const names = () => [...section.querySelectorAll('tbody tr')].map(row => row.getAttribute('data-temporary-name'));
    const press = (label: string) => act(() => [...section.querySelectorAll<HTMLButtonElement>('thead button')]
        .find(button => button.textContent === label).click());
    const sortState = () => [...section.querySelectorAll('thead th[aria-sort]')]
        .map(th => [th.textContent, th.getAttribute('aria-sort')]);

    // Before any choice, names written in the code come first.
    assert.deepEqual(names(), ['a', 'b', 'c']);
    assert.deepEqual(text(section.querySelectorAll('thead th')),
        ['Variable name', 'Defined in', 'Read in', 'Changed in', 'Value', 'Read', 'Write']);
    press('Read');
    assert.deepEqual(names(), ['c', 'a', 'b']);
    assert.deepEqual(sortState(), [['Read', 'ascending']]);
    press('Read');
    assert.deepEqual(names(), ['b', 'a', 'c']);
    assert.deepEqual(sortState(), [['Read', 'descending']]);
    press('Value');
    assert.deepEqual(names(), ['a', 'b', 'c'], 'numbers in their numeric order');
    press('Variable name');
    press('Variable name');
    assert.deepEqual(names(), ['c', 'b', 'a']);
    press('Defined in');
    assert.deepEqual(names(), ['c', 'a', 'b'], 'no function, then Cat outside functions, then Cat reset');
});
