/**
 * Reads the variables of the Temporary Variables extension (`lmsTempVars2`) for the variable pane.
 *
 * The extension names its variables with a text input, so a name is known before the project runs
 * only when that input holds fixed text. Those names are listed from the code. Values exist only
 * while the project runs: thread variables are stored on each thread and runtime variables on the
 * extension instance. They are read while the debugger has paused the project, when they hold still.
 */

import {scriptStartOf} from './script-start.ts';

export const temporaryVariablesExtensionId = 'lmsTempVars2';

/**
 * What a block does with the variable it names. Setting a value defines the variable, reading it
 * refers to it, and changing or deleting it rewrites it. Defining and rewriting both count as writes.
 */
type Role = 'define' | 'refer' | 'rewrite';
const threadOpcodes: Readonly<Record<string, Role>> = {
    setThreadVariable: 'define', changeThreadVariable: 'define', forEachThreadVariable: 'define',
    getThreadVariable: 'refer', threadVariableExists: 'refer'
};
const runtimeOpcodes: Readonly<Record<string, Role>> = {
    setRuntimeVariable: 'define', changeRuntimeVariable: 'rewrite', deleteRuntimeVariable: 'rewrite',
    getRuntimeVariable: 'refer', runtimeVariableExists: 'refer'
};

export type TemporaryVariableScope = 'thread' | 'runtime';

/** Who holds a thread variable's value: the thread's sprite or clone, and the thread's place in the runtime. */
export interface TemporaryVariableOwner {
    targetName: string;
    /** One-based clone number. Absent for the original sprite and the stage. */
    clone?: number;
    /** One-based position of the thread among the running threads. */
    thread: number;
}

export interface TemporaryVariableValue {
    /** Present for thread variables. A runtime variable has one value for the whole project. */
    owner?: TemporaryVariableOwner;
    value: string;
}

/** The top block of a script outside any function, usually a hat such as `when I receive [go]`. */
export interface TemporaryVariableScript {
    /** Id of the top block. */
    id: string;
    opcode: string;
    /**
     * The values that tell this hat apart from others of its kind, in the order the block shows
     * them: the message of `when I receive`, the key of `when key pressed`, and so on.
     */
    text: readonly string[];
}

/**
 * A custom block definition that uses a variable. Without id, the variable is used outside any
 * function, in the script that `script` names.
 */
export interface TemporaryVariableFunction {
    /** Id of the `procedures_definition` block. */
    id?: string;
    /** The block as it reads, such as `jump (height) times`. */
    label?: string;
    /** For a use outside any function: the script's top block. */
    script?: TemporaryVariableScript;
    /** The sprite or stage whose code holds the function. */
    targetId?: string;
    /** Runtime variables only, since their functions can be in any sprite. */
    targetName?: string;
    /** The function is in the stage, which the editor names in the viewer's language. */
    stage?: boolean;
}

export interface TemporaryVariable {
    name: string;
    /** The name is written as fixed text in a block of the code. */
    fixed: boolean;
    read: number;
    write: number;
    /**
     * Functions that define the variable. A thread variable is defined by setting it, changing it or
     * looping over it; a runtime variable by setting it.
     */
    functions?: readonly TemporaryVariableFunction[];
    /** Runtime variables only: functions that read the variable or ask whether it exists. */
    readers?: readonly TemporaryVariableFunction[];
    /** Runtime variables only: functions that change or delete the variable. */
    writers?: readonly TemporaryVariableFunction[];
    /** Values that exist at the pause. Absent while the project is not paused. */
    values?: readonly TemporaryVariableValue[];
}

/**
 * What an extension lists for the variable pane: its own variables, which are not Scratch variables.
 * `variables` maps each name to its value; null or absent while the extension has none to show.
 */
export interface InspectorVariableList {
    title: string;
    description?: string;
    variables?: Readonly<Record<string, unknown>> | null;
}

/**
 * An extension instance (`runtime.ext_<id>`) that shows its own variables in the stage's variable
 * pane. The pane asks while the debugger has paused the project, and once to learn the title.
 */
export interface InspectorVariableProvider {
    getInspectorVariables(): InspectorVariableList | null | undefined;
}

/** One extension's variables, listed on the stage after the runtime variables. */
export interface ExtensionVariableGroup {
    /** The extension id, without the `ext_` prefix. */
    id: string;
    title: string;
    description?: string;
    /** Values at the pause. Absent while the project is not paused. */
    values?: readonly {name: string; value: string}[];
}

export interface TemporaryVariables {
    paused: boolean;
    thread: readonly TemporaryVariable[];
    /** Runtime variables belong to the whole project, so only the stage lists them. */
    runtime?: readonly TemporaryVariable[];
    /** Variables that extensions provide, which belong to the whole project like runtime variables. */
    extensions?: readonly ExtensionVariableGroup[];
}

type BlockInput = {block?: string | null; shadow?: string | null};
type Block = {
    opcode: string;
    parent?: string | null;
    inputs?: Record<string, BlockInput>;
    fields?: Record<string, {value?: unknown}>;
    mutation?: {proccode?: string; argumentnames?: string};
};
interface Sprite {clones?: readonly Target[]}
interface Target {
    id: string;
    isStage: boolean;
    isOriginal?: boolean;
    sprite?: Sprite;
    blocks?: {_blocks?: Record<string, Block>};
    getName(): string;
}
interface Thread {
    target?: Target | null;
    variables?: Record<string, unknown> | null;
}
type Listener = () => void;

export interface TemporaryVariablesRuntime {
    targets: readonly Target[];
    threads: readonly Thread[];
    getTargetById(id: string): Target | undefined;
    ioDevices?: {clock?: {_paused?: boolean}};
    ext_lmsTempVars2?: {runtimeVariables?: Record<string, unknown> | null};
    on(event: string, listener: Listener): void;
    removeListener(event: string, listener: Listener): void;
}

const providerPrefix = 'ext_';

function readProviders(runtime: TemporaryVariablesRuntime) {
    const lists: {id: string; list: InspectorVariableList}[] = [];
    for (const [key, extension] of Object.entries(runtime)) {
        if (!key.startsWith(providerPrefix) || key === providerPrefix + temporaryVariablesExtensionId) continue;
        const provider = extension as Partial<InspectorVariableProvider> | null;
        if (typeof provider?.getInspectorVariables !== 'function') continue;
        let list: InspectorVariableList | null | undefined;
        try {
            list = provider.getInspectorVariables();
        } catch {
            // An extension that fails to answer is left out rather than breaking the pane.
            continue;
        }
        if (!list || typeof list.title !== 'string' || !list.title) continue;
        lists.push({id: key.slice(providerPrefix.length), list});
    }
    return lists;
}

/** The variables that extensions provide, with their values while the project is paused. */
export function readExtensionVariables(runtime: TemporaryVariablesRuntime, paused = isRuntimePaused(runtime)): ExtensionVariableGroup[] {
    return readProviders(runtime).map(({id, list}) => ({
        id, title: list.title,
        ...typeof list.description === 'string' && list.description && {description: list.description},
        ...paused && {values: Object.entries(list.variables ?? {}).map(([name, value]) => ({name, value: displayStructured(value)}))}
    }));
}

/** The debugger pauses the project clock together with every thread. */
export const isRuntimePaused = (runtime: TemporaryVariablesRuntime) => runtime.ioDevices?.clock?._paused === true;

type Use = {read: number; write: number} & Record<Role, TemporaryVariableFunction[]>;
type Uses = Map<string, Use>;

/** The custom block definition a block belongs to, or the top block of its script outside any function. */
function functionOf(blocks: Record<string, Block>, id: string): TemporaryVariableFunction {
    const start = scriptStartOf(blocks, id);
    if (!start) return {};
    if (start.kind === 'function') return {id: start.id, label: start.label};
    // A named function is a script of its own. Its name tells it apart, as a message does for a hat.
    return {script: {id: start.id, opcode: start.opcode, text: start.kind === 'named-function' ? [start.label] : start.text}};
}

function scanBlocks(target: Target, opcodes: Readonly<Record<string, Role>>, uses: Uses, withTarget = false) {
    const blocks = target.blocks?._blocks ?? {};
    let found = false;
    for (const [id, block] of Object.entries(blocks)) {
        const prefix = temporaryVariablesExtensionId + '_';
        if (!block?.opcode?.startsWith(prefix)) continue;
        found = true;
        const role = opcodes[block.opcode.slice(prefix.length)];
        const input = block.inputs?.VAR;
        // A reporter dropped into the input replaces the shadow, so the name is decided at run time.
        if (!role || !input?.block || input.block !== input.shadow) continue;
        const shadow = blocks[input.block];
        if (shadow?.opcode !== 'text') continue;
        const name = String(shadow.fields?.TEXT?.value ?? '');
        const use = uses.get(name) ?? {read: 0, write: 0, define: [], refer: [], rewrite: []};
        use[role === 'refer' ? 'read' : 'write']++;
        const owner = {...functionOf(blocks, id), targetId: target.id,
            ...withTarget && {targetName: target.getName(), ...target.isStage && {stage: true}}};
        // One entry per function or per script outside any function.
        const key = owner.id ?? owner.script?.id;
        if (!use[role].some(each => (each.id ?? each.script?.id) === key && each.targetId === owner.targetId)) use[role].push(owner);
        uses.set(name, use);
    }
    return found;
}

const display = (value: unknown) => typeof value === 'string' ? value : String(value);
/** Extension variables may hold lists and records, which read better as JSON than as [object Object]. */
function displayStructured(value: unknown) {
    if (typeof value !== 'object' || value === null) return display(value);
    try {
        return JSON.stringify(value) ?? display(value);
    } catch {
        return display(value);
    }
}

function merge(uses: Uses, values: Map<string, TemporaryVariableValue[]> | undefined,
    scope: TemporaryVariableScope): TemporaryVariable[] {
    const names = new Set([...uses.keys(), ...values?.keys() ?? []]);
    return [...names].map(name => {
        const use = uses.get(name);
        return {
            name, fixed: Boolean(use), read: use?.read ?? 0, write: use?.write ?? 0,
            functions: use?.define ?? [],
            ...scope === 'runtime' && {readers: use?.refer ?? [], writers: use?.rewrite ?? []},
            ...values && {values: values.get(name) ?? []}
        };
    });
}

const belongsTo = (thread: Thread, target: Target) => Boolean(thread.target) &&
    (target.isStage ? thread.target === target : Boolean(target.sprite) && thread.target.sprite === target.sprite);

/**
 * Lists the thread variables named in the target's code and, for the stage, the runtime variables
 * named anywhere in the project. While paused, it adds the values that exist at that moment,
 * including those whose names were built at run time. Returns undefined when the project does not
 * use the extension.
 */
export function readTemporaryVariables(runtime: TemporaryVariablesRuntime, targetId: string): TemporaryVariables | undefined {
    const target = runtime.getTargetById(targetId);
    if (!target) return undefined;
    const extension = runtime.ext_lmsTempVars2;
    const threadUses: Uses = new Map();
    let used = scanBlocks(target, threadOpcodes, threadUses);
    const runtimeUses: Uses = new Map();
    if (target.isStage) {
        for (const each of runtime.targets) {
            if (each.isOriginal === false) continue;
            used = scanBlocks(each, runtimeOpcodes, runtimeUses, true) || used;
        }
    }
    const paused = isRuntimePaused(runtime);
    const extensions = target.isStage ? readExtensionVariables(runtime, paused) : [];
    if (!used && !extension && !extensions.length) return undefined;
    let threadValues: Map<string, TemporaryVariableValue[]> | undefined;
    let runtimeValues: Map<string, TemporaryVariableValue[]> | undefined;
    if (paused) {
        threadValues = new Map();
        runtime.threads.forEach((thread, index) => {
            if (!thread.variables || !belongsTo(thread, target)) return;
            const owner = thread.target;
            const clone = owner.isOriginal === false ? owner.sprite?.clones?.indexOf(owner) : -1;
            for (const [name, value] of Object.entries(thread.variables)) {
                const list = threadValues.get(name) ?? [];
                list.push({
                    owner: {targetName: owner.getName(), ...clone > 0 && {clone}, thread: index + 1},
                    value: display(value)
                });
                threadValues.set(name, list);
            }
        });
        if (target.isStage) {
            runtimeValues = new Map(Object.entries(extension?.runtimeVariables ?? {})
                .map(([name, value]) => [name, [{value: display(value)}]]));
        }
    }
    return {
        paused,
        thread: merge(threadUses, threadValues, 'thread'),
        ...target.isStage && (used || extension) && {runtime: merge(runtimeUses, runtimeValues, 'runtime')},
        ...extensions.length && {extensions}
    };
}

function pausedSnapshot(runtime: TemporaryVariablesRuntime) {
    const threads = runtime.threads.map(thread => thread.variables ? Object.entries(thread.variables) : null);
    return JSON.stringify([threads, Object.entries(runtime.ext_lmsTempVars2?.runtimeVariables ?? {}),
        readExtensionVariables(runtime, true)]);
}

/**
 * Calls onChange when the debugger pauses or resumes the project, and while it is paused, when a
 * single step changes a value. The debugger reports no event for single steps, so the values are
 * compared at an interval for as long as the pause lasts.
 */
export function watchTemporaryVariables(runtime: TemporaryVariablesRuntime, onChange: () => void, interval = 250) {
    let timer: ReturnType<typeof setInterval> | undefined;
    let last = '';
    const stopPolling = () => {
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
    };
    const poll = () => {
        if (!isRuntimePaused(runtime)) {
            stopPolling();
            onChange();
            return;
        }
        const next = pausedSnapshot(runtime);
        if (next === last) return;
        last = next;
        onChange();
    };
    const paused = () => {
        last = pausedSnapshot(runtime);
        if (timer === undefined) timer = setInterval(poll, interval);
        onChange();
    };
    const unpaused = () => {
        stopPolling();
        onChange();
    };
    runtime.on('RUNTIME_PAUSED', paused);
    runtime.on('RUNTIME_UNPAUSED', unpaused);
    if (isRuntimePaused(runtime)) paused();
    return () => {
        stopPolling();
        runtime.removeListener('RUNTIME_PAUSED', paused);
        runtime.removeListener('RUNTIME_UNPAUSED', unpaused);
    };
}
