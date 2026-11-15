import assert from 'node:assert/strict';
import test from 'node:test';
import {describeScriptStart, scriptStartOf} from '../dist/script-start.js';

const text = (value: string) => ({opcode: 'text', inputs: {}, fields: {TEXT: {value}}});

const blocks = {
    key: {opcode: 'event_whenkeypressed', parent: null, inputs: {}, fields: {KEY_OPTION: {value: 'space'}}},
    'key-say': {opcode: 'looks_say', parent: 'key', inputs: {}, fields: {}},
    jump: {opcode: 'procedures_definition', parent: null, inputs: {custom_block: {block: 'jump-proto', shadow: 'jump-proto'}}},
    'jump-proto': {opcode: 'procedures_prototype', parent: 'jump', inputs: {},
        mutation: {proccode: 'jump %s times', argumentnames: '["height"]'}},
    'jump-body': {opcode: 'control_repeat', parent: 'jump', inputs: {}},
    'jump-deep': {opcode: 'event_broadcast', parent: 'jump-body', inputs: {}},
    add: {opcode: 'kubohiroyanamedfunctions_defineFunction', parent: null, inputs: {
        NAME: {block: 'add-name', shadow: 'add-name'},
        DESCRIPTION: {block: 'add-description', shadow: 'add-description'},
        SCHEMA: {block: 'add-schema', shadow: 'add-schema'}
    }},
    'add-name': text('add'),
    'add-description': text('Adds two numbers.'),
    'add-schema': text('{"type":"object"}'),
    'add-body': {opcode: 'event_broadcast', parent: 'add', inputs: {}},
    joined: {opcode: 'kubohiroyanamedfunctions_defineFunction', parent: null, inputs: {
        NAME: {block: 'joined-reporter', shadow: 'joined-name'}
    }},
    'joined-name': text('ignored'),
    'joined-reporter': {opcode: 'operator_join', parent: 'joined', inputs: {}}
};

test('a script starts with a hat, a function or a named function', () => {
    assert.deepEqual(scriptStartOf(blocks, 'key-say'),
        {id: 'key', opcode: 'event_whenkeypressed', kind: 'hat', text: ['space']});
    assert.deepEqual(scriptStartOf(blocks, 'jump-deep'),
        {id: 'jump', opcode: 'procedures_definition', kind: 'function', label: 'jump (height) times', text: []});
    // A named function is told by its name, not by its description or schema.
    assert.deepEqual(scriptStartOf(blocks, 'add-body'),
        {id: 'add', opcode: 'kubohiroyanamedfunctions_defineFunction', kind: 'named-function', label: 'add', text: []});
    assert.equal(scriptStartOf(blocks, 'joined').label, '', 'a name built at run time is not read');
    assert.equal(scriptStartOf(blocks, 'missing'), undefined);
});

test('a running target is described through its blocks', () => {
    const runtime = {getTargetById: (id: string) => id === 'cat' ? {blocks: {_blocks: blocks}} : undefined};
    assert.equal(describeScriptStart(runtime, 'cat', 'jump-deep').kind, 'function');
    assert.equal(describeScriptStart(runtime, 'dog', 'jump-deep'), undefined);
});
