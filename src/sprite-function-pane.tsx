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
    zoom: 'Zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomReset: 'Reset zoom',
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
    zoom: '拡大・縮小',
    zoomOut: '縮小',
    zoomIn: '拡大',
    zoomReset: '元の大きさに戻す',
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
        const key = `${edge.from}>${edge.to}`;
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
        x: Math.max(0, (size.width - layout.width) / 2),
        y: Math.max(0, (size.height - layout.height) / 2)
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
        x: clamp(view.x, keepX - width, size.width - keepX),
        y: clamp(view.y, keepY - height, size.height - keepY)
    };
}

/** Everything the view can show at its scale, as the code area's minimap shows the scrollable area. */
function scrollArea(view: GraphView, size: Size, layout: CallGraphLayout) {
    const padX = (size.width - Math.min(layout.width * view.scale, size.width / 2)) / view.scale;
    const padY = (size.height - Math.min(layout.height * view.scale, size.height / 2)) / view.scale;
    return {x: -padX, y: -padY, width: layout.width + 2 * padX, height: layout.height + 2 * padY};
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

    const frame = React.useRef<HTMLElement>(null);
    const minimap = React.useRef<HTMLDivElement>(null);
    const [size, setSize] = React.useState<Size>({width: 0, height: 0});
    // `null` until the person moves the graph: the start view then follows the size of the pane.
    const [moved, setMoved] = React.useState<GraphView | null>(null);
    const [pointed, setPointed] = React.useState<string | null>(null);
    const [focused, setFocused] = React.useState<string | null>(null);
    const [panning, setPanning] = React.useState(false);
    const [mapDragging, setMapDragging] = React.useState(false);
    const view = fitView(moved ?? startView(size, layout), size, layout);
    const current = React.useRef({view, size, layout});
    current.current = {view, size, layout};
    const suppressClick = React.useRef(false);

    const move = React.useCallback((next: (view: GraphView, size: Size, layout: CallGraphLayout) => GraphView) => {
        const {view, size, layout} = current.current;
        const fitted = fitView(next(view, size, layout), size, layout);
        current.current = {...current.current, view: fitted};
        setMoved(fitted);
    }, []);

    React.useEffect(() => setMoved(null), [settings.direction]);

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
            if ((event.target as Element).closest?.('.tw-sprite-functions__zoom')) return;
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

    function startPan(event: React.PointerEvent) {
        if (event.button !== 0 || (event.target as Element).closest('.tw-sprite-functions__zoom, .tw-sprite-functions__minimap')) return;
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

    const highlightId = pointed ?? focused;
    const highlight = highlightId && byId.has(highlightId) ? callGraphHighlight(layout.edges, highlightId) : null;
    // Draw the highlighted links over the others.
    const edges = highlight ? [...layout.edges].sort((a, b) =>
        Number(highlight.edges.has(`${a.from}>${a.to}`)) - Number(highlight.edges.has(`${b.from}>${b.to}`))) : layout.edges;
    const edgeMarker = (kind?: string) => `url(#${marker}${kind === 'in' ? '-in' : kind ? '-out' : ''})`;
    const paths = (withMarkers: boolean) => edges.map(edge => {
        const key = `${edge.from}>${edge.to}`;
        const kind = highlight?.edges.get(key);
        return <path key={key} data-edge={withMarkers ? key : undefined} data-kind={edge.kind} data-highlight={kind}
            markerEnd={withMarkers ? edgeMarker(kind) : undefined}
            d={edgePath(byId.get(edge.from), byId.get(edge.to), edge.kind, settings.direction)} />;
    });
    const area = scrollArea(view, size, layout);
    const mapSize = {
        width: Math.min(minimapMax.width, size.width * 0.4 * 0.8),
        height: Math.min(minimapMax.height, size.height * 0.35 * 0.8)
    };

    return <figure ref={frame} className="tw-sprite-functions__graph" data-direction={settings.direction}
        data-highlighting={highlight ? '' : undefined} data-panning={panning ? '' : undefined}
        onPointerDown={startPan}
        onScroll={event => {
            // Focus may scroll the clipped frame; the view moves by its transform instead.
            event.currentTarget.scrollLeft = 0;
            event.currentTarget.scrollTop = 0;
        }}
        onClickCapture={event => {
            if (!suppressClick.current) return;
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
                    {['', '-in', '-out'].map(suffix => <marker key={suffix} id={marker + suffix} viewBox="0 0 10 10" refX="9"
                        refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"
                        data-highlight={suffix.slice(1) || undefined}><path d="M0 0 10 5 0 10Z" /></marker>)}
                </defs>
                {paths(true)}
            </svg>
            <ul className="tw-sprite-functions__nodes">
                {reading.map(node => {
                    const {fn, x, y} = node;
                    const label = functionLabel(fn);
                    return <li key={fn.id} style={{left: x, top: y, width: callGraphNodeSize.width, height: callGraphNodeSize.height}}>
                        <button type="button" className="tw-sprite-functions__node" data-function-key={fn.id}
                            data-unused={fn.calls === 0 || undefined} data-entry={fn.scriptCalls > 0 || undefined}
                            data-highlight={highlight?.nodes.get(fn.id)}
                            title={labels.openCode.replace('%1', () => label)} onClick={() => onOpen(fn)}
                            onPointerEnter={() => setPointed(fn.id)}
                            onPointerLeave={() => setPointed(id => id === fn.id ? null : id)}
                            onFocus={() => {
                                setFocused(fn.id);
                                reveal(node);
                            }}
                            onBlur={() => setFocused(id => id === fn.id ? null : id)}>
                            <span className="tw-sprite-functions__name">{label}</span>
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
                {layout.nodes.map(({fn, x, y}) => <rect key={fn.id} x={x} y={y} rx={8} width={callGraphNodeSize.width}
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
