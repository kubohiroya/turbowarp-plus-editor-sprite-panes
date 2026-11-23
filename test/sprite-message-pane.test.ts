import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {SpriteMessagePane} from '../dist/sprite-message-pane.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent, FormData: window.FormData
});
// react-dom decides whether it needs its legacy input polyfill when it is first loaded, so the
// document has to exist by then.
const {createRoot} = await import('react-dom/client');

const use = (patch: object) => ({
    direction: 'send', id: 'go', fieldValue: 'go', name: 'go', wait: false, key: 'go',
    targetId: 'cat', targetName: 'Cat', isStage: false, blockId: 'block-1', opcode: 'event_broadcast',
    scriptId: 'flag', scriptOpcode: 'event_whenflagclicked', ...patch
});

const message = (patch: object) =>
    ({key: 'go', id: 'go', name: 'go', status: 'both', sends: [], receives: [], ...patch});

function render(t: TestContext, props: object) {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    act(() => {
        root.render(React.createElement(SpriteMessagePane, {kind: 'messages', locale: 'ja', editable: true, ...props}));
    });
    t.after(() => {
        act(() => root.unmount());
        container.remove();
    });
    return container;
}

const text = (nodes: Iterable<Element>) => [...nodes].map(node => node.textContent.trim());

test('each tab shows only the diagram of its side, or says the sprite uses none', t => {
    const sent = use({});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent, use({blockId: 'block-2'})], receives: [], elsewhere: [],
            messages: [message({status: 'sendOnly', sends: [sent]})]
        }
    });
    // No tables: the diagram already says who sends what to whom.
    assert.equal(container.querySelector('table'), null);
    const [sending, receiving] = container.querySelectorAll('[role="tabpanel"]');
    assert.equal(sending.querySelectorAll('.tw-sprite-messages__diagram').length, 1);
    assert.equal(receiving.querySelector('.tw-sprite-messages__diagram'), null);
    assert.equal(receiving.querySelector('.tw-sprite-messages__empty').textContent, 'このスプライトはメッセージを受け取っていません。');
    // The tabs count messages, not blocks.
    assert.deepEqual(text(container.querySelectorAll('[role="tab"]')), ['送信1', '受信0']);
    // The empty end of a message nobody receives is marked with a warning.
    const missing = sending.querySelector('.tw-sprite-messages__missing');
    assert.equal(missing.textContent.trim(), '受け取るブロックがありません');
    assert.ok(missing.querySelector('svg.tw-sprite-messages__warning'));
});

test('the ▼ after a message name opens a menu that leads to the rename dialog', t => {
    const sent = use({});
    const renames: [string, string][] = [];
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [], elsewhere: [], messages: [
                message({sends: [sent]}),
                message({key: 'done', id: 'done', name: 'done', status: 'unused'})
            ]
        },
        onRename: (target: {name: string}, name: string) => {
            renames.push([target.name, name]);
        }
    });
    const label = container.querySelector('.tw-sprite-messages__edge-label');
    const toggle = label.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    assert.equal(toggle.getAttribute('aria-label'), '「go」の操作');
    assert.equal(toggle.parentElement.previousElementSibling.textContent, 'go', 'the ▼ follows the name');
    assert.equal(label.querySelector('[role="menu"]'), null);

    act(() => toggle.click());
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    const item = label.querySelector<HTMLButtonElement>('[role="menu"] [role="menuitem"]');
    assert.equal(item.textContent, 'メッセージ名を変更');
    assert.equal(window.document.activeElement, item, 'the menu takes the focus');

    // Escape closes the menu and returns to the ▼.
    act(() => item.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
    assert.equal(label.querySelector('[role="menu"]'), null);
    assert.equal(window.document.activeElement, toggle);

    act(() => toggle.click());
    act(() => label.querySelector<HTMLButtonElement>('[role="menuitem"]').click());
    assert.equal(label.querySelector('[role="menu"]'), null, 'choosing an item closes the menu');
    const dialog = container.querySelector('dialog');
    assert.equal(container.querySelector('#' + dialog.getAttribute('aria-labelledby')).textContent, 'メッセージ名を変更');
    assert.equal(dialog.querySelector('input[name="name"]').value, 'go');
    assert.equal(dialog.querySelector('.tw-sprite-messages__hint').textContent,
        'メッセージの名前を変えると、作品全体で変わります。');

    const submit = (value: string) => {
        const form = dialog.querySelector('form');
        form.querySelector('input[name="name"]').value = value;
        act(() => form.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true})));
    };
    submit('done');
    assert.equal(container.querySelector('[role="alert"]').textContent, '同じ名前のメッセージがすでにあります。');
    submit('   ');
    assert.equal(container.querySelector('[role="alert"]').textContent, 'メッセージ名を入力してください。');
    assert.deepEqual(renames, []);
    submit('  start  ');
    assert.deepEqual(renames, [['go', 'start']]);
    assert.equal(container.querySelector('dialog'), null, 'the dialog closes after renaming');
});

test('a press outside the menu closes it, and the menu is disabled while the pane cannot edit', t => {
    const sent = use({});
    const props = (editable: boolean) => ({
        editable, onRename() {},
        data: {targetId: 'cat', isStage: false, sends: [sent], receives: [], elsewhere: [], messages: [message({sends: [sent]})]}
    });
    const container = render(t, props(true));
    const toggle = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    act(() => toggle.click());
    act(() => {
        window.document.body.dispatchEvent(new window.Event('pointerdown', {bubbles: true}));
    });
    assert.equal(container.querySelector('[role="menu"]'), null);

    const readOnly = render(t, props(false));
    assert.equal(readOnly.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]').disabled, true);
});

test('the pane splits what the sprite sends from what it receives, each tab with its own diagram', t => {
    const opened: string[] = [];
    const sent = use({});
    const dogHears = use({direction: 'receive', targetId: 'dog', targetName: 'Dog', blockId: 'dog-hat'});
    const dogSays = use({key: 'listen', id: 'listen', name: 'listen', targetId: 'dog', targetName: 'Dog', blockId: 'dog-send'});
    const catHears = use({key: 'listen', id: 'listen', name: 'listen', direction: 'receive', blockId: 'cat-hat'});
    const stageHears = use({key: 'bark', id: 'bark', name: 'bark', direction: 'receive', targetId: 'stage',
        targetName: 'Stage', isStage: true, blockId: 'stage-hat'});
    const dogBarks = use({key: 'bark', id: 'bark', name: 'bark', targetId: 'dog', targetName: 'Dog', blockId: 'dog-bark'});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [catHears], elsewhere: [], getThumbnailUrl: id => '/thumb/' + id,
            messages: [
                message({sends: [sent], receives: [dogHears]}),
                message({key: 'listen', id: 'listen', name: 'listen', sends: [dogSays], receives: [catHears]}),
                message({key: 'bark', id: 'bark', name: 'bark', sends: [dogBarks], receives: [stageHears]})
            ]
        },
        onOpenTarget: id => opened.push(id)
    });
    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    assert.deepEqual(tabs.map(tab => [tab.textContent, tab.getAttribute('aria-selected')]), [['送信1', 'true'], ['受信1', 'false']]);
    assert.deepEqual(panels.map(panel => panel.hidden), [false, true]);
    assert.equal(panels[0].getAttribute('aria-labelledby'), tabs[0].id);

    // The sending tab draws only the messages the sprite sends, with every receiver of them.
    const sending = panels[0].querySelector('.tw-sprite-messages__diagram');
    assert.equal(sending.querySelector('figcaption'), null, 'the diagram has no visible heading');
    assert.equal(sending.getAttribute('aria-label'), 'スプライト・ステージとメッセージの関係');
    assert.deepEqual(text(sending.querySelectorAll('.tw-sprite-messages__headings span')), ['送信元', '受信先']);
    assert.deepEqual(text(sending.querySelectorAll('.tw-sprite-messages__edge [data-message-key]')), ['go']);
    assert.deepEqual([...sending.querySelectorAll('.tw-sprite-messages__node img')].map(img => img.getAttribute('src')),
        ['/thumb/cat', '/thumb/dog']);
    assert.deepEqual(text(sending.querySelectorAll('.tw-sprite-messages__node[aria-current="true"]')),
        ['Cat緑の旗が押されたとき']);

    // The receiving tab draws only the messages the sprite receives.
    act(() => tabs[1].click());
    assert.deepEqual(panels.map(panel => panel.hidden), [true, false]);
    const receiving = panels[1].querySelector('.tw-sprite-messages__diagram');
    assert.deepEqual(text(receiving.querySelectorAll('.tw-sprite-messages__edge [data-message-key]')), ['listen']);
    assert.deepEqual(text(receiving.querySelectorAll('.tw-sprite-messages__node')), ['Dog緑の旗が押されたとき', 'Cat']);
    receiving.querySelector<HTMLButtonElement>('[aria-current="true"] .tw-sprite-messages__node-name').click();
    assert.deepEqual(opened, ['cat']);

    act(() => tabs[1].dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true})));
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
    assert.equal(window.document.activeElement, tabs[0]);
});

test('a sprite that only receives opens on the receiving tab, and a self-send shows on both', t => {
    const sent = use({});
    const self = use({direction: 'receive', blockId: 'cat-hat'});
    const unanswered = use({key: 'listen', id: 'listen', name: 'listen', direction: 'receive', blockId: 'listen-hat'});
    const only = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [], receives: [unanswered], elsewhere: [],
            messages: [message({key: 'listen', id: 'listen', name: 'listen', status: 'receiveOnly', receives: [unanswered]})]
        }
    });
    assert.equal(only.querySelector('[role="tab"][aria-selected="true"]').textContent, '受信1');
    assert.equal(only.querySelector('[role="tabpanel"]:not([hidden]) .tw-sprite-messages__missing').textContent.trim(),
        '送るブロックがありません');
    assert.equal(only.querySelectorAll('.tw-sprite-messages__diagram').length, 1, 'nothing is sent, so no sending diagram');

    const both = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [self], elsewhere: [],
            messages: [message({sends: [sent], receives: [self]})]
        }
    });
    for (const panel of both.querySelectorAll('[role="tabpanel"]')) {
        assert.deepEqual(text(panel.querySelectorAll('.tw-sprite-messages__node[aria-current="true"]')),
            ['Cat緑の旗が押されたとき', 'Cat']);
    }
});

test('pressing a sending script opens its first block that sends the message', t => {
    const opened: string[] = [];
    const first = use({blockId: 'send-1'});
    const second = use({blockId: 'send-2'});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [first, second], receives: [], elsewhere: [],
            messages: [message({status: 'sendOnly', sends: [first, second]})]
        },
        onOpen: (target: {blockId: string}) => opened.push(target.blockId)
    });
    const sources = container.querySelectorAll<HTMLButtonElement>('button.tw-sprite-messages__source');
    assert.equal(sources.length, 1, 'two sends in one script are one source');
    assert.equal(sources[0].title, 'このブロックを開く');
    act(() => sources[0].click());
    assert.deepEqual(opened, ['send-1']);
});

test('a sender lists each script that sends: the hat, the function or the named function', t => {
    const key = use({blockId: 'send-1', scriptId: 'key', scriptOpcode: 'event_whenkeypressed'});
    const again = use({blockId: 'send-2', scriptId: 'key', scriptOpcode: 'event_whenkeypressed'});
    const jump = use({blockId: 'send-3', scriptId: 'jump', scriptOpcode: 'procedures_definition'});
    const named = use({blockId: 'send-4', scriptId: 'add', scriptOpcode: 'kubohiroyanamedfunctions_defineFunction'});
    const relay = use({blockId: 'send-5', scriptId: 'relay', scriptOpcode: 'event_whenbroadcastreceived',
        scriptMessageName: 'ready'});
    const starts = {
        key: {id: 'key', opcode: 'event_whenkeypressed', kind: 'hat', text: ['space']},
        jump: {id: 'jump', opcode: 'procedures_definition', kind: 'function', label: 'jump (height)', text: []},
        add: {id: 'add', opcode: 'kubohiroyanamedfunctions_defineFunction', kind: 'named-function', label: 'add', text: []},
        relay: {id: 'relay', opcode: 'event_whenbroadcastreceived', kind: 'hat', text: ['ready']}
    };
    const drawn: string[] = [];
    const sends = [key, again, jump, named, relay];
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends, receives: [], elsewhere: [],
            messages: [message({status: 'sendOnly', sends})],
            describeScript: (targetId: string, blockId: string) => targetId === 'cat' ? starts[blockId] : undefined,
            getBlockImage: (targetId: string, blockId: string) => {
                drawn.push(targetId + '/' + blockId);
                return window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            }
        }
    });
    const sources = [...container.querySelectorAll('.tw-sprite-messages__sources li')];
    assert.deepEqual(sources.map(item => [item.getAttribute('data-script-id'),
        item.querySelector('.tw-sprite-messages__source-text').textContent,
        item.querySelector('.tw-block-image svg') ? 'drawn' : 'none']), [
        ['key', 'キーが押されたとき space', 'drawn'],
        ['jump', '関数 jump (height)', 'drawn'],
        ['add', '名前付き関数 「add」', 'drawn'],
        ['relay', '「ready」を受け取ったとき', 'drawn']
    ]);
    assert.deepEqual([...new Set(drawn)], ['cat/key', 'cat/jump', 'cat/add', 'cat/relay']);
});
