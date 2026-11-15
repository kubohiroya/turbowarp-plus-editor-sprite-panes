/**
 * What a script starts with: a hat such as `when I receive [go]`, a custom block definition, or a
 * named function of TurboWarp Plus. The panes use it to say where a block is, for example which
 * script sends a message or sets a temporary variable.
 */

import {functionLabel} from './sprite-function-pane.tsx';

/** The hat of the Named Functions extension: `define function [NAME] description [...] ...`. */
export const namedFunctionOpcode = 'kubohiroyanamedfunctions_defineFunction';

export type ScriptStartKind = 'hat' | 'function' | 'named-function';

export interface ScriptStart {
    /** Id of the script's top block. */
    id: string;
    opcode: string;
    kind: ScriptStartKind;
    /**
     * The function as its block reads (`jump (height) times`) or the named function's name. Absent
     * for hats.
     */
    label?: string;
    /**
     * For hats, the values that tell the hat apart from others of its kind, in the order the block
     * shows them: the message of `when I receive`, the key of `when key pressed`, and so on.
     */
    text: readonly string[];
}

type BlockInput = {block?: string | null; shadow?: string | null};
export interface ScriptBlock {
    opcode: string;
    parent?: string | null;
    inputs?: Record<string, BlockInput>;
    fields?: Record<string, {value?: unknown}>;
    mutation?: {proccode?: string; argumentnames?: string};
}

export interface ScriptStartRuntime {
    getTargetById(id: string): {blocks?: {_blocks?: Record<string, ScriptBlock>}} | undefined;
}

function argumentNames(argumentnames = '[]') {
    try {
        const parsed = JSON.parse(argumentnames);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        // Keep the label without argument names when they cannot be read.
        return [];
    }
}

/** The values of a block's fields and of the fields of its shadow inputs, as the block shows them. */
function fieldText(blocks: Record<string, ScriptBlock>, block: ScriptBlock): string[] {
    const text: string[] = [];
    for (const input of Object.values(block.inputs ?? {})) {
        const shadow = input?.shadow && input.block === input.shadow ? blocks[input.shadow] : undefined;
        if (shadow) text.push(...fieldText(blocks, shadow));
    }
    for (const field of Object.values(block.fields ?? {})) {
        if (field?.value !== undefined && field.value !== null && field.value !== '') text.push(String(field.value));
    }
    return text;
}

/** The text written in a block's input, when the input holds fixed text rather than a reporter. */
function inputText(blocks: Record<string, ScriptBlock>, block: ScriptBlock, name: string) {
    const input = block.inputs?.[name];
    if (!input?.block || input.block !== input.shadow) return undefined;
    return fieldText(blocks, blocks[input.block] ?? {opcode: ''})[0];
}

/** How the script that holds a block starts. Undefined when the block is unknown. */
export function scriptStartOf(blocks: Record<string, ScriptBlock>, blockId: string): ScriptStart | undefined {
    const seen = new Set<string>();
    let id = blockId;
    while (blocks[id]?.parent && !seen.has(id)) {
        seen.add(id);
        id = blocks[id].parent;
    }
    const top = blocks[id];
    if (!top) return undefined;
    if (top.opcode === 'procedures_definition') {
        const mutation = blocks[top.inputs?.custom_block?.block ?? '']?.mutation;
        if (mutation?.proccode) {
            const label = functionLabel({proccode: mutation.proccode, argumentNames: argumentNames(mutation.argumentnames)});
            return {id, opcode: top.opcode, kind: 'function', label, text: []};
        }
    }
    if (top.opcode === namedFunctionOpcode) {
        return {id, opcode: top.opcode, kind: 'named-function', label: inputText(blocks, top, 'NAME') ?? '', text: []};
    }
    return {id, opcode: top.opcode, kind: 'hat', text: fieldText(blocks, top)};
}

/** `scriptStartOf` for a block of a target in the running project. */
export function describeScriptStart(runtime: ScriptStartRuntime, targetId: string, blockId: string) {
    const blocks = runtime.getTargetById(targetId)?.blocks?._blocks;
    return blocks ? scriptStartOf(blocks, blockId) : undefined;
}
