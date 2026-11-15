import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {actorLabels, cloneActorName, SpriteCloneInspector, SpriteClonePagination, SpriteCloneVariables}
    from '../dist/sprite-clone-inspector.js';
import {SpriteAssetPane} from '../dist/sprite-asset-pane.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent, FormData: window.FormData
});
const {createRoot} = await import('react-dom/client');

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

const actorName = (value: unknown) => ({an: {id: 'an', name: 'actorName', type: '', value}});

/** A sprite with one clone per actor name; null makes a clone without the variable. */
function project(names: (string | null)[]) {
    const listeners = new Map<string, Set<() => void>>();
    const base = {
        isStage: false, x: 0, y: 0, size: 100, direction: 90, visible: true, rotationStyle: 'all around',
        getName: () => 'Actor'
    };
    const sprite = {clones: [] as {id: string; variables: Record<string, unknown>}[]};
    sprite.clones.push({...base, id: 'actor', isOriginal: true, sprite, variables: actorName('')});
    names.forEach((name, index) => sprite.clones.push({
        ...base, id: 'clone' + (index + 1), isOriginal: false, sprite,
        variables: name === null ? {} : actorName(name)
    }));
    const emit = (event: string) => listeners.get(event)?.forEach(listener => listener());
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
    return {vm, sprite, emit};
}

function mount(t: TestContext, vm: object, locale = 'ja') {
    const view = {viewId: 'view', targetId: 'actor', locale};
    const pane = React.createElement(SpriteAssetPane, {kind: 'variables', locale, editable: true, variables: [], onWrite() {}});
    return render(t, React.createElement(SpriteCloneInspector, {vm},
        React.createElement(SpriteClonePagination, view),
        React.createElement(SpriteCloneVariables, {...view, editable: true}, pane)));
}

test('the actor name is the clone’s actorName variable when it holds text', () => {
    assert.equal(cloneActorName({variables: actorName(' 浦島太郎 ')}), '浦島太郎');
    assert.equal(cloneActorName({variables: actorName('')}), null);
    assert.equal(cloneActorName({variables: actorName(3)}), null, 'a number is not a name');
    assert.equal(cloneActorName({variables: {l: {id: 'l', name: 'actorName', type: 'list', value: ['x']}}}), null);
    assert.equal(cloneActorName({variables: {}}), null);
});

test('labels tell clones apart by number only where names repeat or are missing', () => {
    const text = {clone: (n: number) => `クローン ${n}`};
    assert.deepEqual(actorLabels(['太郎', '亀', '太郎', null], text),
        ['太郎 (クローン 1)', '亀', '太郎 (クローン 3)', 'クローン 4']);
});

test('clones that name their actors are chosen by name instead of by number', t => {
    const {vm} = project(['浦島太郎', '亀', '乙姫']);
    const container = mount(t, vm);
    assert.equal(container.querySelector('.tw-sprite-clone-pages__numbers'), null, 'no clone numbers');
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="アクターを選ぶ"]');
    assert.deepEqual([...select.options].map(option => option.textContent), ['アクターを選ぶ…', '浦島太郎', '亀', '乙姫']);
    act(() => {
        select.value = 'clone2';
        select.dispatchEvent(new window.Event('change', {bubbles: true}));
    });
    assert.match(container.textContent, /アクター「亀」を編集中/);
    act(() => container.querySelector<HTMLButtonElement>('.tw-sprite-clone-pages__original').click());
    assert.doesNotMatch(container.textContent, /編集中/);
});

test('a name set after the clone appears turns the numbers into the actor selector', t => {
    const {vm, sprite, emit} = project([null, null]);
    const container = mount(t, vm, 'en');
    assert.ok(container.querySelector('button[aria-label="Clone 1"]'), 'numbers while no clone is named');
    sprite.clones[2].variables = actorName('Turtle');
    act(() => emit('AFTER_EXECUTE'));
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Choose actor"]');
    assert.deepEqual([...select.options].map(option => option.textContent), ['Choose an actor…', 'Clone 1', 'Turtle']);
});
