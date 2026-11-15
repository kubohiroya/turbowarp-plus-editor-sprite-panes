import React from 'react';

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
    /** Who may call a named function: scripts of this sprite only, or every sprite. */
    scope?: 'sprite' | 'global';
    /** The description a named function gives in its `define function` hat. */
    description?: string;
}

/**
 * The extensions whose `define function`, `call function`, `call [menu]` and `start function` blocks
 * are read as named functions. An extension that carries those blocks through the named-functions
 * Composition API under its own ID can be added here.
 */
export const namedFunctionExtensions: readonly string[] = ['kubohiroyanamedfunctions'];

export interface FunctionPaneData {
    targetId: string;
    isStage: boolean;
    functions: readonly SpriteFunction[];
}

export type FunctionOrder = 'name' | 'z' | 'n';
export const functionOrders: readonly FunctionOrder[] = ['name', 'z', 'n'];
export type FunctionPaneMode = 'list' | 'graph';
export type CallGraphDirection = 'LR' | 'TD';

export type FunctionKind = SpriteFunction['kind'];

export interface FunctionPaneSettings {
    mode: FunctionPaneMode;
    order: FunctionOrder;
    direction: CallGraphDirection;
    /** Which kind of function the create button makes. */
    create: FunctionKind;
}
const defaultSettings: FunctionPaneSettings = {mode: 'list', order: 'name', direction: 'LR', create: 'procedure'};

/**
 * Why creating a function failed: `duplicate` when the definition already exists, `unavailable`
 * when the named-functions extension cannot be loaded.
 */
export type FunctionCreateError = 'duplicate' | 'unavailable' | 'failed';

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
    mountEditor?: MountFunctionEditor;
    /**
     * Make a new function of this kind in the target and resolve with the id of its hat, or with
     * nothing when the person cancels. A rejection may carry a `code` of {@link FunctionCreateError}.
     */
    onCreate?(kind: FunctionKind): Promise<string | void> | string | void;
}

interface RuntimeBlock {
    id: string;
    opcode: string;
    parent?: string | null;
    topLevel?: boolean;
    x?: number;
    y?: number;
    inputs?: Record<string, {block?: string | null; shadow?: string | null}>;
    fields?: Record<string, {value?: unknown}>;
    mutation?: {proccode?: string; argumentnames?: string; warp?: string | boolean};
}

/** Read the custom block definitions of a VM target. Only the shape of its blocks container is used. */
export function readTargetFunctions(target: {id: string; isStage?: boolean; blocks: {_blocks: Record<string, RuntimeBlock>}},
    {extensions = namedFunctionExtensions}: {extensions?: readonly string[]} = {}): FunctionPaneData {
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

    type Reading = SpriteFunction & {callees: string[]};
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
            calls: 0, scriptCalls: 0, callees: [] as string[]
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
            // Hats saved before SCOPE existed are for all sprites.
            scope: scope === 'sprite' ? 'sprite' as const : 'global' as const,
            description: literal(block, 'DESCRIPTION')?.trim() || undefined
        };
        functions.push(fn);
        if (!byName.has(name)) byName.set(name, fn);
    }
    const definitions = new Map(functions.map(fn => [fn.id, fn]));
    function calleeOf(block: RuntimeBlock) {
        if (block.opcode === 'procedures_call') return byCode.get(block.mutation?.proccode);
        if (named(block, 'callFunction') || named(block, 'startFunction')) return byName.get(literal(block, 'NAME')?.trim());
        if (named(block, 'callFunctionFromMenu')) return byName.get(String(block.fields?.FUNCTION?.value ?? '').trim());
        return undefined;
    }
    for (const block of Object.values(blocks)) {
        const callee = calleeOf(block);
        if (!callee) continue;
        callee.calls++;
        const caller = definitions.get(topOf(block.id));
        if (!caller) callee.scriptCalls++;
        else if (!caller.callees.includes(callee.id)) caller.callees.push(callee.id);
    }
    return {targetId: target.id, isStage: Boolean(target.isStage), functions};
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

export interface CallGraphNode {
    fn: SpriteFunction;
    layer: number;
    x: number;
    y: number;
}

export interface CallGraphEdge {
    from: string;
    to: string;
    /** `back` points to the same or an earlier layer, as recursion through other functions does. */
    kind: 'forward' | 'back' | 'self';
}

export interface CallGraphLayout {
    nodes: CallGraphNode[];
    edges: CallGraphEdge[];
    width: number;
    height: number;
}

export const callGraphNodeSize = {width: 176, height: 44};
const graphPadding = 24;
const layerGap = 64;
const siblingGap = 18;

/**
 * Lay out who calls whom: callers come before the functions they call, from left to right (LR)
 * or from top to bottom (TD). Calls that close a cycle are kept as back edges so every function
 * gets one place. Within a layer, functions follow their callers and then the chosen order.
 */
export function layoutCallGraph(functions: readonly SpriteFunction[], direction: CallGraphDirection,
    order: FunctionOrder = 'name', locale = 'en'): CallGraphLayout {
    const ordered = orderFunctions(functions, order, locale);
    const rank = new Map(ordered.map((fn, index) => [fn.id, index]));
    const byId = new Map(functions.map(fn => [fn.id, fn]));
    const callees = (fn: SpriteFunction) => fn.callees.filter(id => byId.has(id))
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

    const columns: SpriteFunction[][] = [];
    for (const fn of ordered) (columns[layers.get(fn.id)] ??= []).push(fn);
    const slot = new Map<string, number>();
    const callers = new Map<string, string[]>();
    for (const fn of functions) {
        for (const next of fn.callees) if (next !== fn.id) callers.set(next, [...callers.get(next) ?? [], fn.id]);
    }
    columns.forEach((column, layer) => {
        // Sit each function near the callers already placed, so edges cross less.
        const weight = (fn: SpriteFunction) => {
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
    const nodes = ordered.map(fn => {
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
    return {nodes, edges, width: direction === 'LR' ? mainSize : crossSize, height: direction === 'LR' ? crossSize : mainSize};
}

let paneCount = 0;

const english = {
    panel: 'Functions',
    view: 'View',
    modes: {list: 'List', graph: 'Call graph'} as Record<FunctionPaneMode, string>,
    flow: 'Flow',
    directions: {LR: 'Left to right (LR)', TD: 'Top to bottom (TD)'} as Record<CallGraphDirection, string>,
    order: 'Order',
    orders: {name: 'Name (A–Z)', z: 'Z order (rows)', n: 'N order (columns)'} as Record<FunctionOrder, string>,
    empty: 'This sprite has no functions. Make one with “Make a Block” in My Blocks.',
    emptyStage: 'The stage has no functions. Make one with “Make a Block” in My Blocks.',
    calls: (count: number) => count === 0 ? 'Not used' : count === 1 ? 'Used once' : `Used ${count} times`,
    fromScripts: 'Called from other scripts',
    named: 'Named function',
    global: 'All sprites',
    warp: 'Runs without screen refresh',
    editor: 'Code of %1',
    readOnly: 'Click this view to edit.',
    graph: 'Which function calls which',
    openCode: 'Open the code of %1',
    close: 'Close',
    create: {procedure: 'New function (standard)', named: 'New function (TurboWarp-Plus)'} as Record<FunctionKind, string>,
    createKind: 'Switch the kind of function to create',
    createErrors: {
        duplicate: 'A block with this definition already exists.',
        unavailable: 'The TurboWarp-Named-Functions extension could not be loaded.',
        failed: 'The function could not be created.'
    } as Record<FunctionCreateError, string>
};

const japanese: typeof english = {
    panel: '関数',
    view: '表示',
    modes: {list: '一覧', graph: '呼び出し図'},
    flow: '流れ',
    directions: {LR: '左から右 (LR)', TD: '上から下 (TD)'},
    order: '並べ方',
    orders: {name: '名前順', z: 'Z順（行ごと）', n: 'N順（列ごと）'},
    empty: 'このスプライトには関数がありません。「ブロック定義」の「ブロックを作る」で作れます。',
    emptyStage: 'ステージには関数がありません。「ブロック定義」の「ブロックを作る」で作れます。',
    calls: (count: number) => count === 0 ? '未使用' : `${count}か所で使用`,
    fromScripts: '関数以外のスクリプトから呼ばれる',
    named: '名前付き関数',
    global: 'すべてのスプライト',
    warp: '画面を再描画せずに実行',
    editor: '%1 のコード',
    readOnly: 'このビューをクリックすると編集できます。',
    graph: '関数の呼び出し関係',
    openCode: '%1 のコードを開く',
    close: '閉じる',
    create: {procedure: '新しい関数(標準)を作成', named: '新しい関数(TurboWarp-Plus)を作成'},
    createKind: '作成する関数の種類を切り替える',
    createErrors: {
        duplicate: '同じ定義のブロックがすでにあります。',
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

function Choice<T extends string>({label, value, options, onChange}: {
    label: string;
    value: T;
    options: Record<T, string>;
    onChange(value: T): void;
}) {
    return <div className="tw-sprite-functions__choice" role="group" aria-label={label}>
        {(Object.keys(options) as T[]).map(id => <button key={id} type="button" aria-pressed={value === id}
            data-choice={id} onClick={() => onChange(id)}>{options[id]}</button>)}
    </div>;
}

function Badges({labels, fn}: {labels: Labels; fn: SpriteFunction}) {
    return <>
        {fn.kind === 'named' && <span className="tw-sprite-functions__badge" data-kind="named">{labels.named}</span>}
        {fn.kind === 'named' && fn.scope === 'global' &&
            <span className="tw-sprite-functions__badge" data-scope="global">{labels.global}</span>}
        {fn.warp && <span className="tw-sprite-functions__badge" title={labels.warp}>⚡
            <span className="tw-sprite-functions__visually-hidden">{labels.warp}</span></span>}
        <span className="tw-sprite-functions__badge" data-unused={fn.calls === 0 || undefined}>{labels.calls(fn.calls)}</span>
    </>;
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

function edgePath(from: CallGraphNode, to: CallGraphNode, kind: CallGraphEdge['kind'], direction: CallGraphDirection) {
    const {width, height} = callGraphNodeSize;
    if (kind === 'self') {
        const x = from.x + width - 24;
        const y = from.y;
        // Stay within the graph padding above the first row.
        return `M${x} ${y} C${x} ${y - 20}, ${x + 32} ${y - 20}, ${x + 20} ${y}`;
    }
    if (direction === 'LR') {
        if (kind === 'back') {
            const sx = from.x + width / 2;
            const sy = from.y + height;
            const tx = to.x + width / 2;
            const ty = to.y + height;
            const bend = Math.max(sy, ty) + 36;
            return `M${sx} ${sy} C${sx} ${bend}, ${tx} ${bend}, ${tx} ${ty}`;
        }
        const sx = from.x + width;
        const sy = from.y + height / 2;
        const tx = to.x;
        const ty = to.y + height / 2;
        const middle = (sx + tx) / 2;
        return `M${sx} ${sy} C${middle} ${sy}, ${middle} ${ty}, ${tx} ${ty}`;
    }
    if (kind === 'back') {
        const sx = from.x + width;
        const sy = from.y + height / 2;
        const tx = to.x + width;
        const ty = to.y + height / 2;
        const bend = Math.max(sx, tx) + 36;
        return `M${sx} ${sy} C${bend} ${sy}, ${bend} ${ty}, ${tx} ${ty}`;
    }
    const sx = from.x + width / 2;
    const sy = from.y + height;
    const tx = to.x + width / 2;
    const ty = to.y;
    const middle = (sy + ty) / 2;
    return `M${sx} ${sy} C${sx} ${middle}, ${tx} ${middle}, ${tx} ${ty}`;
}

function CallGraph({labels, idPrefix, functions, settings, onOpen}: {
    labels: Labels;
    idPrefix: string;
    functions: readonly SpriteFunction[];
    settings: FunctionPaneSettings;
    onOpen(fn: SpriteFunction): void;
}) {
    const layout = React.useMemo(() => layoutCallGraph(functions, settings.direction, settings.order),
        [functions, settings.direction, settings.order]);
    const byId = new Map(layout.nodes.map(node => [node.fn.id, node]));
    const marker = `${idPrefix}-arrow`;
    const reading = [...layout.nodes].sort((a, b) => a.layer - b.layer ||
        (settings.direction === 'LR' ? a.y - b.y : a.x - b.x));
    return <figure className="tw-sprite-functions__graph" data-direction={settings.direction}>
        <figcaption className="tw-sprite-functions__visually-hidden">{labels.graph}</figcaption>
        <div className="tw-sprite-functions__canvas" style={{width: layout.width, height: layout.height}}>
            <svg className="tw-sprite-functions__edges" width={layout.width} height={layout.height} aria-hidden="true"
                focusable="false">
                <defs>
                    <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
                        orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" /></marker>
                </defs>
                {layout.edges.map(edge => <path key={`${edge.from}>${edge.to}`} data-edge={`${edge.from}>${edge.to}`}
                    data-kind={edge.kind} markerEnd={`url(#${marker})`}
                    d={edgePath(byId.get(edge.from), byId.get(edge.to), edge.kind, settings.direction)} />)}
            </svg>
            <ul className="tw-sprite-functions__nodes">
                {reading.map(({fn, x, y}) => {
                    const label = functionLabel(fn);
                    return <li key={fn.id} style={{left: x, top: y, width: callGraphNodeSize.width, height: callGraphNodeSize.height}}>
                        <button type="button" className="tw-sprite-functions__node" data-function-key={fn.id}
                            data-kind={fn.kind}
                            data-unused={fn.calls === 0 || undefined} data-entry={fn.scriptCalls > 0 || undefined}
                            title={[labels.openCode.replace('%1', () => label), fn.kind === 'named' && labels.named,
                                fn.description].filter(Boolean).join('\n')} onClick={() => onOpen(fn)}>
                            <span className="tw-sprite-functions__name">{label}</span>
                            {fn.scriptCalls > 0 && <span className="tw-sprite-functions__entry" title={labels.fromScripts}>▶
                                <span className="tw-sprite-functions__visually-hidden">{labels.fromScripts}</span></span>}
                        </button>
                    </li>;
                })}
            </ul>
        </div>
    </figure>;
}

function CreateButton({labels, kind, editable, onKind, onCreate}: {
    labels: Labels;
    kind: FunctionKind;
    editable: boolean;
    onKind(kind: FunctionKind): void;
    onCreate(kind: FunctionKind): Promise<string | void> | string | void;
}) {
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<FunctionCreateError>();
    const mounted = React.useRef(true);
    React.useEffect(() => () => {
        mounted.current = false;
    }, []);
    async function create() {
        setBusy(true);
        setError(undefined);
        try {
            await onCreate(kind);
        } catch (reason) {
            const code = (reason as {code?: unknown})?.code;
            if (mounted.current) setError(code === 'duplicate' || code === 'unavailable' ? code : 'failed');
        } finally {
            if (mounted.current) setBusy(false);
        }
    }
    return <div className="tw-sprite-functions__create">
        <div className="tw-sprite-functions__split" data-kind={kind}>
            <button type="button" className="tw-sprite-functions__create-main" disabled={!editable || busy}
                aria-busy={busy || undefined} onClick={create}>{labels.create[kind]}</button>
            <button type="button" className="tw-sprite-functions__create-kind" disabled={!editable || busy}
                aria-label={labels.createKind} title={labels.createKind} onClick={() => {
                    setError(undefined);
                    onKind(kind === 'procedure' ? 'named' : 'procedure');
                }}>
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4" /></svg>
            </button>
        </div>
        {error && <p className="tw-sprite-functions__create-error" role="alert">{labels.createErrors[error]}</p>}
    </div>;
}

export function SpriteFunctionPane({locale, editable, data, defaultSettings: initial, onSettingsChange, mountEditor,
    onCreate}:
    SpriteFunctionPaneProps) {
    const labels = /^ja(?:-|$)/i.test(locale) ? japanese : english;
    const [settings, setSettings] = React.useState<FunctionPaneSettings>(() => ({...defaultSettings, ...initial}));
    const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
    const [dialogId, setDialogId] = React.useState<string | null>(null);
    const mount = React.useRef(mountEditor);
    mount.current = mountEditor;
    const ordered = React.useMemo(() => orderFunctions(data.functions, settings.order, locale),
        [data.functions, settings.order, locale]);
    const [idPrefix] = React.useState(() => `tw-sprite-functions-${++paneCount}`);
    const dialogFunction = dialogId ? data.functions.find(fn => fn.id === dialogId) : undefined;

    function change(patch: Partial<FunctionPaneSettings>) {
        const next = {...settings, ...patch};
        setSettings(next);
        onSettingsChange?.(next);
    }

    function toggle(id: string) {
        setExpanded(current => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
        });
    }

    return <section className="tw-sprite-functions" aria-label={labels.panel} data-mode={settings.mode}>
        <div className="tw-sprite-functions__bar">
            <Choice label={labels.view} value={settings.mode} options={labels.modes} onChange={mode => change({mode})} />
            {settings.mode === 'graph' && <Choice label={labels.flow} value={settings.direction}
                options={labels.directions} onChange={direction => change({direction})} />}
            <label className="tw-sprite-functions__order">
                <span>{labels.order}</span>
                <select value={settings.order} onChange={event => change({order: event.currentTarget.value as FunctionOrder})}>
                    {functionOrders.map(id => <option key={id} value={id}>{labels.orders[id]}</option>)}
                </select>
            </label>
            {!editable && ordered.length > 0 && <p className="tw-sprite-functions__hint">{labels.readOnly}</p>}
        </div>
        {!ordered.length ? <p className="tw-sprite-functions__empty">{data.isStage ? labels.emptyStage : labels.empty}</p> :
            settings.mode === 'graph' ? <CallGraph labels={labels} idPrefix={idPrefix} functions={data.functions}
                settings={settings} onOpen={fn => setDialogId(fn.id)} /> :
            <ul className="tw-sprite-functions__list">
                {ordered.map(fn => {
                    const open = expanded.has(fn.id);
                    const label = functionLabel(fn);
                    const panelId = `${idPrefix}-${fn.id}`;
                    return <li key={fn.id} className="tw-sprite-functions__item" data-function-id={fn.id} data-kind={fn.kind}>
                        <h3 className="tw-sprite-functions__heading">
                            <button type="button" className="tw-sprite-functions__toggle" aria-expanded={open}
                                aria-controls={open ? panelId : undefined} data-function-key={fn.id}
                                onClick={() => toggle(fn.id)}>
                                <svg className="tw-sprite-functions__chevron" viewBox="0 0 16 16" aria-hidden="true"
                                    focusable="false"><path d="m6 4 4 4-4 4" /></svg>
                                <span className="tw-sprite-functions__name" title={fn.description}>{label}</span>
                                <Badges labels={labels} fn={fn} />
                            </button>
                        </h3>
                        {open && <div id={panelId} className="tw-sprite-functions__panel">
                            <FunctionEditor targetId={data.targetId} functionId={fn.id} editable={editable}
                                label={labels.editor.replace('%1', () => label)} mountEditor={mount} />
                        </div>}
                    </li>;
                })}
            </ul>}
        {onCreate && <CreateButton labels={labels} kind={settings.create} editable={editable}
            onKind={create => change({create})} onCreate={async kind => {
                const id = await onCreate(kind);
                if (!id) return;
                // The new function joins the data when the host refreshes; open it then.
                if (settings.mode === 'graph') setDialogId(id);
                else setExpanded(current => new Set(current).add(id));
            }} />}
        {dialogFunction && settings.mode === 'graph' && <FunctionDialog labels={labels} fn={dialogFunction}
            onClose={() => setDialogId(null)}>
            <FunctionEditor targetId={data.targetId} functionId={dialogFunction.id} editable={editable} large
                label={labels.editor.replace('%1', () => functionLabel(dialogFunction))} mountEditor={mount} />
        </FunctionDialog>}
    </section>;
}
