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
    ['メッセージ', '送信', '受信', 'この作品の他の場所のメッセージ']);
    const rows = [...container.querySelectorAll('tbody tr')].map(row => text(row.querySelectorAll('th, td')));
    assert.deepEqual(rows, [
        ['go', '「go」を送る「緑の旗が押されたとき」から始まるスクリプト'],
        ['go', '「go」を受け取ったとき']
    ]);
    assert.equal(container.querySelector('.tw-sprite-messages__empty').textContent,
        'この作品のメッセージはすべてここで使われています。');
});

test('a send that waits is told apart from a plain send', t => {
    const sent = use({wait: true, opcode: 'event_broadcastandwait'});
    const container = render(t, {
        data: {targetId: 'cat', isStage: false, sends: [sent], receives: [], elsewhere: [],
            messages: [message({sends: [sent]})]}
    });
    assert.match(container.querySelector('tbody td').textContent, /^「go」を送って待つ/);
});

test('a message sent but never received, and one the sprite does not use, are marked', t => {
    const sent = use({key: 'shout', id: 'shout', name: 'shout'});
    const idle = message({key: 'idle', id: 'idle', name: 'idle', status: 'unused'});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [], elsewhere: [idle], messages: [
                message({key: 'shout', id: 'shout', name: 'shout', status: 'sendOnly', sends: [sent]}),
                idle
            ]
        }
    });
    assert.deepEqual([...container.querySelectorAll('.tw-sprite-messages__status')]
        .map(node => [node.dataset.status, node.textContent]),
    [['sendOnly', '受け取るブロックがありません'], ['unused', '使われていません']]);
    assert.equal(container.querySelector('.tw-sprite-messages__list li span').textContent, 'idle');
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

    const button = [...container.querySelectorAll('tbody button')]
        .find(node => node.textContent === 'メッセージ名を変更');
    act(() => button.dispatchEvent(new window.MouseEvent('click', {bubbles: true})));
    assert.equal(container.querySelector('.tw-sprite-messages__hint').textContent,
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
    assert.equal(container.querySelector('form'), null);
});

test('the stage draws all used broadcasts as labelled arrows between thumbnails', t => {
    const opened: string[] = [];
    const sent = use({});
    const stage = use({direction: 'receive', targetId: 'stage', targetName: 'Stage', isStage: true});
    const cat = use({direction: 'receive', blockId: 'another-hat'});
    const dog = use({targetId: 'dog', targetName: 'Dog'});
    const unused = message({key: 'idle', name: 'idle', status: 'unused'});
    const connections = [
        message({sends: [sent, sent], receives: [stage, cat]}),
        message({key: 'bark', name: 'bark', status: 'sendOnly', sends: [dog]}),
        unused
    ];
    const container = render(t, {
        data: {
            targetId: 'stage', isStage: true, sends: [], receives: [stage], elsewhere: [unused],
            messages: connections, getThumbnailUrl: id => '/thumb/' + id
        },
        onOpenTarget: id => opened.push(id)
    });
    const figure = container.querySelector('.tw-sprite-messages__diagram');
    assert.equal(figure.querySelector('figcaption').textContent, 'スプライト・背景とメッセージの関係');
    assert.deepEqual(text(figure.querySelectorAll('.tw-sprite-messages__headings span')), ['送信元', '受信先']);
    assert.deepEqual(text(figure.querySelectorAll('.tw-sprite-messages__edge')), ['go', 'bark']);
    assert.equal(figure.querySelectorAll('.tw-sprite-messages__edge-label svg').length, 2);
    assert.deepEqual(text(figure.querySelectorAll('.tw-sprite-messages__node')), ['Cat', '背景', 'Cat', 'Dog']);
    assert.deepEqual(text(figure.querySelectorAll('.tw-sprite-messages__node[aria-current="true"]')), ['背景']);
    assert.deepEqual([...figure.querySelectorAll('.tw-sprite-messages__node img')].map(img => img.getAttribute('src')),
        ['/thumb/cat', '/thumb/stage', '/thumb/cat', '/thumb/dog']);
    assert.equal(figure.querySelector('.tw-sprite-messages__missing').textContent.trim(),
        '受け取るブロックがありません');
    assert.equal(container.querySelector('.tw-sprite-messages__list [data-message-key="idle"]').textContent, 'idle');
    figure.querySelector('button[aria-current="true"]').click();
    assert.deepEqual(opened, ['stage']);
});

test('a sprite diagram shows the broadcasts involving that sprite and highlights both ends of a self-send', t => {
    const sent = use({});
    const cat = use({direction: 'receive', blockId: 'cat-hat'});
    const dog = use({targetId: 'dog', targetName: 'Dog'});
    const unanswered = message({key: 'listen', name: 'listen', status: 'receiveOnly', receives: [cat]});
    const unrelated = message({key: 'bark', name: 'bark', status: 'sendOnly', sends: [dog]});
    const container = render(t, {
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [cat], elsewhere: [unrelated],
            messages: [message({sends: [sent], receives: [cat]}), unanswered, unrelated]
        }
    });
    const rows = container.querySelectorAll('.tw-sprite-messages__connection');
    assert.equal(rows.length, 2);
    assert.deepEqual(text(rows[0].querySelectorAll('.tw-sprite-messages__node[aria-current="true"]')), ['Cat', 'Cat']);
    assert.equal(rows[1].querySelector('.tw-sprite-messages__missing').textContent.trim(),
        '送るブロックがありません');
});
