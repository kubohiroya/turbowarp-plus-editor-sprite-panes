import React from 'react';
import {readMessageCallGraph, type MessageCallGraph, type MessageCallGraphScript} from './message-call-graph.ts';

/**
 * A function of one sprite or the stage: a Scratch custom block (`procedure`) or a function of the
 * named-functions extension (`named`), which TurboWarp Plus offers in its extension library.
 */
export interface SpriteFunction {
    /** The id of the definition hat: `procedures_definition`, or the extension's `define function`. */
    id: string;
    kind: 'procedure' | 'named';
    /** A custom block's proccode, or the name of a named function. */
    proccode: string;
    argumentNames: readonly string[];
    warp: boolean;
    /** Where the definition script sits in the code area. */
    x: number;
    y: number;
    /** How many blocks in this sprite call the function. */
    calls: number;
    /** How many of those calls sit in scripts that are not function definitions, such as a green flag script. */
    scriptCalls: number;
    /** The functions this definition calls, by definition id, in the order first met. */
    callees: readonly string[];
    /** The blocks that call the function, each with the top block of the script it sits in. */
    uses?: readonly FunctionUse[];
    /** Who may call a named function: scripts of this sprite only, or every sprite. */
    scope?: 'sprite' | 'global';
    /** The description a named function gives in its `define function` hat. */
    description?: string;
    /** Where a global function of another sprite or the stage is defined, for one in `globals`. */
    owner?: GlobalFunctionOwner;
}

/** The sprite or the stage that defines a global function shown with another target's functions. */
export interface GlobalFunctionOwner {
    targetId: string;
    name: string;
    isStage: boolean;
    /** The id of its `define function` hat in that target. */
    functionId: string;
    /** A host-provided preview of the owner's current costume or backdrop. */
    thumbnailUrl?: string;
}

/** A block that calls a function, and the top block of its script: a hat, a definition, or a loose stack. */
export interface FunctionUse {
    block: string;
    script: string;
}

/**
 * The extensions whose `define function`, `call function`, `call [menu]` and `start function` blocks
 * are read as named functions. An extension that carries those blocks through the named-functions
 * Composition API under its own ID can be added here.
 */
export const namedFunctionExtensions: readonly string[] = ['kubohiroyanamedfunctions'];

/** A script that starts with a hat other than a function definition, such as “when green flag clicked”. */
export interface SpriteHatScript {
    /** The id of the hat block. */
    id: string;
    /** The owning target when opening a script of another sprite or the stage. */
    targetId?: string;
    /** How the hat reads, such as `when this sprite clicked`. The host spells it, as it knows the block. */
    label: string;
    /** Where the script sits in the code area. */
    x: number;
    y: number;
    /** A drawing of the hat block, which the list shows at the start of the item. The pane shows a copy. */
    thumbnail?: SVGSVGElement;
}

/** Where to look in the script that opens: a block to show, such as a call picked in the list of uses. */
export interface OpenScriptOptions {
    block?: string;
}

export interface FunctionPaneData {
    targetId: string;
    isStage: boolean;
    functions: readonly SpriteFunction[];
    /** The other hat scripts, which the list shows above the functions. */
    hats?: readonly SpriteHatScript[];
    /**
     * Global named functions of other sprites or the stage that call this target's functions or that its
     * functions call. The call graph draws them with their links; the list leaves them out. Their ids
     * are `<target id>:<hat id>`, so they cannot clash with this target's.
     */
    globals?: readonly SpriteFunction[];
    /** Message relationships read by the package scanner. */
    messageGraph?: MessageCallGraph;
    /** Static calls and message sends supplied by the editor for the relation graph. */
    scriptRelations?: readonly ScriptRelation[];
    /** Names and positions of the scripts referred to by `scriptRelations`. */
    scripts?: readonly GraphScript[];
}

export interface ScriptEndpoint {
    targetId: string;
    blockId: string;
    scriptId: string;
}

export interface ScriptRelation {
    kind: 'function' | 'message';
    source: ScriptEndpoint;
    destination?: ScriptEndpoint;
    label: string;
    wait: boolean;
    unresolved?: 'dynamic' | 'missing' | 'ambiguous';
}

export interface GraphScript {
    targetId: string;
    scriptId: string;
    label: string;
    targetName?: string;
    isStage?: boolean;
    x?: number;
    y?: number;
}

export interface FunctionRelationVisibility {
    function: boolean;
    message: boolean;
}

const allRelationKinds: FunctionRelationVisibility = {function: true, message: true};

export type FunctionOrder = 'name' | 'z' | 'n';
export const functionOrders: readonly FunctionOrder[] = ['name', 'z', 'n'];
export type FunctionPaneMode = 'list' | 'graph';
export type CallGraphDirection = 'LR' | 'TD';

export type FunctionKind = SpriteFunction['kind'];

export interface FunctionPaneSettings {
    mode: FunctionPaneMode;
    order: FunctionOrder;
    direction: CallGraphDirection;
    /** Which kind of function the add dialog starts with: the kind added last. */
    create: FunctionKind;
    /** Legacy arrow-only filters; node positions and the view remain unchanged. */
    showCalls?: boolean;
    showMessages?: boolean;
    /** The call graph's independent relation filters, when the host offers them. */
    relationVisibility?: FunctionRelationVisibility;
    /** Diagram positions are separate for each target and flow direction; project blocks never move. */
    graphPositions?: Record<string, Partial<Record<CallGraphDirection, GraphNodePositions>>>;
}

export type GraphNodePositions = Record<string, {x: number; y: number}>;
const defaultSettings: FunctionPaneSettings = {mode: 'list', order: 'name', direction: 'LR', create: 'procedure'};

/**
 * Why creating a function failed: `duplicate` when a function of that name already exists, `invalid`
 * when the name cannot be used, `unavailable` when the named-functions extension cannot be loaded.
 */
export type FunctionCreateError = 'duplicate' | 'invalid' | 'unavailable' | 'failed';
const createErrors: readonly FunctionCreateError[] = ['duplicate', 'invalid', 'unavailable', 'failed'];

/**
 * Mount an editor of one definition script into `element`. The host owns the editor;
 * the returned function disposes it.
 */
export type MountFunctionEditor = (element: HTMLElement, targetId: string, functionId: string,
    options: {editable: boolean}) => (() => void) | void;

export interface SpriteFunctionPaneProps {
    kind: 'functions';
    locale: string;
    editable: boolean;
    data: FunctionPaneData;
    /** The settings to start with, such as the ones this view used before. */
    defaultSettings?: Partial<FunctionPaneSettings>;
    onSettingsChange?(settings: FunctionPaneSettings): void;
    /** The host's current graph direction, controlled by its section rail. */
    direction?: CallGraphDirection;
    relationVisibility?: FunctionRelationVisibility;
    /** Open a graph script endpoint without treating its hat as a function definition. */
    onOpenRelationScript?(endpoint: ScriptEndpoint): void;
    mountEditor?: MountFunctionEditor;
    /**
     * Open one function outside the pane, such as in a tab beside it. The call graph uses it in place of
     * its dialog, also for a function just created there.
     */
    onOpenFunction?(fn: SpriteFunction, options?: OpenScriptOptions): void;
    /**
     * Open a hat script picked in the list, as `onOpenFunction` opens a function. Without it hats cannot be opened.
     * A call found in no hat script or function opens the same way, with the label of a loose script.
     */
    onOpenScript?(hat: SpriteHatScript, options?: OpenScriptOptions): void;
    /** The function or hat script shown beside the pane, which the list highlights. */
    selectedId?: string;
    /**
     * Show only the list or only the call graph, without the switch between them, as when each is a section
     * of its own. The pane otherwise shows the view in its settings.
     */
    view?: FunctionPaneMode;
    /**
     * Make a new function of this kind and name in the target and resolve with the id of its hat, or with
     * nothing when nothing was made. The name is trimmed and not empty: a custom block's block text,
     * or a named function's name. A rejection may carry a `code` of {@link FunctionCreateError}.
     * With it the pane shows an add button below the list and in a corner of the call graph,
     * and opens the function it makes.
     */
    onCreate?(kind: FunctionKind, name: string): Promise<string | void> | string | void;
}

interface RuntimeBlock {
    id: string;
    opcode: string;
    parent?: string | null;
    next?: string | null;
    shadow?: boolean;
    topLevel?: boolean;
    x?: number;
    y?: number;
    inputs?: Record<string, {block?: string | null; shadow?: string | null}>;
    fields?: Record<string, {id?: string; value?: unknown}>;
    mutation?: {proccode?: string; argumentnames?: string; warp?: string | boolean};
}

/** The parts of a VM target the reader uses: its blocks, and a name for global functions defined in it. */
export interface FunctionTarget {
    id: string;
    isStage?: boolean;
    isOriginal?: boolean;
    variables?: Record<string, {name: string; type?: string}>;
    /** The name of the sprite, as the VM's `getName()` gives it. */
    getName?(): string;
    sprite?: {name?: string};
    blocks: {_blocks: Record<string, RuntimeBlock>};
}

type Reading = SpriteFunction & {callees: string[]; uses: FunctionUse[]};

/** Every definition of one target, and every call in it with the script it sits in. */
function scanTarget(target: FunctionTarget, extensions: readonly string[]) {
    const blocks = target.blocks._blocks;
    // A name counts only as literal text: a reporter dropped on the input decides it while the project runs.
    function literal(block: RuntimeBlock, name: string) {
        const input = block.inputs?.[name];
        if (!input?.block || (input.shadow && input.block !== input.shadow)) return undefined;
        const value = blocks[input.block]?.fields?.TEXT?.value;
        return value === undefined || value === null ? undefined : String(value);
    }
    const named = (block: RuntimeBlock, opcode: string) => extensions.some(id => block.opcode === `${id}_${opcode}`);
    const tops = new Map<string, string>();
    function topOf(id: string) {
        const path: string[] = [];
        let current = id;
        while (!tops.has(current) && blocks[current]?.parent && !path.includes(current)) {
            path.push(current);
            current = blocks[current].parent;
        }
        const top = tops.get(current) ?? current;
        for (const step of [...path, current]) tops.set(step, top);
        return top;
    }

    const functions: Reading[] = [];
    const byCode = new Map<string, Reading>();
    for (const block of Object.values(blocks)) {
        if (block.opcode !== 'procedures_definition') continue;
        const prototype = blocks[block.inputs?.custom_block?.block ?? ''];
        const mutation = prototype?.mutation;
        if (!mutation?.proccode) continue;
        let argumentNames: string[] = [];
        try {
            const parsed = JSON.parse(mutation.argumentnames ?? '[]');
            if (Array.isArray(parsed)) argumentNames = parsed.map(String);
        } catch {
            // Keep the definition listed even when its argument names cannot be read.
        }
        const fn = {
            id: block.id, kind: 'procedure' as const, proccode: mutation.proccode, argumentNames,
            warp: mutation.warp === true || mutation.warp === 'true',
            x: Number(block.x) || 0, y: Number(block.y) || 0,
            calls: 0, scriptCalls: 0, callees: [] as string[], uses: [] as FunctionUse[]
        };
        functions.push(fn);
        if (!byCode.has(fn.proccode)) byCode.set(fn.proccode, fn);
    }
    const byName = new Map<string, Reading>();
    for (const block of Object.values(blocks)) {
        if (block.topLevel === false || !named(block, 'defineFunction')) continue;
        // named-functions cannot call a hat whose NAME is not literal text either.
        const name = literal(block, 'NAME')?.trim();
        if (!name) continue;
        const scope = block.fields?.SCOPE?.value;
        const fn = {
            id: block.id, kind: 'named' as const, proccode: name, argumentNames: [], warp: false,
            x: Number(block.x) || 0, y: Number(block.y) || 0, calls: 0, scriptCalls: 0, callees: [] as string[],
            uses: [] as FunctionUse[],
            // Hats saved before SCOPE existed are for all sprites.
            scope: scope === 'sprite' ? 'sprite' as const : 'global' as const,
            description: literal(block, 'DESCRIPTION')?.trim() || undefined
        };
        functions.push(fn);
        if (!byName.has(name)) byName.set(name, fn);
    }
    const definitions = new Map(functions.map(fn => [fn.id, fn]));
    /** A call: a custom block found here, or a named function by its name, found here or not. */
    const calls: {block: string; script: string; caller?: Reading; callee?: Reading; name?: string}[] = [];
    for (const block of Object.values(blocks)) {
        let callee: Reading | undefined;
        let name: string | undefined;
        if (block.opcode === 'procedures_call') callee = byCode.get(block.mutation?.proccode);
        else {
            if (named(block, 'callFunction') || named(block, 'startFunction')) name = literal(block, 'NAME')?.trim();
            else if (named(block, 'callFunctionFromMenu')) name = String(block.fields?.FUNCTION?.value ?? '').trim();
            if (!name) continue;
            callee = byName.get(name);
        }
        if (!callee && !name) continue;
        const script = topOf(block.id);
        calls.push({block: block.id, script, caller: definitions.get(script), callee, name});
    }
    return {functions, byName, calls};
}

const targetName = (target: FunctionTarget) =>
    target.getName?.() ?? target.sprite?.name ?? (target.isStage ? 'Stage' : target.id);

/**
 * Read the custom block definitions of a VM target. Only the shape of its blocks container is used.
 *
 * Given the `others` targets of the project, the reader also finds the global named functions defined in
 * them that this target's functions call, and those that call this target's global functions. They come
 * in `globals`, with the target that defines them, and link to this target's functions by their ids.
 */
export function readTargetFunctions(target: FunctionTarget,
    {extensions = namedFunctionExtensions, others = [], describeScript, getTargetThumbnail}: {
        extensions?: readonly string[]; others?: readonly FunctionTarget[];
        describeScript?(targetId: string, scriptId: string): string | undefined;
        getTargetThumbnail?(targetId: string): string | undefined;
    } = {}
): FunctionPaneData {
    const own = scanTarget(target, extensions);
    const elsewhere = others.filter(other => other !== target && other.id !== target.id)
        .map(other => ({target: other, ...scanTarget(other, extensions)}));
    // A name is unique among the global functions of a project, so each names one definition.
    const globalsByName = new Map<string, {target: FunctionTarget; fn: Reading}>();
    for (const other of elsewhere) {
        for (const fn of other.functions) {
            if (fn.kind === 'named' && fn.scope === 'global' && !globalsByName.has(fn.proccode)) {
                globalsByName.set(fn.proccode, {target: other.target, fn});
            }
        }
    }
    const globals = new Map<string, Reading & {owner: GlobalFunctionOwner}>();
    function globalNode(owner: FunctionTarget, fn: Reading) {
        const id = `${owner.id}:${fn.id}`;
        let node = globals.get(id);
        if (!node) {
            const thumbnailUrl = getTargetThumbnail?.(owner.id);
            node = {...fn, id, calls: 0, scriptCalls: 0, callees: [], uses: [],
                owner: {targetId: owner.id, name: targetName(owner), isStage: Boolean(owner.isStage), functionId: fn.id,
                    ...(thumbnailUrl ? {thumbnailUrl} : {})}};
            globals.set(id, node);
        }
        return node;
    }

    for (const call of own.calls) {
        // A call by a name this target does not define reaches the global function of that name elsewhere.
        const found = globalsByName.get(call.name);
        const callee = call.callee ?? (found && globalNode(found.target, found.fn));
        if (!callee) continue;
        callee.calls++;
        callee.uses.push({block: call.block, script: call.script});
        if (!call.caller) callee.scriptCalls++;
        else if (!call.caller.callees.includes(callee.id)) call.caller.callees.push(callee.id);
    }
    // Global functions elsewhere that call this target's global functions.
    const ownGlobals = new Map(own.functions.filter(fn => fn.kind === 'named' && fn.scope === 'global')
        .map(fn => [fn.proccode, fn]));
    for (const other of elsewhere) {
        for (const call of other.calls) {
            if (call.callee || !call.caller || call.caller.kind !== 'named' || call.caller.scope !== 'global') continue;
            const callee = ownGlobals.get(call.name);
            if (!callee) continue;
            const caller = globalNode(other.target, call.caller);
            if (!caller.callees.includes(callee.id)) caller.callees.push(callee.id);
        }
    }
    const data: FunctionPaneData = {targetId: target.id, isStage: Boolean(target.isStage), functions: own.functions};
    if (globals.size) data.globals = [...globals.values()];
    const messageGraph = readMessageCallGraph(target, others,
        new Map([[target.id, own.functions], ...elsewhere.map(other => [other.target.id, other.functions] as const)]),
        describeScript);
    if (messageGraph.scripts.length) data.messageGraph = messageGraph;
    return data;
}

/** Spell a function the way its block reads: `jump %s times` with `height` becomes `jump (height) times`. */
export function functionLabel({proccode, argumentNames}: Pick<SpriteFunction, 'proccode' | 'argumentNames'>) {
    let index = 0;
    return proccode.replace(/%([snb])/g, (_match, type: string) => {
        const name = argumentNames[index++] ?? '';
        return type === 'b' ? `<${name}>` : `(${name})`;
    }).replace(/\s+/g, ' ').trim();
}

// Use the same tolerance as the script layout view, so the orders match its Z and N layouts.
const alignmentTolerance = 24;

/**
 * Order functions by name, or by where their definitions sit: Z reads rows from left to right,
 * N reads columns from top to bottom.
 */
export function orderFunctions<T extends Pick<SpriteFunction, 'id' | 'proccode' | 'argumentNames' | 'x' | 'y'>>(
    functions: readonly T[], order: FunctionOrder, locale = 'en'): T[] {
    if (order === 'name') {
        const collator = new Intl.Collator(locale, {numeric: true, sensitivity: 'base'});
        return [...functions].sort((a, b) =>
            collator.compare(functionLabel(a), functionLabel(b)) || (a.id < b.id ? -1 : Number(a.id > b.id)));
    }
    const band = order === 'z' ? 'y' : 'x';
    const scan = order === 'z' ? 'x' : 'y';
    const compare = (a: T, b: T, first: 'x' | 'y', second: 'x' | 'y') =>
        a[first] - b[first] || a[second] - b[second] || (a.id < b.id ? -1 : Number(a.id > b.id));
    const bands: T[][] = [];
    for (const item of [...functions].sort((a, b) => compare(a, b, band, scan))) {
        const current = bands.at(-1);
        // Measure each band from its first script so small offsets cannot chain across rows or columns.
        if (current && item[band] - current[0][band] <= alignmentTolerance) current.push(item);
        else bands.push([item]);
    }
    return bands.flatMap(items => items.sort((a, b) => compare(a, b, scan, band)));
}

interface CallGraphScript extends Omit<SpriteFunction, 'kind'> {
    kind: 'script';
    script: MessageCallGraphScript;
}
type CallGraphItem = SpriteFunction | CallGraphScript;

export interface CallGraphNode {
    fn: CallGraphItem;
    layer: number;
    /** A function that calls no function and that no function calls, set apart below the others. */
    isolated?: boolean;
    /** This node was placed in the diagram by hand. */
    manual?: boolean;
    x: number;
    y: number;
}

export interface CallGraphEdge {
    from: string;
    to: string;
    /** `back` points to the same or an earlier layer, as recursion through other functions does. */
    kind: 'forward' | 'back' | 'self';
    relation?: 'call' | 'message';
    messageKey?: string;
    messageName?: string;
    wait?: boolean;
}

export interface CallGraphLayout {
    nodes: CallGraphNode[];
    edges: CallGraphEdge[];
    width: number;
    height: number;
    left?: number;
    top?: number;
}

interface RelationGraph {
    functions: readonly SpriteFunction[];
    scripts: Map<string, GraphScript>;
    relations: Map<string, ScriptRelation[]>;
}

/** Keep the package's message scanner and existing host data compatible with endpoint relations. */
function scannedRelations(data: FunctionPaneData, japanese: boolean): FunctionPaneData {
    if (data.scriptRelations || !data.messageGraph) return data;
    const {messageGraph} = data;
    const definitions = new Map([...data.functions, ...(data.globals ?? [])].map(fn => [fn.id, fn]));
    const endpointById = new Map<string, ScriptEndpoint>();
    const scripts: GraphScript[] = [];
    for (const fn of definitions.values()) endpointById.set(fn.id, {
        targetId: fn.owner?.targetId ?? data.targetId,
        scriptId: fn.owner?.functionId ?? fn.id, blockId: fn.owner?.functionId ?? fn.id
    });
    for (const script of messageGraph.scripts) {
        endpointById.set(script.id, {targetId: script.targetId, scriptId: script.scriptId, blockId: script.scriptId});
        if (script.definition && !definitions.has(script.id)) definitions.set(script.id, {...script.definition,
            id: script.id, ...(script.targetId === data.targetId ? {} : {owner: {
                targetId: script.targetId, name: script.targetName, isStage: script.isStage, functionId: script.scriptId
            }})});
        scripts.push({...script, label: script.label ?? (script.opcode === 'event_whenbroadcastreceived' ?
            japanese ? `${script.receivedMessage ?? ''} を受け取ったとき` : `when I receive ${script.receivedMessage ?? ''}` :
            script.opcode === 'event_whenflagclicked' ? japanese ? '緑の旗が押されたとき' : 'when green flag clicked' : script.opcode)});
    }
    const relations: ScriptRelation[] = [];
    function call(from: string, fn: SpriteFunction) {
        const source = endpointById.get(from);
        const destination = endpointById.get(fn.id);
        if (source && destination) relations.push({kind: 'function', source, destination, label: functionLabel(fn), wait: false});
    }
    const supplied = new Set(data.globals?.map(fn => fn.id));
    for (const fn of definitions.values()) {
        for (const id of fn.callees) if (definitions.has(id)) call(fn.id, definitions.get(id));
        for (const use of fn.uses ?? []) call(fn.owner && !supplied.has(fn.id) ?
            `${fn.owner.targetId}:${use.script}` : use.script, fn);
    }
    for (const edge of messageGraph.edges) {
        const source = endpointById.get(edge.from);
        const destination = endpointById.get(edge.to);
        if (source && destination) relations.push({kind: 'message', source, destination, label: edge.messageName, wait: edge.wait});
    }
    return {...data, functions: [...definitions.values()].filter(fn => !fn.owner),
        globals: [...definitions.values()].filter(fn => fn.owner), scripts, scriptRelations: relations};
}

/** Adapt script endpoints to the existing graph layout, keeping script navigation separate from functions. */
function relationGraph(data: FunctionPaneData, visibility: FunctionRelationVisibility, scanned = false): RelationGraph {
    const functions = [...data.functions, ...(data.globals ?? [])];
    const scripts = new Map<string, GraphScript>();
    const relations = new Map<string, ScriptRelation[]>();
    if (!data.scriptRelations) return {functions: visibility.function ? functions : [], scripts, relations};
    const key = (targetId: string, scriptId: string) => JSON.stringify([targetId, scriptId]);
    const definitions = new Map(functions.map(fn => [key(fn.owner?.targetId ?? data.targetId, fn.owner?.functionId ?? fn.id), fn]));
    const descriptions = new Map((data.scripts ?? []).map(script => [key(script.targetId, script.scriptId), script]));
    const nodes = new Map<string, SpriteFunction>();
    if (visibility.function) for (const fn of functions) nodes.set(fn.id, {...fn, callees: []});
    function node(endpoint: ScriptEndpoint) {
        const identity = key(endpoint.targetId, endpoint.scriptId);
        const fn = definitions.get(identity);
        if (fn) {
            if (!nodes.has(fn.id)) nodes.set(fn.id, {...fn, callees: []});
            return fn.id;
        }
        const id = `script:${identity}`;
        if (!nodes.has(id)) {
            const script = descriptions.get(identity) ?? {targetId: endpoint.targetId, scriptId: endpoint.scriptId,
                label: endpoint.scriptId};
            scripts.set(id, script);
            // Only the layout reads this adapter; the script map owns its label and navigation.
            nodes.set(id, {id, kind: 'procedure', proccode: script.label, argumentNames: [], warp: false,
                x: script.x ?? 0, y: script.y ?? 0, calls: 1, scriptCalls: 0, callees: []});
        }
        return id;
    }
    if (visibility.message && scanned) for (const script of data.scripts ?? []) {
        node({targetId: script.targetId, scriptId: script.scriptId, blockId: script.scriptId});
    }
    for (const relation of data.scriptRelations) {
        if (!visibility[relation.kind] || !scanned && relation.source.targetId !== data.targetId &&
            relation.destination?.targetId !== data.targetId) continue;
        const from = node(relation.source);
        if (!relation.destination) continue;
        const to = node(relation.destination);
        const caller = nodes.get(from);
        if (!caller.callees.includes(to)) caller.callees = [...caller.callees, to];
        const identity = `${from}>${to}`;
        const group = relations.get(identity);
        if (group) group.push(relation);
        else relations.set(identity, [relation]);
    }
    return {functions: [...nodes.values()], scripts, relations};
}

export const callGraphNodeSize = {width: 176, height: 44};
const graphPadding = 24;
// Wider than the bend of a back edge under the lowest row, so the isolated functions stand apart.
const isolatedGap = 72;
const isolatedMinColumns = 4;

/**
 * Lay out who calls whom: callers come before the functions they call, from left to right (LR)
 * or from top to bottom (TD). Calls that close a cycle are kept as back edges so every function
 * gets one place. Within a layer, functions follow their callers and then the chosen order.
 * Functions that call no function and that no function calls go in rows of their own below,
 * apart from the rest, whichever the direction.
 */
export function layoutCallGraph(all: readonly CallGraphItem[], direction: CallGraphDirection,
    order: FunctionOrder = 'name', locale = 'en', spacing: {layerGap?: number; siblingGap?: number} = {}): CallGraphLayout {
    const layerGap = spacing.layerGap ?? 64;
    const siblingGap = spacing.siblingGap ?? 18;
    const known = new Set(all.map(fn => fn.id));
    const linked = new Set(all.flatMap(fn => {
        const callees = fn.callees.filter(id => known.has(id));
        return callees.length ? [fn.id, ...callees] : [];
    }));
    const functions = all.filter(fn => linked.has(fn.id));
    const isolated = orderFunctions(all.filter(fn => !linked.has(fn.id)), order, locale);
    const ordered = orderFunctions(functions, order, locale);
    const rank = new Map(ordered.map((fn, index) => [fn.id, index]));
    const byId = new Map(functions.map(fn => [fn.id, fn]));
    const callees = (fn: CallGraphItem) => fn.callees.filter(id => byId.has(id))
        .sort((a, b) => rank.get(a) - rank.get(b));
    const called = new Set(functions.flatMap(fn => fn.callees.filter(id => id !== fn.id)));

    // Depth-first from the functions nothing else calls, then from whatever a cycle left unvisited.
    const state = new Map<string, 'open' | 'done'>();
    const finished: string[] = [];
    const back = new Set<string>();
    function visit(id: string) {
        state.set(id, 'open');
        for (const next of callees(byId.get(id))) {
            if (next === id) continue;
            if (state.get(next) === 'open') back.add(`${id}>${next}`);
            else if (!state.has(next)) visit(next);
        }
        state.set(id, 'done');
        finished.push(id);
    }
    for (const fn of ordered) if (!called.has(fn.id) && !state.has(fn.id)) visit(fn.id);
    for (const fn of ordered) if (!state.has(fn.id)) visit(fn.id);

    const layers = new Map<string, number>();
    for (const id of [...finished].reverse()) {
        if (!layers.has(id)) layers.set(id, 0);
        for (const next of callees(byId.get(id))) {
            if (next === id || back.has(`${id}>${next}`)) continue;
            layers.set(next, Math.max(layers.get(next) ?? 0, layers.get(id) + 1));
        }
    }

    const columns: CallGraphItem[][] = [];
    for (const fn of ordered) (columns[layers.get(fn.id)] ??= []).push(fn);
    const slot = new Map<string, number>();
    const callers = new Map<string, string[]>();
    for (const fn of functions) {
        for (const next of fn.callees) if (next !== fn.id) callers.set(next, [...callers.get(next) ?? [], fn.id]);
    }
    columns.forEach((column, layer) => {
        // Sit each function near the callers already placed, so edges cross less.
        const weight = (fn: CallGraphItem) => {
            const placed = (callers.get(fn.id) ?? []).filter(id => layers.get(id) < layer && slot.has(id));
            return placed.length ? placed.reduce((sum, id) => sum + slot.get(id), 0) / placed.length : Infinity;
        };
        column.sort((a, b) => {
            const difference = weight(a) - weight(b);
            return Number.isNaN(difference) || difference === 0 ? rank.get(a.id) - rank.get(b.id) : difference;
        });
        column.forEach((fn, index) => slot.set(fn.id, index));
    });

    const {width, height} = callGraphNodeSize;
    const across = direction === 'LR' ? height + siblingGap : width + siblingGap;
    const along = direction === 'LR' ? width + layerGap : height + layerGap;
    const nodes: CallGraphNode[] = ordered.map(fn => {
        const layer = layers.get(fn.id);
        const main = graphPadding + layer * along;
        const cross = graphPadding + slot.get(fn.id) * across;
        return {fn, layer, x: direction === 'LR' ? main : cross, y: direction === 'LR' ? cross : main};
    });
    const edges = functions.flatMap(fn => fn.callees.filter(id => byId.has(id)).map((to): CallGraphEdge => ({
        from: fn.id, to,
        kind: to === fn.id ? 'self' : back.has(`${fn.id}>${to}`) || layers.get(to) <= layers.get(fn.id) ? 'back' : 'forward'
    })));
    const longest = Math.max(0, ...columns.map(column => column?.length ?? 0));
    const depth = columns.length;
    const mainSize = graphPadding * 2 + Math.max(0, depth * along - layerGap);
    const crossSize = graphPadding * 2 + Math.max(0, longest * across - siblingGap);
    let graphWidth = direction === 'LR' ? mainSize : crossSize;
    let graphHeight = direction === 'LR' ? crossSize : mainSize;
    if (!isolated.length) return {nodes, edges, width: graphWidth, height: graphHeight};

    // As wide as the graph above, and at least a few functions to a row.
    const step = width + siblingGap;
    const perRow = Math.max(isolatedMinColumns, Math.floor((graphWidth - graphPadding * 2 + siblingGap) / step));
    const top = nodes.length ? graphHeight - graphPadding + isolatedGap : graphPadding;
    isolated.forEach((fn, index) => nodes.push({
        fn, layer: depth, isolated: true,
        x: graphPadding + (index % perRow) * step,
        y: top + Math.floor(index / perRow) * (height + siblingGap)
    }));
    const rows = Math.ceil(isolated.length / perRow);
    graphWidth = Math.max(nodes.length > isolated.length ? graphWidth : 0,
        graphPadding * 2 + Math.min(perRow, isolated.length) * step - siblingGap);
    graphHeight = top + rows * (height + siblingGap) - siblingGap + graphPadding;
    return {nodes, edges, width: graphWidth, height: graphHeight};
}

/** Order hat scripts as `orderFunctions` orders functions, by their labels or by where they sit. */
function orderHats(hats: readonly SpriteHatScript[], order: FunctionOrder, locale: string) {
    if (order === 'name') {
        const collator = new Intl.Collator(locale, {numeric: true, sensitivity: 'base'});
        return [...hats].sort((a, b) => collator.compare(a.label, b.label) || (a.id < b.id ? -1 : Number(a.id > b.id)));
    }
    const byId = new Map(hats.map(hat => [hat.id, hat]));
    return orderFunctions(hats.map(({id, x, y}) => ({id, proccode: '', argumentNames: [], x, y})), order, locale)
        .map(({id}) => byId.get(id)!);
}

let paneCount = 0;

const english = {
    panel: 'Functions',
    panels: {list: 'Hats and functions', graph: 'Calls'} as Record<FunctionPaneMode, string>,
    hats: 'Hats',
    functions: 'Functions',
    namedFunctions: 'TurboWarp Plus named functions',
    openScript: 'Open the script of %1',
    showUses: 'Where %1 is used',
    uses: 'Where %1 is used',
    useIn: 'In %1',
    looseScript: 'A script without a hat',
    noUses: 'No block calls this function.',
    view: 'View',
    modes: {list: 'List', graph: 'Call graph'} as Record<FunctionPaneMode, string>,
    flow: 'Flow',
    directions: {LR: 'Left to right (LR)', TD: 'Top to bottom (TD)'} as Record<CallGraphDirection, string>,
    order: 'Order',
    orders: {name: 'Name (A–Z)', z: 'Z order (rows)', n: 'N order (columns)'} as Record<FunctionOrder, string>,
    empty: 'This sprite has no functions. Make one with “Make a Block” in My Blocks.',
    emptyStage: 'The stage has no functions. Make one with “Make a Block” in My Blocks.',
    none: 'This sprite has no functions.',
    noneStage: 'The stage has no functions.',
    addFrom: {graph: 'Make one with “Add a new function” at the bottom left.',
        list: 'Make one with “Add a new function” below.'} as Record<FunctionPaneMode, string>,
    calls: (count: number) => count === 0 ? 'Not used' : count === 1 ? 'Used once' : `Used ${count} times`,
    fromScripts: 'Called from other scripts',
    named: 'Named function',
    global: 'All sprites',
    globalIn: 'A global function of %1',
    stage: 'Stage',
    warp: 'Runs without screen refresh',
    editor: 'Code of %1',
    readOnly: 'Click this view to edit.',
    graph: 'Script relationships',
    sendAndWait: 'Send and wait',
    sendMessage: 'Send',
    openCode: 'Open the code of %1',
    zoom: 'Zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomReset: 'Reset zoom',
    close: 'Close',
    add: 'Add a new function',
    addName: 'Function name',
    addKind: 'Kind',
    addKinds: {procedure: 'Standard (My Blocks)', named: 'TurboWarp-Plus named function'} as Record<FunctionKind, string>,
    addSubmit: 'Add',
    cancel: 'Cancel',
    createErrors: {
        duplicate: 'A function with this name already exists.',
        invalid: 'This name cannot be used.',
        unavailable: 'The TurboWarp-Named-Functions extension could not be loaded.',
        failed: 'The function could not be created.'
    } as Record<FunctionCreateError, string>
};

const japanese: typeof english = {
    panel: '関数',
    panels: {list: 'ハット・関数一覧', graph: '呼び出し関係'},
    hats: 'ハット',
    functions: '関数',
    namedFunctions: 'TurboWarp Plus 名前付き関数',
    openScript: '%1 のスクリプトを開く',
    showUses: '%1 を使っている箇所',
    uses: '%1 を使っている箇所',
    useIn: '%1 の中',
    looseScript: 'ハットのないスクリプト',
    noUses: 'この関数を呼んでいるブロックはありません。',
    view: '表示',
    modes: {list: '一覧', graph: '呼び出し図'},
    flow: '流れ',
    directions: {LR: '左から右 (LR)', TD: '上から下 (TD)'},
    order: '並べ方',
    orders: {name: '名前順', z: 'Z順（行ごと）', n: 'N順（列ごと）'},
    empty: 'このスプライトには関数がありません。「ブロック定義」の「ブロックを作る」で作れます。',
    emptyStage: 'ステージには関数がありません。「ブロック定義」の「ブロックを作る」で作れます。',
    none: 'このスプライトには関数がありません。',
    noneStage: 'ステージには関数がありません。',
    addFrom: {graph: '左下の「＋ 新しい関数を追加」から作れます。', list: '下の「＋ 新しい関数を追加」から作れます。'},
    calls: (count: number) => count === 0 ? '未使用' : `${count}か所で使用`,
    fromScripts: '関数以外のスクリプトから呼ばれる',
    named: '名前付き関数',
    global: 'すべてのスプライト',
    globalIn: '%1 のグローバル関数',
    stage: 'ステージ',
    warp: '画面を再描画せずに実行',
    editor: '%1 のコード',
    readOnly: 'このビューをクリックすると編集できます。',
    graph: '呼び出し関係',
    sendAndWait: '送って待つ',
    sendMessage: '送る',
    openCode: '%1 のコードを開く',
    zoom: '拡大・縮小',
    zoomOut: '縮小',
    zoomIn: '拡大',
    zoomReset: '元の大きさに戻す',
    close: '閉じる',
    add: '新しい関数を追加',
    addName: '関数名',
    addKind: '種類',
    addKinds: {procedure: '標準（ブロック定義）', named: 'TurboWarp-Plus の名前付き関数'},
    addSubmit: '追加',
    cancel: 'キャンセル',
    createErrors: {
        duplicate: '同じ名前の関数がすでにあります。',
        invalid: 'この名前は使えません。',
        unavailable: '拡張機能「TurboWarp-Named-Functions」を読み込めませんでした。',
        failed: '関数を作成できませんでした。'
    }
};
type Labels = typeof english;

function FunctionEditor({targetId, functionId, editable, label, mountEditor, large}: {
    targetId: string;
    functionId: string;
    editable: boolean;
    label: string;
    mountEditor: React.RefObject<MountFunctionEditor | undefined>;
    large?: boolean;
}) {
    const element = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        const dispose = mountEditor.current?.(element.current, targetId, functionId, {editable});
        return () => {
            if (typeof dispose === 'function') dispose();
        };
    }, [targetId, functionId, editable, mountEditor]);
    return <div ref={element} className={'tw-sprite-functions__editor' + (large ? ' tw-sprite-functions__editor--dialog' : '')}
        role="group" aria-label={label} data-function-editor={functionId} data-editable={editable || undefined} />;
}

/** Two mutually exclusive directions in the host's section rail, separate from the call graph. */
export function FunctionFlowToggle({locale, value, onChange}: {
    locale: string;
    value: CallGraphDirection;
    onChange(value: CallGraphDirection): void;
}) {
    const ja = /^ja(?:-|$)/i.test(locale);
    const labels = ja ? japanese : english;
    return <div className="tw-sprite-functions__flow-toggle" role="group" aria-label={labels.flow}>
        {(['LR', 'TD'] as const).map(direction => {
            const label = `${labels.flow}: ${labels.directions[direction]}`;
            return <button key={direction} type="button" data-direction={direction} aria-pressed={value === direction}
                title={label} aria-label={label} onClick={() => { if (direction !== value) onChange(direction); }}
                onKeyDown={event => { if (event.key !== 'Tab') event.stopPropagation(); }}>
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <g transform={direction === 'TD' ? 'rotate(90 10 10)' : undefined}>
                        <rect x="1" y="7" width="5" height="6" rx="1" />
                        <path d="M8 10h4m-2-2 2 2-2 2" />
                        <rect x="14" y="7" width="5" height="6" rx="1" />
                    </g>
                </svg>
            </button>;
        })}
    </div>;
}

/** The host places these two independent graph filters beside the direction switch in its rail. */
export function FunctionRelationToggles({locale, value, onChange}: {
    locale: string;
    value: FunctionRelationVisibility;
    onChange(value: FunctionRelationVisibility): void;
}) {
    const ja = /^ja(?:-|$)/i.test(locale);
    const labels = ja ? {function: '関数', message: 'メッセージ'} : {function: 'Functions', message: 'Messages'};
    const tooltip = (kind: 'function' | 'message') => ja ?
        `${kind === 'function' ? '関数の呼び出し関係' : 'メッセージの送受信関係'}を${value[kind] ? '隠す' : '表示'}` :
        `${value[kind] ? 'Hide' : 'Show'} ${kind === 'function' ? 'function calls' : 'message sends and receivers'}`;
    return <div className="tw-sprite-functions__relation-toggles" role="group"
        aria-label={ja ? '呼び出し関係の表示' : 'Visible relations'}>
        {(['function', 'message'] as const).map(kind => <button key={kind} type="button"
            data-relation-kind={kind} aria-label={labels[kind]} title={tooltip(kind)} aria-pressed={value[kind]}
            onClick={() => onChange({...value, [kind]: !value[kind]})}
            onKeyDown={event => { if (event.key !== 'Tab') event.stopPropagation(); }}>
            {kind === 'function' ? <FunctionIcon /> : <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M3 3.5h10v7H8L5 13v-2.5H3Z" />
            </svg>}
        </button>)}
    </div>;
}

/** Buttons for one of a few choices. With `icons`, each shows its icon and keeps its name for tooltips and readers. */
function Choice<T extends string>({label, value, options, icons, onChange}: {
    label: string;
    value: T;
    options: Record<T, string>;
    icons?: Record<T, string>;
    onChange(value: T): void;
}) {
    return <div className="tw-sprite-functions__choice" role="group" aria-label={label} data-icons={icons ? '' : undefined}>
        {(Object.keys(options) as T[]).map(id => <button key={id} type="button" aria-pressed={value === id}
            data-choice={id} title={icons ? options[id] : undefined} onClick={() => onChange(id)}>
            {icons ? <>
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"
                    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={icons[id]} /></svg>
                <span className="tw-sprite-functions__visually-hidden">{options[id]}</span>
            </> : options[id]}
        </button>)}
    </div>;
}

function Badges({labels, fn, calls = true, kind = true}: {labels: Labels; fn: SpriteFunction; calls?: boolean; kind?: boolean}) {
    return <>
        {kind && fn.kind === 'named' && <span className="tw-sprite-functions__badge" data-kind="named">{labels.named}</span>}
        {fn.kind === 'named' && fn.scope === 'global' &&
            <span className="tw-sprite-functions__badge" data-scope="global">{labels.global}</span>}
        {fn.warp && <span className="tw-sprite-functions__badge" title={labels.warp}>⚡
            <span className="tw-sprite-functions__visually-hidden">{labels.warp}</span></span>}
        {calls && <span className="tw-sprite-functions__badge" data-unused={fn.calls === 0 || undefined}>{labels.calls(fn.calls)}</span>}
    </>;
}

const functionGlyph = 'M10.5 2.5c-1.7 0-2.3 1-2.6 2.6L6.7 11c-.3 1.6-.9 2.5-2.6 2.5M5 6.5h4.5M12 7c.9 1.1.9 3.4 0 4.5M2.5 7c-.9 1.1-.9 3.4 0 4.5';

/** The f(x) mark at the start of a function in the list. */
function FunctionIcon() {
    return <svg className="tw-sprite-functions__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"
        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={functionGlyph} />
    </svg>;
}

/** A copy of the drawing the host made of a hat block. */
function HatThumbnail({drawing}: {drawing: SVGSVGElement}) {
    const element = React.useRef<HTMLSpanElement>(null);
    React.useLayoutEffect(() => {
        element.current.replaceChildren(drawing.cloneNode(true));
    }, [drawing]);
    return <span ref={element} className="tw-sprite-functions__thumbnail" aria-hidden="true" />;
}

/** The blocks that call a function, each named by the script it sits in. Picking one shows that block. */
function UsesDialog({labels, fn, describe, onPick, onClose}: {
    labels: Labels;
    fn: SpriteFunction;
    describe(script: string): string;
    onPick(use: FunctionUse): void;
    onClose(): void;
}) {
    const dialog = React.useRef<HTMLDialogElement>(null);
    const close = React.useRef(onClose);
    close.current = onClose;
    React.useLayoutEffect(() => {
        const element = dialog.current;
        if (typeof element.showModal === 'function') element.showModal();
        else element.setAttribute('open', '');
        const cancel = (event: Event) => {
            event.preventDefault();
            close.current();
        };
        element.addEventListener('cancel', cancel);
        return () => {
            element.removeEventListener('cancel', cancel);
            if (element.open && typeof element.close === 'function') element.close();
        };
    }, []);
    const title = labels.uses.replace('%1', () => functionLabel(fn));
    const uses = fn.uses ?? [];
    return <dialog ref={dialog} className="tw-sprite-functions__uses" aria-label={title} onClick={event => {
        if (event.target === event.currentTarget) onClose();
    }}>
        <header className="tw-sprite-functions__uses-header">
            <h2>{title}</h2>
            <button type="button" className="tw-sprite-functions__close" aria-label={labels.close} title={labels.close}
                onClick={onClose}>
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 4 8 8m0-8-8 8" /></svg>
            </button>
        </header>
        {uses.length ? <ul className="tw-sprite-functions__uses-list">
            {uses.map(use => <li key={use.block}>
                <button type="button" data-use-block={use.block} onClick={() => onPick(use)}>
                    {labels.useIn.replace('%1', () => describe(use.script))}
                </button>
            </li>)}
        </ul> : <p className="tw-sprite-functions__empty">{labels.noUses}</p>}
    </dialog>;
}

/** A full-viewport dialog, so editor popups placed in page coordinates stay inside its focus scope. */
function FunctionDialog({labels, fn, children, onClose}: {
    labels: Labels;
    fn: SpriteFunction;
    children: React.ReactNode;
    onClose(): void;
}) {
    const dialog = React.useRef<HTMLDialogElement>(null);
    const close = React.useRef(onClose);
    close.current = onClose;
    React.useLayoutEffect(() => {
        const element = dialog.current;
        if (typeof element.showModal === 'function') element.showModal();
        else element.setAttribute('open', '');
        const cancel = (event: Event) => {
            event.preventDefault();
            close.current();
        };
        element.addEventListener('cancel', cancel);
        return () => {
            element.removeEventListener('cancel', cancel);
            if (element.open && typeof element.close === 'function') element.close();
        };
    }, []);
    const title = functionLabel(fn);
    return <dialog ref={dialog} className="tw-sprite-functions__dialog" data-kind={fn.kind} aria-label={labels.editor.replace('%1', () => title)}
        onClick={event => {
            if (event.target === event.currentTarget) onClose();
        }}>
        <div className="tw-sprite-functions__dialog-body">
            <header className="tw-sprite-functions__dialog-header">
                <h2>{title}</h2>
                <Badges labels={labels} fn={fn} />
                <button type="button" className="tw-sprite-functions__close" aria-label={labels.close} title={labels.close}
                    onClick={onClose}>
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 4 8 8m0-8-8 8" /></svg>
                </button>
            </header>
            {children}
        </div>
    </dialog>;
}

function edgePath(from: CallGraphNode, to: CallGraphNode, kind: CallGraphEdge['kind'], direction: CallGraphDirection, lane = 0) {
    const {width, height} = callGraphNodeSize;
    if (kind === 'self') {
        const x = from.x + (lane < 0 ? 24 : width - 24);
        const y = from.y;
        // Stay within the graph padding above the first row.
        return `M${x} ${y} C${x} ${y - 20}, ${x + 32} ${y - 20}, ${x + 20} ${y}`;
    }
    if (from.manual || to.manual) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const horizontal = Math.abs(dx) >= width + 24 || Math.abs(dy) < height + 24 &&
            (direction === 'LR' || Math.abs(dx) / width >= Math.abs(dy) / height);
        if (horizontal) {
            const sign = dx >= 0 ? 1 : -1;
            const sx = from.x + (sign > 0 ? width : 0);
            const sy = from.y + height / 2 + lane;
            const tx = to.x + (sign > 0 ? 0 : width);
            const ty = to.y + height / 2 + lane;
            const bend = Math.max(24, Math.abs(tx - sx) / 2);
            return `M${sx} ${sy} C${sx + bend * sign} ${sy}, ${tx - bend * sign} ${ty}, ${tx} ${ty}`;
        }
        const sign = dy >= 0 ? 1 : -1;
        const sx = from.x + width / 2 + lane;
        const sy = from.y + (sign > 0 ? height : 0);
        const tx = to.x + width / 2 + lane;
        const ty = to.y + (sign > 0 ? 0 : height);
        const bend = Math.max(24, Math.abs(ty - sy) / 2);
        return `M${sx} ${sy} C${sx} ${sy + bend * sign}, ${tx} ${ty - bend * sign}, ${tx} ${ty}`;
    }
    if (direction === 'LR') {
        if (kind === 'back') {
            const sx = from.x + width / 2 + lane;
            const sy = from.y + height;
            const tx = to.x + width / 2 + lane;
            const ty = to.y + height;
            const bend = Math.max(sy, ty) + 36 + Math.abs(lane) + (lane < 0 ? 12 : 0);
            return `M${sx} ${sy} C${sx} ${bend}, ${tx} ${bend}, ${tx} ${ty}`;
        }
        const sx = from.x + width;
        const sy = from.y + height / 2 + lane;
        const tx = to.x;
        const ty = to.y + height / 2 + lane;
        const middle = (sx + tx) / 2;
        return `M${sx} ${sy} C${middle} ${sy}, ${middle} ${ty}, ${tx} ${ty}`;
    }
    if (kind === 'back') {
        const sx = from.x + width;
        const sy = from.y + height / 2 + lane;
        const tx = to.x + width;
        const ty = to.y + height / 2 + lane;
        const bend = Math.max(sx, tx) + 36 + Math.abs(lane) + (lane < 0 ? 12 : 0);
        return `M${sx} ${sy} C${bend} ${sy}, ${bend} ${ty}, ${tx} ${ty}`;
    }
    const sx = from.x + width / 2 + lane;
    const sy = from.y + height;
    const tx = to.x + width / 2 + lane;
    const ty = to.y;
    const middle = (sy + ty) / 2;
    return `M${sx} ${sy} C${sx} ${middle}, ${tx} ${middle}, ${tx} ${ty}`;
}

interface EdgeLabel {
    kind: ScriptRelation['kind'];
    owner: string[];
    rows: {name: string; lines: string[]; wait: boolean; ordinary: boolean}[];
    width: number;
    height: number;
}

const labelTextWidth = (value: string) => [...value].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 12 : 8), 0);
function labelLines(value: string) {
    const lines: string[] = [];
    let line = '';
    for (const char of value) {
        if (line && labelTextWidth(line + char) > 208) { lines.push(line); line = ''; }
        line += char;
    }
    return [...lines, line];
}

function graphEdgeLabels(relations: Map<string, ScriptRelation[]>, functions: readonly SpriteFunction[],
    scripts: Map<string, GraphScript>, targetId: string, stage: string) {
    const byId = new Map(functions.map(fn => [fn.id, fn]));
    const result = new Map<string, EdgeLabel[]>();
    for (const [key, values] of relations) {
        const kinds: EdgeLabel[] = [];
        for (const kind of ['function', 'message'] as const) {
            const matching = values.filter(value => value.kind === kind);
            if (!matching.length) continue;
            const names = new Map<string, {wait: boolean; ordinary: boolean}>();
            for (const value of matching) {
                const modes = names.get(value.label) ?? {wait: false, ordinary: false};
                if (kind === 'message' && value.wait) modes.wait = true;
                else modes.ordinary = true;
                names.set(value.label, modes);
            }
            const foreign = matching[0].destination.targetId !== targetId ? matching[0].destination :
                matching[0].source.targetId !== targetId ? matching[0].source : undefined;
            const own = foreign && (scripts.get(`script:${JSON.stringify([foreign.targetId, foreign.scriptId])}`) ??
                [...byId.values()].find(fn => fn.owner?.targetId === foreign.targetId && fn.owner.functionId === foreign.scriptId)?.owner);
            const ownerName = foreign && (own?.isStage ? stage :
                (own && ('targetName' in own ? own.targetName : 'name' in own ? own.name : undefined)) ?? foreign.targetId);
            const owner = kind === 'message' && ownerName ? labelLines(ownerName) : [];
            const rows = kind === 'function' && !foreign ? [] : [...names].map(([name, modes]) =>
                ({name, ...modes, lines: labelLines(`${kind === 'message' ? '💬 ' : ''}${name}`)}));
            const width = rows.length ? Math.max(56, ...owner.map(line => labelTextWidth(line) + 12),
                ...rows.flatMap(row => row.lines.map(line => labelTextWidth(line) + 12 + (row.wait ? 26 : 0))))
                : 0;
            const height = rows.length ? 12 + owner.length * 18 + rows.reduce((height, row) => height + row.lines.length * 24, 0) : 0;
            kinds.push({kind, owner, rows, width, height});
        }
        result.set(key, kinds);
    }
    return result;
}

function edgeLabelBox(edge: CallGraphEdge, from: CallGraphNode, to: CallGraphNode, label: EdgeLabel,
    direction: CallGraphDirection, index: number, count: number) {
    const side = count > 1 ? index === 0 ? -1 : 1 : direction === 'LR' ? -1 : 1;
    const lane = count > 1 ? index === 0 ? -16 : 16 : 0;
    const path = edgePath(from, to, edge.kind, direction, lane);
    const values = path.match(/-?(?:\d*\.?\d+)(?:e[+-]?\d+)?/gi).map(Number);
    const tx = values[6];
    const ty = values[7];
    if (edge.kind !== 'self' && (from.manual || to.manual)) {
        const bx = values[4];
        const by = values[5];
        return Math.abs(tx - bx) >= Math.abs(ty - by) ?
            {x: tx >= bx ? tx - 12 - label.width : tx + 12,
                y: ty + (side < 0 ? -12 - label.height : 12), width: label.width, height: label.height} :
            {x: tx + (side < 0 ? -12 - label.width : 12),
                y: ty >= by ? ty - 12 - label.height : ty + 12, width: label.width, height: label.height};
    }
    if (edge.kind === 'self') return {x: to.x + callGraphNodeSize.width + 24,
        y: to.y + index * (label.height + 12), width: label.width, height: label.height};
    if (edge.kind === 'back') return direction === 'LR' ?
        {x: tx + (side < 0 ? -12 - label.width : 12), y: ty + 12, width: label.width, height: label.height} :
        {x: tx + 12, y: ty + (side < 0 ? -12 - label.height : 12), width: label.width, height: label.height};
    return direction === 'LR' ?
        {x: tx - 12 - label.width, y: ty + (side < 0 ? -12 - label.height : 12), width: label.width, height: label.height} :
        {x: tx + (side < 0 ? -12 - label.width : 12), y: ty - 12 - label.height, width: label.width, height: label.height};
}

/** A moved node must not hide another edge's receiving label. Both drawing and bounds use this choice. */
function graphLabelBoxes(nodes: readonly CallGraphNode[], edges: readonly CallGraphEdge[], direction: CallGraphDirection,
    labels: Map<string, EdgeLabel[]>) {
    const byId = new Map(nodes.map(node => [node.fn.id, node]));
    const result = new Map<string, {x: number; y: number; width: number; height: number}>();
    const manual = nodes.some(node => node.manual);
    const overlap = (a: {x: number; y: number; width: number; height: number}, b: {x: number; y: number; width: number; height: number}) =>
        Math.max(0, Math.min(a.x + a.width, b.x + b.width + 6) - Math.max(a.x, b.x - 6)) *
        Math.max(0, Math.min(a.y + a.height, b.y + b.height + 6) - Math.max(a.y, b.y - 6));
    for (const edge of edges) {
        const key = `${edge.from}>${edge.to}`;
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        const variants = labels.get(key) ?? [];
        variants.forEach((label, index) => {
            if (!label.width) return;
            const preferred = edgeLabelBox(edge, from, to, label, direction, index, variants.length);
            let chosen = preferred;
            if (manual) {
                const lane = variants.length > 1 ? index === 0 ? -16 : 16 : 0;
                const coordinates = edgePath(from, to, edge.kind, direction, lane).match(/-?(?:\d*\.?\d+)(?:e[+-]?\d+)?/gi).map(Number);
                const tx = coordinates[6];
                const ty = coordinates[7];
                const left = to.x - label.width - 12;
                const right = to.x + callGraphNodeSize.width + 12;
                const above = to.y - label.height - 12;
                const below = to.y + callGraphNodeSize.height + 12;
                const candidates = [preferred,
                    {x: left, y: ty - label.height / 2}, {x: right, y: ty - label.height / 2},
                    {x: tx - label.width / 2, y: above}, {x: tx - label.width / 2, y: below},
                    {x: left, y: above}, {x: right, y: above}, {x: left, y: below}, {x: right, y: below}
                ].map(point => ({...point, width: label.width, height: label.height}));
                const samples = Array.from({length: 25}, (_, sample) => {
                    const t = sample / 24;
                    const u = 1 - t;
                    return {x: u ** 3 * coordinates[0] + 3 * u * u * t * coordinates[2] +
                        3 * u * t * t * coordinates[4] + t ** 3 * tx,
                    y: u ** 3 * coordinates[1] + 3 * u * u * t * coordinates[3] +
                        3 * u * t * t * coordinates[5] + t ** 3 * ty};
                });
                const score = (box: typeof preferred) => {
                    const blocked = nodes.reduce((sum, node) => sum + overlap(box, {...node, ...callGraphNodeSize}), 0);
                    const labels = [...result.values()].reduce((sum, other) => sum + overlap(box, other), 0);
                    const line = samples.filter(point => point.x >= box.x - 3 && point.x <= box.x + box.width + 3 &&
                        point.y >= box.y - 3 && point.y <= box.y + box.height + 3).length;
                    return blocked * 100000 + labels * 1000 + line * 500 +
                        Math.hypot(box.x + box.width / 2 - tx, box.y + box.height / 2 - ty);
                };
                let best = score(preferred);
                for (const candidate of candidates) {
                    const value = score(candidate);
                    if (value < best) { best = value; chosen = candidate; }
                }
            }
            result.set(`${key}:${label.kind}`, chosen);
        });
    }
    return result;
}

/** Reserve room for concrete edge labels in both the graph's fitting bounds and its node spacing. */
function labelledGraph(functions: readonly SpriteFunction[], direction: CallGraphDirection, labels: Map<string, EdgeLabel[]>) {
    const entries = [...labels.values()].flat().filter(label => label.width);
    if (!entries.length) return layoutCallGraph(functions, direction, 'name');
    const maxWidth = Math.max(...entries.map(label => label.width));
    const maxHeight = Math.max(...entries.map(label => label.height));
    const layout = layoutCallGraph(functions, direction, 'name', 'en', {
        layerGap: Math.max(64, (direction === 'LR' ? maxWidth : maxHeight) + 48),
        siblingGap: Math.max(18, 2 * (direction === 'LR' ? maxHeight : maxWidth) + 32)
    });
    const byId = new Map(layout.nodes.map(node => [node.fn.id, node]));
    const boxes = layout.edges.flatMap(edge => (labels.get(`${edge.from}>${edge.to}`) ?? []).flatMap((label, index, variants) =>
        label.width ? [edgeLabelBox(edge, byId.get(edge.from), byId.get(edge.to), label, direction, index, variants.length)] : []));
    const shiftX = Math.max(0, 24 - Math.min(24, ...boxes.map(box => box.x)));
    const shiftY = Math.max(0, 24 - Math.min(24, ...boxes.map(box => box.y)));
    return {...layout, nodes: layout.nodes.map(node => ({...node, x: node.x + shiftX, y: node.y + shiftY})),
        width: Math.max(layout.width, ...boxes.map(box => box.x + box.width + 24)) + shiftX,
        height: Math.max(layout.height, ...boxes.map(box => box.y + box.height + 24)) + shiftY};
}

// Keep the same sixteen-unit hourglass as the code area's relation badge.
const relationWaitGlyph = 'M1 1h14M1 15h14M2 1v3l12 8v3M14 1v3l-12 8v3M2 4h12M2 12h12';

/** A hand-placed node may cross the origin; include its paths and labels in navigation bounds. */
function positionedGraph(base: CallGraphLayout, positions: GraphNodePositions, direction: CallGraphDirection,
    labels: Map<string, EdgeLabel[]>): CallGraphLayout {
    const nodes = base.nodes.map(node => {
        const point = Object.hasOwn(positions, node.fn.id) && positions[node.fn.id];
        return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? {...node, ...point, manual: true} : node;
    });
    if (!nodes.some(node => node.manual)) return base;
    const byId = new Map(nodes.map(node => [node.fn.id, node]));
    const boxes = nodes.map(node => ({x: node.x, y: node.y, ...callGraphNodeSize}));
    boxes.push(...graphLabelBoxes(nodes, base.edges, direction, labels).values());
    for (const edge of base.edges) {
        const variants = labels.get(`${edge.from}>${edge.to}`) ?? [];
        const lanes = variants.length > 1 ? [-16, 16] : [0];
        for (const lane of lanes) {
            const coordinates = edgePath(byId.get(edge.from), byId.get(edge.to), edge.kind, direction, lane)
                .match(/-?(?:\d*\.?\d+)(?:e[+-]?\d+)?/gi).map(Number);
            const x = coordinates.filter((_, index) => index % 2 === 0);
            const y = coordinates.filter((_, index) => index % 2 === 1);
            boxes.push({x: Math.min(...x), y: Math.min(...y), width: Math.max(...x) - Math.min(...x), height: Math.max(...y) - Math.min(...y)});
        }
    }
    const left = Math.min(0, ...boxes.map(box => box.x - graphPadding));
    const top = Math.min(0, ...boxes.map(box => box.y - graphPadding));
    return {...base, nodes, left, top, width: Math.max(...boxes.map(box => box.x + box.width + graphPadding)) - left,
        height: Math.max(...boxes.map(box => box.y + box.height + graphPadding)) - top};
}

/** How an edge or a node relates to the function under the pointer. */
export interface CallGraphHighlight {
    /** `in` calls the function, `out` is called by it, `self` is its recursion. */
    edges: Map<string, 'in' | 'out' | 'self'>;
    /** `self` is the function; `caller` calls it, `callee` is called by it, `both` does both. */
    nodes: Map<string, 'self' | 'caller' | 'callee' | 'both'>;
}

/** The links into and out of one function, and the functions at their other ends. */
export function callGraphHighlight(edges: readonly CallGraphEdge[], id: string): CallGraphHighlight {
    const result: CallGraphHighlight = {edges: new Map(), nodes: new Map([[id, 'self']])};
    const meet = (other: string, role: 'caller' | 'callee') => {
        const current = result.nodes.get(other);
        if (current === 'self' || current === role) return;
        result.nodes.set(other, current ? 'both' : role);
    };
    for (const edge of edges) {
        const pair = `${edge.from}>${edge.to}`;
        const key = edge.relation === 'message' ? `${pair}:message:${JSON.stringify([edge.messageKey, edge.wait])}` : pair;
        if (edge.from === id && edge.to === id) result.edges.set(key, 'self');
        else if (edge.to === id) {
            result.edges.set(key, 'in');
            meet(edge.from, 'caller');
        } else if (edge.from === id) {
            result.edges.set(key, 'out');
            meet(edge.to, 'callee');
        }
    }
    return result;
}

/** Where the graph sits in its viewport: drawn at `scale`, its top left corner at (`x`, `y`). */
interface GraphView {
    scale: number;
    x: number;
    y: number;
    /** A node drag keeps its viewport until the next explicit pan, zoom or reset. */
    preserve?: boolean;
}
interface Size {
    width: number;
    height: number;
}

// The same steps and corner layout as the code area's zoom buttons and minimap.
const zoomStep = 1.2;
const minZoom = 0.3;
const maxZoom = 3;
const dragThreshold = 3;
const minimapMax = {width: 164 * 0.8, height: 104 * 0.8};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function startView(size: Size, layout: CallGraphLayout): GraphView {
    // Center a graph that fits, as the code area does; otherwise start from its first function.
    return {
        scale: 1,
        x: Math.max(0, (size.width - layout.width) / 2) - (layout.left ?? 0),
        y: Math.max(0, (size.height - layout.height) / 2) - (layout.top ?? 0)
    };
}

/** Keep part of the graph in view, so it cannot be dragged or scrolled away. */
function fitView(view: GraphView, size: Size, layout: CallGraphLayout): GraphView {
    const scale = clamp(view.scale, minZoom, maxZoom);
    const width = layout.width * scale;
    const height = layout.height * scale;
    const keepX = Math.min(width, size.width / 2);
    const keepY = Math.min(height, size.height / 2);
    return {
        scale,
        x: clamp(view.x, keepX - width - (layout.left ?? 0) * scale, size.width - keepX - (layout.left ?? 0) * scale),
        y: clamp(view.y, keepY - height - (layout.top ?? 0) * scale, size.height - keepY - (layout.top ?? 0) * scale)
    };
}

/** Everything the view can show at its scale, as the code area's minimap shows the scrollable area. */
function scrollArea(view: GraphView, size: Size, layout: CallGraphLayout) {
    const padX = (size.width - Math.min(layout.width * view.scale, size.width / 2)) / view.scale;
    const padY = (size.height - Math.min(layout.height * view.scale, size.height / 2)) / view.scale;
    return {x: (layout.left ?? 0) - padX, y: (layout.top ?? 0) - padY,
        width: layout.width + 2 * padX, height: layout.height + 2 * padY};
}

function zoomAround(view: GraphView, factor: number, x: number, y: number): GraphView {
    const scale = clamp(view.scale * factor, minZoom, maxZoom);
    const ratio = scale / view.scale;
    return {scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio};
}

/** Wheel distance in pixels, whatever unit the device reports. */
function wheelPixels(event: WheelEvent, page: number) {
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? page : 1;
    return {x: event.deltaX * unit, y: event.deltaY * unit};
}

function ZoomIcon({action}: {action: 'out' | 'in' | 'reset'}) {
    const path = action === 'out' ? 'M6 10h8' : action === 'in' ? 'M6 10h8M10 6v8' : 'M6 8h8M6 12h8';
    return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d={path} /></svg>;
}

function CallGraph({labels, idPrefix, functions, scripts, relations, targetId, settings, positions, onPositionsChange,
    selectedId, corner, notice, onOpen, onOpenScript, canOpenExternal}: {
    labels: Labels;
    idPrefix: string;
    functions: readonly SpriteFunction[];
    scripts: Map<string, GraphScript>;
    relations: Map<string, ScriptRelation[]>;
    targetId: string;
    settings: FunctionPaneSettings;
    positions: GraphNodePositions;
    onPositionsChange(positions: GraphNodePositions): void;
    selectedId?: string;
    /** Drawn in the bottom left corner, over the graph. */
    corner?: React.ReactNode;
    /** Shown over the middle of the graph, as when it has no functions. */
    notice?: React.ReactNode;
    onOpen(fn: SpriteFunction): void;
    canOpenExternal?: boolean;
    onOpenScript?(endpoint: ScriptEndpoint): void;
}) {
    // Functions in the same column or row follow their names.
    const edgeLabels = React.useMemo(() => graphEdgeLabels(relations, functions, scripts, targetId, labels === japanese ? '背景' : labels.stage),
        [relations, functions, scripts, targetId, labels.stage]);
    const automaticLayout = React.useMemo(() => labelledGraph(functions, settings.direction, edgeLabels),
        [functions, settings.direction, edgeLabels]);
    const [nodeDraft, setNodeDraft] = React.useState<{id: string; positions: GraphNodePositions; view: GraphView} | null>(null);
    const layout = React.useMemo(() => positionedGraph(automaticLayout, nodeDraft?.positions ?? positions, settings.direction, edgeLabels),
        [automaticLayout, positions, nodeDraft?.positions, settings.direction, edgeLabels]);
    const byId = new Map(layout.nodes.map(node => [node.fn.id, node]));
    // A global function of another sprite may call one here; the uses of one there are not counted here.
    const called = React.useMemo(() => new Set(layout.edges.filter(edge => edge.from !== edge.to).map(edge => edge.to)),
        [layout]);
    const unused = (fn: CallGraphItem) => !fn.owner && fn.calls === 0 && !called.has(fn.id);
    const marker = `${idPrefix}-arrow`;
    // Isolated functions keep their rows; the sort is stable.
    const reading = [...automaticLayout.nodes].sort((a, b) => a.layer - b.layer || (a.isolated ? 0 :
        settings.direction === 'LR' ? a.y - b.y : a.x - b.x)).map(node => byId.get(node.fn.id));

    const frame = React.useRef<HTMLElement>(null);
    const minimap = React.useRef<HTMLDivElement>(null);
    const [size, setSize] = React.useState<Size>({width: 0, height: 0});
    // `null` until the person moves the graph: the start view then follows the size of the pane.
    const [moved, setMoved] = React.useState<GraphView | null>(null);
    const [pointed, setPointed] = React.useState<string | null>(null);
    const [focused, setFocused] = React.useState<string | null>(null);
    const [panning, setPanning] = React.useState(false);
    const [mapDragging, setMapDragging] = React.useState(false);
    const view = nodeDraft?.view ?? (moved?.preserve ? moved : fitView(moved ?? startView(size, layout), size, layout));
    const current = React.useRef({view, size, layout});
    current.current = {view, size, layout};
    const suppressClick = React.useRef(false);
    const nodeGesture = React.useRef<{cancel(): void} | null>(null);
    const graphContext = React.useRef({targetId, direction: settings.direction});
    graphContext.current = {targetId, direction: settings.direction};
    const savePositions = React.useRef(onPositionsChange);
    savePositions.current = onPositionsChange;

    const move = React.useCallback((next: (view: GraphView, size: Size, layout: CallGraphLayout) => GraphView) => {
        const {view, size, layout} = current.current;
        const fitted = fitView(next(view, size, layout), size, layout);
        current.current = {...current.current, view: fitted};
        setMoved(fitted);
    }, []);

    React.useEffect(() => setMoved(null), [settings.direction]);
    React.useEffect(() => () => nodeGesture.current?.cancel(), [targetId, settings.direction]);

    React.useLayoutEffect(() => {
        const element = frame.current;
        const measure = () => setSize(size => size.width === element.clientWidth && size.height === element.clientHeight ?
            size : {width: element.clientWidth, height: element.clientHeight});
        measure();
        const view = element.ownerDocument.defaultView;
        if (typeof view.ResizeObserver !== 'function') {
            view.addEventListener('resize', measure);
            return () => view.removeEventListener('resize', measure);
        }
        const observer = new view.ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // Like the code area: the wheel scrolls, and with Ctrl (a trackpad pinch) or ⌘ it zooms at the pointer.
    React.useEffect(() => {
        const element = frame.current;
        const wheel = (event: WheelEvent) => {
            if ((event.target as Element).closest?.('.tw-sprite-functions__zoom, .tw-sprite-functions__corner')) return;
            event.preventDefault();
            const delta = wheelPixels(event, element.clientHeight);
            if (event.ctrlKey || event.metaKey) {
                const rect = element.getBoundingClientRect();
                const factor = Math.pow(zoomStep, -clamp(delta.y, -100, 100) / 100);
                move(view => zoomAround(view, factor, event.clientX - rect.left - element.clientLeft,
                    event.clientY - rect.top - element.clientTop));
                return;
            }
            const sideways = event.shiftKey && !delta.x;
            move(view => ({...view, x: view.x - (sideways ? delta.y : delta.x), y: view.y - (sideways ? 0 : delta.y)}));
        };
        element.addEventListener('wheel', wheel, {passive: false});
        return () => element.removeEventListener('wheel', wheel);
    }, [move]);

    function startNodeDrag(event: React.PointerEvent, node: CallGraphNode) {
        if (event.button !== 0) return;
        event.stopPropagation();
        // Focusing the button would reveal it and change the drag's coordinate system before movement.
        event.preventDefault();
        nodeGesture.current?.cancel();
        const window = frame.current.ownerDocument.defaultView;
        const button = event.currentTarget;
        const pointerId = event.pointerId;
        const start = {x: event.clientX, y: event.clientY, node: {x: node.x, y: node.y},
            view: current.current.view, positions, context: graphContext.current};
        let dragging = false;
        let next = positions;
        const matches = (pointer: PointerEvent) => pointerId === undefined || pointer.pointerId === undefined || pointer.pointerId === pointerId;
        const sameGraph = () => graphContext.current.targetId === start.context.targetId &&
            graphContext.current.direction === start.context.direction;
        const clean = () => {
            window.removeEventListener('pointermove', pointerMove);
            window.removeEventListener('pointerup', pointerUp);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('blur', cancel);
            button.removeEventListener('lostpointercapture', cancel);
            if (typeof pointerId === 'number' && button.hasPointerCapture?.(pointerId)) button.releasePointerCapture(pointerId);
            nodeGesture.current = null;
        };
        const preventDragClick = () => {
            if (!dragging) return;
            suppressClick.current = true;
            window.setTimeout(() => {suppressClick.current = false;});
        };
        const cancel = (pointer?: Event) => {
            if (pointer?.type === 'pointercancel' && !matches(pointer as PointerEvent)) return;
            clean();
            preventDragClick();
            setNodeDraft(null);
        };
        const pointerMove = (pointer: PointerEvent) => {
            if (!matches(pointer)) return;
            if (!sameGraph()) { cancel(); return; }
            const dx = pointer.clientX - start.x;
            const dy = pointer.clientY - start.y;
            if (!dragging && Math.hypot(dx, dy) < dragThreshold) return;
            if (!dragging && typeof pointerId === 'number') button.setPointerCapture?.(pointerId);
            dragging = true;
            pointer.preventDefault();
            next = {...start.positions, [node.fn.id]: {x: start.node.x + dx / start.view.scale,
                y: start.node.y + dy / start.view.scale}};
            setNodeDraft({id: node.fn.id, positions: next, view: start.view});
        };
        const pointerUp = (pointer: PointerEvent) => {
            if (!matches(pointer)) return;
            clean();
            if (dragging && sameGraph()) {
                preventDragClick();
                // Expanding navigation bounds must not recenter the graph under the released pointer.
                setMoved({...start.view, preserve: true});
                savePositions.current(next);
            }
            setNodeDraft(null);
        };
        nodeGesture.current = {cancel};
        window.addEventListener('pointermove', pointerMove, {passive: false});
        window.addEventListener('pointerup', pointerUp);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('blur', cancel);
        button.addEventListener('lostpointercapture', cancel);
    }

    function startPan(event: React.PointerEvent) {
        if (event.button !== 0 || (event.target as Element)
            .closest('.tw-sprite-functions__node, .tw-sprite-functions__zoom, .tw-sprite-functions__minimap, .tw-sprite-functions__corner')) return;
        const window = frame.current.ownerDocument.defaultView;
        const start = {x: event.clientX, y: event.clientY, view: current.current.view};
        let dragging = false;
        const pointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - start.x;
            const dy = moveEvent.clientY - start.y;
            if (!dragging && Math.hypot(dx, dy) < dragThreshold) return;
            if (!dragging) {
                dragging = true;
                setPanning(true);
            }
            move(() => ({...start.view, x: start.view.x + dx, y: start.view.y + dy}));
        };
        const end = () => {
            window.removeEventListener('pointermove', pointerMove);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (!dragging) return;
            setPanning(false);
            // A drag that started on a function must not open it.
            suppressClick.current = true;
            window.setTimeout(() => suppressClick.current = false);
        };
        window.addEventListener('pointermove', pointerMove);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    }

    /** The graph point under the pointer on the minimap. */
    function minimapPoint(event: {clientX: number; clientY: number}) {
        const rect = minimap.current.getBoundingClientRect();
        const area = scrollArea(current.current.view, current.current.size, current.current.layout);
        const scale = Math.min(rect.width / area.width, rect.height / area.height) || 1;
        return {
            x: area.x + (event.clientX - rect.left - (rect.width - area.width * scale) / 2) / scale,
            y: area.y + (event.clientY - rect.top - (rect.height - area.height * scale) / 2) / scale
        };
    }

    function startMinimapDrag(event: React.PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        const window = frame.current.ownerDocument.defaultView;
        const {view, size} = current.current;
        const point = minimapPoint(event);
        const left = -view.x / view.scale;
        const top = -view.y / view.scale;
        const width = size.width / view.scale;
        const height = size.height / view.scale;
        // Grab the viewport where it was pressed; elsewhere, bring that point to the middle first.
        const inside = point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height;
        const grab = inside ? {x: point.x - left, y: point.y - top} : {x: width / 2, y: height / 2};
        const follow = (moveEvent: {clientX: number; clientY: number}) => {
            const at = minimapPoint(moveEvent);
            move(view => ({...view, x: -(at.x - grab.x) * view.scale, y: -(at.y - grab.y) * view.scale}));
        };
        follow(event);
        setMapDragging(true);
        const end = () => {
            window.removeEventListener('pointermove', follow);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            setMapDragging(false);
        };
        window.addEventListener('pointermove', follow);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    }

    function zoomButton(factor: number | null) {
        move((view, size, layout) => factor === null ? startView(size, layout) :
            zoomAround(view, factor, size.width / 2, size.height / 2));
    }

    /** Bring a function reached with the keyboard into view. */
    function reveal(node: CallGraphNode) {
        const element = frame.current;
        element.scrollLeft = 0;
        element.scrollTop = 0;
        move((view, size) => {
            const margin = 12;
            const left = view.x + node.x * view.scale;
            const top = view.y + node.y * view.scale;
            const right = left + callGraphNodeSize.width * view.scale;
            const bottom = top + callGraphNodeSize.height * view.scale;
            const dx = left < margin ? margin - left : right > size.width - margin ? size.width - margin - right : 0;
            const dy = top < margin ? margin - top : bottom > size.height - margin ? size.height - margin - bottom : 0;
            return dx || dy ? {...view, x: view.x + dx, y: view.y + dy} : view;
        });
    }

    // Bring the function shown beside the pane, such as one just added, into view.
    const selectedNode = selectedId ? byId.get(selectedId) : undefined;
    React.useEffect(() => {
        if (selectedNode && size.width && !nodeDraft && !nodeGesture.current) reveal(selectedNode);
    }, [selectedNode?.fn.id, selectedNode?.x, selectedNode?.y, size.width > 0]);

    const highlightId = nodeDraft?.id ?? pointed ?? focused;
    const visibleKind = (kind: 'function' | 'message') => settings.relationVisibility ||
        (kind === 'function' ? settings.showCalls !== false : settings.showMessages !== false);
    const visibleEdges = layout.edges.filter(edge => (edgeLabels.get(`${edge.from}>${edge.to}`) ?? [{kind: 'function' as const}])
        .some(label => visibleKind(label.kind)));
    const highlight = highlightId && byId.has(highlightId) ? callGraphHighlight(visibleEdges, highlightId) : null;
    // Draw the highlighted links over the others.
    const edges = highlight ? [...visibleEdges].sort((a, b) =>
        Number(highlight.edges.has(`${a.from}>${a.to}`)) - Number(highlight.edges.has(`${b.from}>${b.to}`))) : visibleEdges;
    const edgeMarker = (kind?: string, relation = 'function') =>
        `url(#${marker}${relation === 'message' ? '-message' : ''}${kind === 'in' ? '-in' : kind ? '-out' : ''})`;
    const paths = (withMarkers: boolean) => edges.flatMap(edge => {
        const key = `${edge.from}>${edge.to}`;
        const kind = highlight?.edges.get(key);
        const variants = edgeLabels.get(key) ?? [{kind: 'function' as const, owner: [], rows: [], width: 0, height: 0}];
        return variants.flatMap((label, index) => {
            if (!visibleKind(label.kind)) return [];
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            const lane = variants.length > 1 ? index === 0 ? -16 : 16 : 0;
            const matching = (relations.get(key) ?? []).filter(relation => relation.kind === label.kind);
            return <path key={`${key}:${label.kind}`} data-edge={withMarkers ? key : undefined}
                data-kind={edge.kind} data-highlight={kind} data-script-relation={label.kind} data-count={matching.length || 1}
                data-wait={label.rows.some(row => row.wait) || undefined}
                markerEnd={withMarkers ? edgeMarker(kind, label.kind) : undefined}
                d={edgePath(from, to, edge.kind, settings.direction, lane)}>
                {matching.length > 0 && <title>{[...new Set(matching.map(relation => relation.label))].join(', ')}</title>}
            </path>;
        });
    });
    const labelBoxes = graphLabelBoxes(layout.nodes, layout.edges, settings.direction, edgeLabels);
    const concreteLabels = layout.edges.flatMap(edge => {
        const key = `${edge.from}>${edge.to}`;
        return (edgeLabels.get(key) ?? []).flatMap((label, index, variants) => {
            if (!label.width || !visibleKind(label.kind)) return [];
            const box = labelBoxes.get(`${key}:${label.kind}`);
            let offset = 6 + label.owner.length * 18;
            return [<g key={`${key}:${label.kind}`} className="tw-sprite-functions__edge-label"
                data-edge={key} data-script-relation={label.kind} data-highlight={highlight?.edges.get(key)}
                transform={`translate(${box.x} ${box.y})`}>
                <rect width={box.width} height={box.height} rx="4" />
                {label.owner.map((line, ownerIndex) => <text key={`owner:${ownerIndex}`}
                    className="tw-sprite-functions__edge-label-owner" x="6" y={18 + ownerIndex * 18}>{line}</text>)}
                {label.rows.map(row => {
                    const rowY = offset;
                    offset += row.lines.length * 24;
                    return <g key={row.name} className="tw-sprite-functions__edge-label-row" data-message-name={label.kind === 'message' ? row.name : undefined}
                        transform={`translate(0 ${rowY})`}>
                        <title>{row.name}{row.wait ? ` · ${row.ordinary ? `${labels.sendMessage} / ` : ''}${labels.sendAndWait}` : ''}</title>
                        {row.lines.map((line, lineIndex) => <text key={lineIndex} x="6" y={16 + lineIndex * 24}>{line}</text>)}
                        {row.wait && <g className="tw-sprite-functions__relation-wait" aria-label={labels.sendAndWait}
                            transform={`translate(${box.width - 14} 12) scale(${1 / Math.max(1, view.scale)})`}>
                            <title>{labels.sendAndWait}</title>
                            <rect x="-10" y="-10" width="20" height="20" rx="4" />
                            <path className="tw-sprite-functions__relation-wait-glyph" d={relationWaitGlyph} transform="translate(-8 -8)" />
                        </g>}
                    </g>;
                })}
            </g>];
        });
    });
    const area = scrollArea(view, size, layout);
    const mapSize = {
        width: Math.min(minimapMax.width, size.width * 0.4 * 0.8),
        height: Math.min(minimapMax.height, size.height * 0.35 * 0.8)
    };

    return <figure ref={frame} className="tw-sprite-functions__graph" data-direction={settings.direction}
        data-highlighting={highlight ? '' : undefined} data-panning={panning ? '' : undefined}
        data-node-dragging={nodeDraft?.id}
        onPointerDown={startPan}
        onScroll={event => {
            // Focus may scroll the clipped frame; the view moves by its transform instead.
            event.currentTarget.scrollLeft = 0;
            event.currentTarget.scrollTop = 0;
        }}
        onClickCapture={event => {
            if (!suppressClick.current || event.detail === 0) return;
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
        }}>
        <figcaption className="tw-sprite-functions__visually-hidden">{labels.graph}</figcaption>
        <div className="tw-sprite-functions__canvas" style={{width: layout.width, height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}>
            <svg className="tw-sprite-functions__edges" width={layout.width} height={layout.height} aria-hidden="true"
                focusable="false">
                <defs>
                    {['', '-message'].flatMap(relation => ['', '-in', '-out'].map(suffix => <marker key={relation + suffix}
                        id={marker + relation + suffix} viewBox="0 0 10 10" refX="9"
                        refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"
                        data-script-relation={relation ? 'message' : 'function'}
                        data-highlight={suffix.slice(1) || undefined}><path d="M0 0 10 5 0 10Z" /></marker>))}
                </defs>
                {paths(true)}
                {concreteLabels}
            </svg>
            <ul className="tw-sprite-functions__nodes">
                {reading.map(node => {
                    const {fn, x, y} = node;
                    const script = scripts.get(fn.id);
                    const label = script?.label ?? functionLabel(fn);
                    const owner = script?.targetName ?? (fn.owner && (fn.owner.isStage ? labels === japanese ? '背景' : labels.stage : fn.owner.name));
                    const foreignFunction = !script && Boolean(fn.owner);
                    const visibleLabel = foreignFunction ? owner : label;
                    return <li key={fn.id} style={{left: x, top: y, width: callGraphNodeSize.width, height: callGraphNodeSize.height}}
                        data-isolated={node.isolated || undefined}>
                        <button type="button" className="tw-sprite-functions__node" data-function-key={script ? undefined : fn.id}
                            data-dragging={nodeDraft?.id === fn.id || undefined} onPointerDown={event => startNodeDrag(event, node)}
                            data-script-key={script ? fn.id : undefined} data-kind={script ? 'script' : fn.kind}
                            data-scope={fn.scope === 'global' ? 'global' : undefined}
                            data-owner={script?.targetId ?? (fn.owner ? fn.owner.targetId : undefined)} aria-current={selectedId === fn.id || undefined}
                            data-unused={unused(fn) || undefined} data-entry={fn.scriptCalls > 0 || undefined}
                            data-highlight={highlight?.nodes.get(fn.id)}
                            title={script ? [labels.openScript.replace('%1', () => label), owner].filter(Boolean).join('\n') :
                                [owner ? labels.globalIn.replace('%1', () => owner) : labels.openCode.replace('%1', () => label),
                                fn.kind === 'named' && labels.named, fn.scope === 'global' && labels.global,
                                owner && label, fn.description].filter(Boolean).join('\n')}
                            aria-label={foreignFunction ? `${owner} · ${label}` : undefined}
                            // A function of another sprite opens with that sprite, not here.
                            aria-disabled={script ? !onOpenScript || undefined : owner && !canOpenExternal || undefined}
                            onClick={() => script ? onOpenScript?.({targetId: script.targetId, scriptId: script.scriptId,
                                blockId: script.scriptId}) : (!owner || canOpenExternal) && onOpen(fn as SpriteFunction)}
                            onPointerEnter={() => setPointed(fn.id)}
                            onPointerLeave={() => setPointed(id => id === fn.id ? null : id)}
                            onFocus={() => {
                                setFocused(fn.id);
                                if (!nodeGesture.current) reveal(node);
                            }}
                            onBlur={() => setFocused(id => id === fn.id ? null : id)}>
                            {foreignFunction && fn.owner.thumbnailUrl && <img className="tw-sprite-functions__target-thumbnail"
                                src={fn.owner.thumbnailUrl} alt="" draggable={false} />}
                            <span className="tw-sprite-functions__name">{visibleLabel}</span>
                            {owner && !foreignFunction && <span className="tw-sprite-functions__owner">{owner}</span>}
                            {fn.scriptCalls > 0 && <span className="tw-sprite-functions__entry" title={labels.fromScripts}>▶
                                <span className="tw-sprite-functions__visually-hidden">{labels.fromScripts}</span></span>}
                        </button>
                    </li>;
                })}
            </ul>
        </div>
        <div ref={minimap} className="tw-sprite-functions__minimap" aria-hidden="true"
            data-dragging={mapDragging ? '' : undefined} style={{width: mapSize.width, height: mapSize.height}}
            onPointerDown={startMinimapDrag}>
            <svg viewBox={`${area.x} ${area.y} ${area.width} ${area.height}`} preserveAspectRatio="xMidYMid meet" focusable="false">
                <g className="tw-sprite-functions__minimap-edges">{paths(false)}</g>
                {layout.nodes.map(({fn, x, y}) => <rect key={fn.id} data-node-key={fn.id} x={x} y={y} rx={8} width={callGraphNodeSize.width}
                    height={callGraphNodeSize.height} data-highlight={highlight?.nodes.get(fn.id)} />)}
                <rect className="tw-sprite-functions__minimap-view" x={-view.x / view.scale} y={-view.y / view.scale}
                    width={size.width / view.scale} height={size.height / view.scale} />
            </svg>
        </div>
        <div className="tw-sprite-functions__zoom" role="group" aria-label={labels.zoom}>
            <button type="button" data-zoom="out" aria-label={labels.zoomOut} title={labels.zoomOut}
                disabled={view.scale <= minZoom} onClick={() => zoomButton(1 / zoomStep)}><ZoomIcon action="out" /></button>
            <button type="button" data-zoom="in" aria-label={labels.zoomIn} title={labels.zoomIn}
                disabled={view.scale >= maxZoom} onClick={() => zoomButton(zoomStep)}><ZoomIcon action="in" /></button>
            <button type="button" data-zoom="reset" aria-label={labels.zoomReset} title={labels.zoomReset}
                onClick={() => zoomButton(null)}><ZoomIcon action="reset" /></button>
        </div>
        {corner && <div className="tw-sprite-functions__corner">{corner}</div>}
        {notice && <div className="tw-sprite-functions__notice" role="status">{notice}</div>}
    </figure>;
}

function PlusIcon() {
    return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3v10M3 8h10" /></svg>;
}

function AddButton({labels, editable, onClick}: {labels: Labels; editable: boolean; onClick(): void}) {
    return <button type="button" className="tw-sprite-functions__add" disabled={!editable} onClick={onClick}>
        <PlusIcon />
        <span>{labels.add}</span>
    </button>;
}

/** Ask for the name and the kind of a new function, and make it. */
function AddDialog({labels, kind: initialKind, onKind, onCreate, onClose}: {
    labels: Labels;
    kind: FunctionKind;
    onKind(kind: FunctionKind): void;
    onCreate(kind: FunctionKind, name: string): Promise<string | void> | string | void;
    onClose(): void;
}) {
    const dialog = React.useRef<HTMLDialogElement>(null);
    const input = React.useRef<HTMLInputElement>(null);
    const [name, setName] = React.useState('');
    const [kind, setKind] = React.useState(initialKind);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<FunctionCreateError>();
    const [idPrefix] = React.useState(() => `tw-sprite-functions-add-${++paneCount}`);
    const mounted = React.useRef(true);
    const close = React.useRef(onClose);
    close.current = onClose;
    React.useLayoutEffect(() => {
        mounted.current = true;
        const element = dialog.current;
        if (typeof element.showModal === 'function') element.showModal();
        else element.setAttribute('open', '');
        input.current?.focus();
        const cancel = (event: Event) => {
            event.preventDefault();
            close.current();
        };
        element.addEventListener('cancel', cancel);
        return () => {
            mounted.current = false;
            element.removeEventListener('cancel', cancel);
            if (element.open && typeof element.close === 'function') element.close();
        };
    }, []);
    const trimmed = name.trim();

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(undefined);
        try {
            await onCreate(kind, trimmed);
            if (mounted.current) close.current();
        } catch (reason) {
            const code = (reason as {code?: unknown})?.code as FunctionCreateError;
            if (mounted.current) setError(createErrors.includes(code) ? code : 'failed');
        } finally {
            if (mounted.current) setBusy(false);
        }
    }

    return <dialog ref={dialog} className="tw-sprite-functions__uses tw-sprite-functions__add-dialog"
        aria-labelledby={`${idPrefix}-title`} onClick={event => {
            if (event.target === event.currentTarget && !busy) onClose();
        }}>
        <form onSubmit={submit}>
            <header className="tw-sprite-functions__uses-header">
                <h2 id={`${idPrefix}-title`}>{labels.add}</h2>
                <button type="button" className="tw-sprite-functions__close" aria-label={labels.close} title={labels.close}
                    onClick={onClose}>
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 4 8 8m0-8-8 8" /></svg>
                </button>
            </header>
            <div className="tw-sprite-functions__add-body">
                <label className="tw-sprite-functions__add-name">
                    <span>{labels.addName}</span>
                    <input ref={input} type="text" value={name} disabled={busy} autoComplete="off" spellCheck={false}
                        aria-invalid={error === 'duplicate' || error === 'invalid' || undefined}
                        onChange={event => {
                            setName(event.currentTarget.value);
                            setError(undefined);
                        }} />
                </label>
                <fieldset className="tw-sprite-functions__add-kind" disabled={busy}>
                    <legend>{labels.addKind}</legend>
                    {(Object.keys(labels.addKinds) as FunctionKind[]).map(id => <label key={id}>
                        <input type="radio" name={`${idPrefix}-kind`} value={id} checked={kind === id} onChange={() => {
                            setKind(id);
                            setError(undefined);
                            onKind(id);
                        }} />
                        <span>{labels.addKinds[id]}</span>
                    </label>)}
                </fieldset>
                {error && <p className="tw-sprite-functions__create-error" role="alert">{labels.createErrors[error]}</p>}
            </div>
            <footer className="tw-sprite-functions__add-actions">
                <button type="button" onClick={onClose}>{labels.cancel}</button>
                <button type="submit" className="tw-sprite-functions__add-submit" disabled={!trimmed || busy}
                    aria-busy={busy || undefined}>{labels.addSubmit}</button>
            </footer>
        </form>
    </dialog>;
}

export function SpriteFunctionPane({locale, editable, data, defaultSettings: initial, onSettingsChange, mountEditor,
    onCreate, onOpenFunction, onOpenScript, onOpenRelationScript, view, selectedId, direction, relationVisibility}:
    SpriteFunctionPaneProps) {
    const labels = /^ja(?:-|$)/i.test(locale) ? japanese : english;
    const [storedSettings, setSettings] = React.useState<FunctionPaneSettings>(() => ({...defaultSettings, ...initial}));
    const settings = {...storedSettings, ...(direction ? {direction} : {}),
        ...(relationVisibility ? {relationVisibility} : {})};
    const visibility = settings.relationVisibility ?? allRelationKinds;
    const [dialogId, setDialogId] = React.useState<string | null>(null);
    const [usesId, setUsesId] = React.useState<string | null>(null);
    const [adding, setAdding] = React.useState(false);
    // A function just added, picked out in the graph until the host shows what is selected.
    const [added, setAdded] = React.useState<string>();
    const usesFunction = usesId ? data.functions.find(fn => fn.id === usesId) : undefined;
    const list = React.useRef<HTMLElement>(null);
    // Keep the item shown beside the pane in view, as when a tab there was picked.
    React.useEffect(() => {
        list.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({block: 'nearest'});
    }, [selectedId]);
    const mount = React.useRef(mountEditor);
    mount.current = mountEditor;
    const mode = view ?? settings.mode;
    const ordered = React.useMemo(() => orderFunctions(data.functions, settings.order, locale),
        [data.functions, settings.order, locale]);
    const hats = React.useMemo(() => mode === 'list' ? orderHats(data.hats ?? [], settings.order, locale) : [],
        [mode, data.hats, settings.order, locale]);
    const [idPrefix] = React.useState(() => `tw-sprite-functions-${++paneCount}`);
    const dialogFunction = dialogId ? data.functions.find(fn => fn.id === dialogId) : undefined;
    const openFunction = React.useRef(onOpenFunction);
    openFunction.current = onOpenFunction;
    React.useEffect(() => {
        if (!dialogFunction || !openFunction.current) return;
        setDialogId(null);
        openFunction.current(dialogFunction);
    }, [dialogFunction]);

    /** Why the pane is empty, and where to make a function: the add button when there is one. */
    function emptyText(where: FunctionPaneMode): React.ReactNode {
        if (!onCreate) return data.isStage ? labels.emptyStage : labels.empty;
        const none = data.isStage ? labels.noneStage : labels.none;
        if (where === 'graph') return <>
            <strong className="tw-sprite-functions__notice-title">{none}</strong>
            <span>{labels.addFrom.graph}</span>
        </>;
        return `${none}${labels === english ? ' ' : ''}${labels.addFrom.list}`;
    }

    const addButton = onCreate ? <AddButton labels={labels} editable={editable} onClick={() => setAdding(true)} /> : null;

    function change(patch: Partial<FunctionPaneSettings>) {
        const next = {...settings, ...patch};
        setSettings(next);
        onSettingsChange?.(next);
    }

    function describe(script: string) {
        const fn = data.functions.find(item => item.id === script);
        if (fn) return functionLabel(fn);
        return data.hats?.find(hat => hat.id === script)?.label ?? labels.looseScript;
    }

    function openUse({block, script}: FunctionUse) {
        setUsesId(null);
        const fn = data.functions.find(item => item.id === script);
        if (fn) {
            if (onOpenFunction) onOpenFunction(fn, {block});
            else setDialogId(fn.id);
            return;
        }
        const hat = data.hats?.find(item => item.id === script);
        onOpenScript?.(hat ?? {id: script, label: labels.looseScript, x: 0, y: 0}, {block});
    }

    // In the list, named functions gather in a section of their own below the standard ones.
    const grouped = mode === 'list' && ordered.some(fn => fn.kind === 'named');
    const standard = grouped ? ordered.filter(fn => fn.kind !== 'named') : ordered;
    const named = ordered.filter(fn => fn.kind === 'named');
    const functionList = (functions: readonly SpriteFunction[]) => <ul className="tw-sprite-functions__list"
        data-list={functions[0]?.kind === 'named' && grouped ? 'named' : undefined}>
        {functions.map(fn => <li key={fn.id} className="tw-sprite-functions__item" data-function-id={fn.id} data-kind={fn.kind}>
            <button type="button" className="tw-sprite-functions__open" data-function-key={fn.id}
                aria-current={selectedId === fn.id || undefined}
                aria-label={labels.openCode.replace('%1', () => functionLabel(fn))} onClick={() => setDialogId(fn.id)}>
                <FunctionIcon />
                <span className="tw-sprite-functions__name" title={fn.description}>{functionLabel(fn)}</span>
                <Badges labels={labels} fn={fn} calls={false} kind={!grouped} />
            </button>
            <button type="button" className="tw-sprite-functions__badge tw-sprite-functions__uses-button"
                data-unused={fn.calls === 0 || undefined} data-uses-key={fn.id}
                aria-label={`${labels.calls(fn.calls)}: ${labels.showUses.replace('%1', () => functionLabel(fn))}`}
                title={labels.showUses.replace('%1', () => functionLabel(fn))} onClick={() => setUsesId(fn.id)}>
                {labels.calls(fn.calls)}
            </button>
        </li>)}
    </ul>;

    // Scripts join only the relation graph; the function list and its editors keep their existing data.
    const graph = React.useMemo(() => relationGraph(scannedRelations(data, labels === japanese), visibility, !data.scriptRelations && Boolean(data.messageGraph)),
        [data.targetId, data.functions, data.globals, data.scriptRelations, data.scripts, data.messageGraph, labels, visibility.function, visibility.message]);
    const graphSelection = selectedId && (graph.functions.some(fn => fn.id === selectedId) ? selectedId :
        [...graph.scripts].find(([, script]) => script.targetId === data.targetId && script.scriptId === selectedId)?.[0]);
    const hint = !editable && ordered.length > 0;
    return <section ref={list} className="tw-sprite-functions" aria-label={view ? labels.panels[view] : labels.panel} data-mode={mode}>
        {(!view || mode === 'list' || hint) && <div className="tw-sprite-functions__bar">
            {!view && <Choice label={labels.view} value={settings.mode} options={labels.modes} onChange={next => change({mode: next})} />}
            {/* The graph places functions by who calls whom, so only the list can be ordered. */}
            {mode === 'list' && <label className="tw-sprite-functions__order">
                <span>{labels.order}</span>
                <select value={settings.order} onChange={event => change({order: event.currentTarget.value as FunctionOrder})}>
                    {functionOrders.map(id => <option key={id} value={id}>{labels.orders[id]}</option>)}
                </select>
            </label>}
            {hint && <p className="tw-sprite-functions__hint">{labels.readOnly}</p>}
        </div>}
        {/* Without functions the graph stays, blank, and points to the button that makes one. */}
        {mode === 'graph' ? <CallGraph labels={labels} idPrefix={idPrefix} functions={graph.functions}
            scripts={graph.scripts} relations={graph.relations} targetId={data.targetId} settings={settings} selectedId={graphSelection ?? added}
            positions={settings.graphPositions?.[data.targetId]?.[settings.direction] ?? {}}
            onPositionsChange={positions => change({graphPositions: {...settings.graphPositions,
                [data.targetId]: {...settings.graphPositions?.[data.targetId], [settings.direction]: positions}}})}
            corner={addButton} notice={graph.functions.length || !visibility.function ? undefined : emptyText('graph')}
            onOpen={fn => fn.owner ? onOpenFunction?.(fn) : setDialogId(fn.id)} canOpenExternal={Boolean(onOpenFunction)}
            onOpenScript={onOpenRelationScript ?? (onOpenScript ? endpoint => {
                const script = graph.scripts.get(`script:${JSON.stringify([endpoint.targetId, endpoint.scriptId])}`);
                onOpenScript({id: endpoint.scriptId, targetId: endpoint.targetId, label: script?.label ?? endpoint.scriptId,
                    x: script?.x ?? 0, y: script?.y ?? 0});
            } : undefined)} /> :
            !hats.length && !ordered.length ? <p className="tw-sprite-functions__empty">{emptyText('list')}</p> :
            !hats.length && !grouped ? functionList(ordered) : <>
                {hats.length > 0 && <>
                    <h3 className="tw-sprite-functions__group">{labels.hats}</h3>
                    <ul className="tw-sprite-functions__list" data-list="hats">
                        {hats.map(hat => <li key={hat.id} className="tw-sprite-functions__item" data-hat-id={hat.id}>
                            <button type="button" className="tw-sprite-functions__open" data-hat-key={hat.id}
                                aria-current={selectedId === hat.id || undefined}
                                disabled={!onOpenScript} aria-label={labels.openScript.replace('%1', () => hat.label)}
                                onClick={() => onOpenScript?.(hat)}>
                                {hat.thumbnail && <HatThumbnail drawing={hat.thumbnail} />}
                                <span className="tw-sprite-functions__name">{hat.label}</span>
                            </button>
                        </li>)}
                    </ul>
                </>}
                <h3 className="tw-sprite-functions__group">{labels.functions}</h3>
                {standard.length ? functionList(standard) : <p className="tw-sprite-functions__empty">{emptyText('list')}</p>}
                {grouped && <>
                    <h3 className="tw-sprite-functions__group">{labels.namedFunctions}</h3>
                    {functionList(named)}
                </>}
            </>}
        {mode === 'list' && addButton && <div className="tw-sprite-functions__create">{addButton}</div>}
        {adding && onCreate && <AddDialog labels={labels} kind={settings.create} onKind={create => change({create})}
            onClose={() => setAdding(false)} onCreate={async (kind, name) => {
                const id = await onCreate(kind, name);
                if (!id) return;
                // The new function joins the data when the host refreshes; open it then.
                setAdded(id);
                setDialogId(id);
            }} />}
        {usesFunction && <UsesDialog labels={labels} fn={usesFunction} describe={describe} onPick={openUse}
            onClose={() => setUsesId(null)} />}
        {dialogFunction && !onOpenFunction && <FunctionDialog labels={labels} fn={dialogFunction}
            onClose={() => setDialogId(null)}>
            <FunctionEditor targetId={data.targetId} functionId={dialogFunction.id} editable={editable} large
                label={labels.editor.replace('%1', () => functionLabel(dialogFunction))} mountEditor={mount} />
        </FunctionDialog>}
    </section>;
}
