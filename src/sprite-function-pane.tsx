import React from 'react';

/** A custom block definition ("function") of one sprite or the stage. */
export interface SpriteFunction {
    /** The id of the `procedures_definition` block. */
    id: string;
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
}

export interface FunctionPaneData {
    targetId: string;
    isStage: boolean;
    functions: readonly SpriteFunction[];
}

export type FunctionOrder = 'name' | 'z' | 'n';
export const functionOrders: readonly FunctionOrder[] = ['name', 'z', 'n'];
export type FunctionPaneMode = 'list' | 'graph';
export type CallGraphDirection = 'LR' | 'TD';

export interface FunctionPaneSettings {
    mode: FunctionPaneMode;
    order: FunctionOrder;
    direction: CallGraphDirection;
}
const defaultSettings: FunctionPaneSettings = {mode: 'list', order: 'name', direction: 'LR'};

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
}

interface RuntimeBlock {
    id: string;
    opcode: string;
    parent?: string | null;
    topLevel?: boolean;
    x?: number;
    y?: number;
    inputs?: Record<string, {block?: string | null}>;
    mutation?: {proccode?: string; argumentnames?: string; warp?: string | boolean};
}

/** Read the custom block definitions of a VM target. Only the shape of its blocks container is used. */
export function readTargetFunctions(target: {id: string; isStage?: boolean; blocks: {_blocks: Record<string, RuntimeBlock>}}):
    FunctionPaneData {
    const blocks = target.blocks._blocks;
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
            id: block.id, proccode: mutation.proccode, argumentNames,
            warp: mutation.warp === true || mutation.warp === 'true',
            x: Number(block.x) || 0, y: Number(block.y) || 0,
            calls: 0, scriptCalls: 0, callees: [] as string[]
        };
        functions.push(fn);
        if (!byCode.has(fn.proccode)) byCode.set(fn.proccode, fn);
    }
    const definitions = new Map(functions.map(fn => [fn.id, fn]));
    for (const block of Object.values(blocks)) {
        const callee = block.opcode === 'procedures_call' ? byCode.get(block.mutation?.proccode) : undefined;
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
    warp: 'Runs without screen refresh',
    editor: 'Code of %1',
    readOnly: 'Click this view to edit.',
    graph: 'Which function calls which',
    openCode: 'Open the code of %1',
    close: 'Close'
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
    warp: '画面を再描画せずに実行',
    editor: '%1 のコード',
    readOnly: 'このビューをクリックすると編集できます。',
    graph: '関数の呼び出し関係',
    openCode: '%1 のコードを開く',
    close: '閉じる'
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
    return <dialog ref={dialog} className="tw-sprite-functions__dialog" aria-label={labels.editor.replace('%1', () => title)}
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
                            data-unused={fn.calls === 0 || undefined} data-entry={fn.scriptCalls > 0 || undefined}
                            title={labels.openCode.replace('%1', () => label)} onClick={() => onOpen(fn)}>
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

export function SpriteFunctionPane({locale, editable, data, defaultSettings: initial, onSettingsChange, mountEditor}:
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
                    return <li key={fn.id} className="tw-sprite-functions__item" data-function-id={fn.id}>
                        <h3 className="tw-sprite-functions__heading">
                            <button type="button" className="tw-sprite-functions__toggle" aria-expanded={open}
                                aria-controls={open ? panelId : undefined} data-function-key={fn.id}
                                onClick={() => toggle(fn.id)}>
                                <svg className="tw-sprite-functions__chevron" viewBox="0 0 16 16" aria-hidden="true"
                                    focusable="false"><path d="m6 4 4 4-4 4" /></svg>
                                <span className="tw-sprite-functions__name">{label}</span>
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
        {dialogFunction && settings.mode === 'graph' && <FunctionDialog labels={labels} fn={dialogFunction}
            onClose={() => setDialogId(null)}>
            <FunctionEditor targetId={data.targetId} functionId={dialogFunction.id} editable={editable} large
                label={labels.editor.replace('%1', () => functionLabel(dialogFunction))} mountEditor={mount} />
        </FunctionDialog>}
    </section>;
}
