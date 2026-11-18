import assert from 'node:assert/strict';
import test from 'node:test';
import {readMessageCallGraph} from '../dist/message-call-graph.js';
import type {FunctionTarget, SpriteFunction} from '../dist/sprite-function-pane.js';

type Block = FunctionTarget['blocks']['_blocks'][string];
const target = (id: string, blocks: Record<string, Block>, patch: Partial<FunctionTarget> = {}): FunctionTarget =>
    ({id, getName: () => id.toUpperCase(), blocks: {_blocks: blocks}, ...patch});
const root = (id: string, opcode: string, patch: Partial<Block> = {}): Block =>
    ({id, opcode, topLevel: true, x: 24, y: 48, ...patch});
const received = (id: string, message = 'go', name = message, patch: Partial<Block> = {}) =>
    root(id, 'event_whenbroadcastreceived', {fields: {BROADCAST_OPTION: {id: message, value: name}}, ...patch});
const send = (id: string, scriptId: string, message = 'go', wait = false, patch: Partial<Block> = {}): Record<string, Block> => ({
    [id]: {id, opcode: wait ? 'event_broadcastandwait' : 'event_broadcast', parent: scriptId,
        inputs: {BROADCAST_INPUT: {block: `${id}-menu`, shadow: `${id}-menu`}}, ...patch},
    [`${id}-menu`]: {id: `${id}-menu`, opcode: 'event_broadcast_menu', parent: id, shadow: true,
        fields: {BROADCAST_OPTION: {id: message, value: message}}}
});
const read = (own: FunctionTarget, others: FunctionTarget[] = []) => readMessageCallGraph(own, others, new Map());

test('messages from a function reach every receiver across sprites and the stage, without changing the project', () => {
    const cat = target('cat', {
        def: root('def', 'procedures_definition', {next: 'send'}), ...send('send', 'def')
    });
    const dog = target('dog', {received: received('received'), second: received('second')});
    const stage = target('stage', {received: received('received')}, {isStage: true,
        variables: {go: {type: 'broadcast_msg', name: 'Start now'}}});
    const definition: SpriteFunction = {id: 'def', kind: 'procedure', proccode: 'work', argumentNames: [],
        warp: false, x: 24, y: 48, calls: 0, scriptCalls: 0, callees: []};
    const before = JSON.stringify([cat, dog, stage, definition]);
    const data = readMessageCallGraph(cat, [cat, dog, stage], new Map([['cat', [definition]]]),
        (targetId, scriptId) => `${targetId}/${scriptId}`);

    assert.deepEqual(data.edges, ['dog:received', 'dog:second', 'stage:received'].map(to =>
        ({from: 'def', to, messageKey: 'go', messageName: 'Start now', wait: false})));
    assert.equal(data.scripts[0].definition, definition);
    assert.equal(data.scripts[0].label, 'cat/def');
    assert.equal(data.scripts[0].x, 24);
    assert.equal(data.scripts[0].y, 48);
    assert.equal(data.scripts.find(script => script.id === 'stage:received').isStage, true);
    assert.equal(data.scripts.find(script => script.id === 'dog:received').receivedMessage, 'Start now');
    assert.equal(JSON.stringify([cat, dog, stage, definition]), before);
});

test('repeated send blocks share an edge, while send-and-wait and recursive broadcasts remain distinct', () => {
    const cat = target('cat', {
        flag: root('flag', 'event_whenflagclicked', {next: 'one'}),
        ...send('one', 'flag', 'go', false, {next: 'two'}),
        ...send('two', 'one', 'go', false, {next: 'wait'}),
        ...send('wait', 'two', 'go', true),
        receive: received('receive', 'go', 'go', {next: 'self'}),
        ...send('self', 'receive')
    });
    assert.deepEqual(read(cat).edges, [
        {from: 'flag', to: 'receive', messageKey: 'go', messageName: 'go', wait: false},
        {from: 'flag', to: 'receive', messageKey: 'go', messageName: 'go', wait: true},
        {from: 'receive', to: 'receive', messageKey: 'go', messageName: 'go', wait: false}
    ]);
});

test('a reporter in the broadcast input never uses the inactive menu shadow as a fixed message', () => {
    const cat = target('cat', {
        flag: root('flag', 'event_whenflagclicked', {next: 'dynamic'}),
        ...send('dynamic', 'flag', 'go', false, {inputs: {BROADCAST_INPUT: {block: 'reporter', shadow: 'dynamic-menu'}}}),
        reporter: {id: 'reporter', opcode: 'data_variable', parent: 'dynamic', fields: {VARIABLE: {id: 'value', value: 'value'}}}
    });
    const dog = target('dog', {received: received('received')});
    assert.deepEqual(read(cat, [dog]), {scripts: [], edges: []});
});

test('message variable ids distinguish equal names, and unrelated or cloned targets add no relationships', () => {
    const cat = target('cat', {
        flag: root('flag', 'event_whenflagclicked', {next: 'send'}), ...send('send', 'flag', 'first')
    }, {variables: {first: {type: 'broadcast_msg', name: 'same'}}});
    const dog = target('dog', {
        match: received('match', 'first', 'same'), different: received('different', 'second', 'same'),
        flag: root('flag', 'event_whenflagclicked', {next: 'unrelated'}), ...send('unrelated', 'flag', 'third')
    });
    const clone = target('clone', {received: received('received', 'first')}, {isOriginal: false});
    const stage = target('stage', {received: received('received', 'third')}, {isStage: true});
    const data = read(cat, [dog, clone, stage]);
    assert.deepEqual(data.edges, [{from: 'flag', to: 'dog:match', messageKey: 'first', messageName: 'same', wait: false}]);
    assert.deepEqual(data.scripts.map(script => script.id), ['flag', 'dog:match']);
});

test('a receiving target includes foreign senders but excludes relationships between foreign scripts', () => {
    const cat = target('cat', {received: received('received')});
    const dog = target('dog', {flag: root('flag', 'event_whenflagclicked', {next: 'send'}), ...send('send', 'flag'),
        received: received('received')});
    const stage = target('stage', {received: received('received')}, {isStage: true});
    const data = read(cat, [dog, stage]);
    assert.deepEqual(data.edges, [{from: 'dog:flag', to: 'received', messageKey: 'go', messageName: 'go', wait: false}]);
    assert.deepEqual(data.scripts.map(script => script.id), ['received', 'dog:flag']);
    assert.equal(data.scripts[1].targetName, 'DOG');
    assert.equal(data.scripts[1].scriptId, 'flag');
});

test('unmatched messages keep local scripts, including loose stacks, with no invented destination', () => {
    const cat = target('cat', {
        ...send('loose', '', 'sendOnly', false, {parent: null, topLevel: true}),
        received: received('received', 'receiveOnly')
    });
    const data = read(cat);
    assert.deepEqual(data.edges, []);
    assert.deepEqual(data.scripts.map(script => script.id).sort(), ['loose', 'received']);
});

test('foreign function callees stay in their own target even when a local script has the same id', () => {
    const cat = target('cat', {helper: received('helper')});
    const dog = target('dog', {
        producer: root('producer', 'procedures_definition', {next: 'send'}), ...send('send', 'producer'),
        helper: root('helper', 'procedures_definition', {next: 'second'}), ...send('second', 'helper')
    });
    const helper: SpriteFunction = {id: 'helper', kind: 'procedure', proccode: 'helper', argumentNames: [],
        warp: false, x: 0, y: 0, calls: 1, scriptCalls: 0, callees: []};
    const producer: SpriteFunction = {...helper, id: 'producer', proccode: 'producer', callees: ['helper', 'unknown']};
    const data = readMessageCallGraph(cat, [dog], new Map([['dog', [producer, helper]]]));
    const foreign = data.scripts.find(script => script.id === 'dog:producer').definition;

    assert.notEqual(foreign, producer, 'qualifying graph links never changes the source definition');
    assert.deepEqual(foreign.callees, ['dog:helper']);
    assert.deepEqual(producer.callees, ['helper', 'unknown']);
    assert.deepEqual(data.edges.map(edge => [edge.from, edge.to]), [['dog:producer', 'helper'], ['dog:helper', 'helper']]);
});
