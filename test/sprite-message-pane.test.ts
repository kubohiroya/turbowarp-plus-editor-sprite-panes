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

test('the pane lists what the sprite sends and receives, with the block and the script', t => {
    const sent = use({});
    const received = use({direction: 'receive', blockId: 'block-2', scriptId: 'block-2',
        scriptOpcode: 'event_whenbroadcastreceived', scriptMessageName: 'go'});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [received], elsewhere: [],
            messages: [message({sends: [sent], receives: [received]})]
        },
        onOpen: () => {}
    });

    assert.deepEqual([...container.querySelectorAll('section[aria-label]')]
        .map(node => node.getAttribute('aria-label')),
    ['メッセージ', '送信', '受信']);
    const rows = [...container.querySelectorAll('tbody tr')].map(row => text(row.querySelectorAll('th, td')));
    assert.deepEqual(rows, [
        ['go', '「go」を送る「緑の旗が押されたとき」から始まるスクリプト'],
        ['go', '「go」を受け取ったとき']
    ]);
    // Messages this sprite does not use are not listed: it is about what this sprite sends and receives.
    assert.equal(container.textContent.includes('この作品の他の場所'), false);
});

test('a send that waits is told apart from a plain send', t => {
    const sent = use({wait: true, opcode: 'event_broadcastandwait'});
    const container = render(t, {
        data: {targetId: 'cat', isStage: false, sends: [sent], receives: [], elsewhere: [],
            messages: [message({sends: [sent]})]}
    });
    assert.match(container.querySelector('tbody td').textContent, /^「go」を送って待つ/);
});

test('a message that nothing receives, or that nothing sends, is marked with a warning', t => {
    const shout = use({key: 'shout', id: 'shout', name: 'shout'});
    const hear = use({key: 'hear', id: 'hear', name: 'hear', direction: 'receive', blockId: 'hear-hat'});
    const idle = message({key: 'idle', id: 'idle', name: 'idle', status: 'unused'});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [shout], receives: [hear], elsewhere: [idle], messages: [
                message({key: 'shout', id: 'shout', name: 'shout', status: 'sendOnly', sends: [shout]}),
                message({key: 'hear', id: 'hear', name: 'hear', status: 'receiveOnly', receives: [hear]}),
                idle
            ]
        }
    });
    const marks = (panel: Element) => [...panel.querySelectorAll('tbody .tw-sprite-messages__status')]
        .map(node => [node.dataset.status, node.textContent, Boolean(node.querySelector('svg.tw-sprite-messages__warning'))]);
    const [sending, receiving] = container.querySelectorAll('[role="tabpanel"]');
    assert.deepEqual(marks(sending), [['sendOnly', '受け取るブロックがありません', true]]);
    assert.deepEqual(marks(receiving), [['receiveOnly', '送るブロックがありません', true]]);
    // The diagram warns at the empty end as well.
    assert.ok(sending.querySelector('.tw-sprite-messages__missing svg.tw-sprite-messages__warning'));
    assert.equal(container.textContent.includes('idle'), false, 'a message this sprite does not use is not listed');
});

test('renaming refuses a name another message already has and reports why', t => {
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

    // The rename button is a pencil right after the message name, not a column of its own.
    assert.deepEqual([...container.querySelectorAll('.tw-sprite-messages__table thead th')].map(th => th.textContent),
        ['メッセージ', 'ブロック']);
    const button = container.querySelector('tbody th .tw-pane-name-edit');
    assert.equal(button.getAttribute('aria-label'), 'メッセージ名を変更');
    assert.equal(button.previousElementSibling.textContent, 'go', 'the pencil follows the name');
    // A speech bubble before the name marks the row as a message.
    assert.ok(container.querySelector('tbody th').firstElementChild.matches('svg.tw-sprite-messages__icon'));
    act(() => button.dispatchEvent(new window.MouseEvent('click', {bubbles: true})));
    const dialog = container.querySelector('dialog');
    assert.equal(dialog.getAttribute('aria-labelledby') &&
        container.querySelector('#' + dialog.getAttribute('aria-labelledby')).textContent, 'メッセージ名を変更');
    assert.equal(dialog.querySelector('input[name="name"]').value, 'go');
    assert.equal(dialog.querySelector('.tw-sprite-messages__hint').textContent,
        'メッセージの名前を変えると、作品全体で変わります。');

    const submit = (value: string) => {
        const form = container.querySelector('form');
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
    assert.equal(sending.querySelector('figcaption').textContent, 'スプライト・背景とメッセージの関係');
    assert.deepEqual(text(sending.querySelectorAll('.tw-sprite-messages__headings span')), ['送信元', '受信先']);
    assert.deepEqual(text(sending.querySelectorAll('.tw-sprite-messages__edge')), ['go']);
    assert.deepEqual([...sending.querySelectorAll('.tw-sprite-messages__node img')].map(img => img.getAttribute('src')),
        ['/thumb/cat', '/thumb/dog']);
    assert.deepEqual(text(sending.querySelectorAll('.tw-sprite-messages__node[aria-current="true"]')),
        ['Cat緑の旗が押されたとき']);

    // The receiving tab draws only the messages the sprite receives.
    act(() => tabs[1].click());
    assert.deepEqual(panels.map(panel => panel.hidden), [true, false]);
    const receiving = panels[1].querySelector('.tw-sprite-messages__diagram');
    assert.deepEqual(text(receiving.querySelectorAll('.tw-sprite-messages__edge')), ['listen']);
    assert.deepEqual(text(receiving.querySelectorAll('.tw-sprite-messages__node')), ['Dog緑の旗が押されたとき', 'Cat']);
    receiving.querySelector('button[aria-current="true"]').click();
    assert.deepEqual(opened, ['cat']);

    act(() => tabs[1].dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true})));
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
    assert.equal(window.document.activeElement, tabs[0]);
});

test('a sprite that only receives opens on the receiving tab, and a self-send shows on both', t => {
    const sent = use({});
    const self = use({direction: 'receive', blockId: 'cat-hat'});
    const unanswered = use({key: 'listen', id: 'listen', name: 'listen', direction: 'receive', blockId: 'listen-hat'});
    const stage = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [], receives: [unanswered], elsewhere: [],
            messages: [message({key: 'listen', id: 'listen', name: 'listen', status: 'receiveOnly', receives: [unanswered]})]
        }
    });
    assert.equal(stage.querySelector('[role="tab"][aria-selected="true"]').textContent, '受信1');
    assert.equal(stage.querySelector('[role="tabpanel"]:not([hidden]) .tw-sprite-messages__missing').textContent.trim(),
        '送るブロックがありません');
    assert.equal(stage.querySelectorAll('.tw-sprite-messages__diagram').length, 1, 'nothing is sent, so no sending diagram');

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
