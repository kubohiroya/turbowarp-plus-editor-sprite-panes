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
}

export interface FunctionPaneData {
    targetId: string;
    isStage: boolean;
    functions: readonly SpriteFunction[];
}

export type FunctionOrder = 'name' | 'z' | 'n';
export const functionOrders: readonly FunctionOrder[] = ['name', 'z', 'n'];

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
    /** The order to start with, such as the one this view used before. */
    defaultOrder?: FunctionOrder;
    onOrderChange?(order: FunctionOrder): void;
    mountEditor?: MountFunctionEditor;
}

interface RuntimeBlock {
    id: string;
    opcode: string;
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
    const calls = new Map<string, number>();
    for (const block of Object.values(blocks)) {
        const proccode = block.opcode === 'procedures_call' ? block.mutation?.proccode : undefined;
        if (proccode !== undefined) calls.set(proccode, (calls.get(proccode) ?? 0) + 1);
    }
    const functions: SpriteFunction[] = [];
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
        functions.push({
            id: block.id, proccode: mutation.proccode, argumentNames,
            warp: mutation.warp === true || mutation.warp === 'true',
            x: Number(block.x) || 0, y: Number(block.y) || 0,
            calls: calls.get(mutation.proccode) ?? 0
        });
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
export function orderFunctions(functions: readonly SpriteFunction[], order: FunctionOrder, locale = 'en'):
    SpriteFunction[] {
    if (order === 'name') {
        const collator = new Intl.Collator(locale, {numeric: true, sensitivity: 'base'});
        return [...functions].sort((a, b) =>
            collator.compare(functionLabel(a), functionLabel(b)) || (a.id < b.id ? -1 : Number(a.id > b.id)));
    }
    const band = order === 'z' ? 'y' : 'x';
    const scan = order === 'z' ? 'x' : 'y';
    const compare = (a: SpriteFunction, b: SpriteFunction, first: 'x' | 'y', second: 'x' | 'y') =>
        a[first] - b[first] || a[second] - b[second] || (a.id < b.id ? -1 : Number(a.id > b.id));
    const bands: SpriteFunction[][] = [];
    for (const item of [...functions].sort((a, b) => compare(a, b, band, scan))) {
        const current = bands.at(-1);
        // Measure each band from its first script so small offsets cannot chain across rows or columns.
        if (current && item[band] - current[0][band] <= alignmentTolerance) current.push(item);
        else bands.push([item]);
    }
    return bands.flatMap(items => items.sort((a, b) => compare(a, b, scan, band)));
}

let paneCount = 0;

const english = {
    panel: 'Functions',
    order: 'Order',
    orders: {name: 'Name (A–Z)', z: 'Z order (rows)', n: 'N order (columns)'} as Record<FunctionOrder, string>,
    empty: 'This sprite has no functions. Make one with “Make a Block” in My Blocks.',
    emptyStage: 'The stage has no functions. Make one with “Make a Block” in My Blocks.',
    calls: (count: number) => count === 0 ? 'Not used' : count === 1 ? 'Used once' : `Used ${count} times`,
    warp: 'Runs without screen refresh',
    editor: 'Code of %1',
    readOnly: 'Click this view to edit.'
};

const japanese: typeof english = {
    panel: '関数',
    order: '並べ方',
    orders: {name: '名前順', z: 'Z順（行ごと）', n: 'N順（列ごと）'},
    empty: 'このスプライトには関数がありません。「ブロック定義」の「ブロックを作る」で作れます。',
    emptyStage: 'ステージには関数がありません。「ブロック定義」の「ブロックを作る」で作れます。',
    calls: (count: number) => count === 0 ? '未使用' : `${count}か所で使用`,
    warp: '画面を再描画せずに実行',
    editor: '%1 のコード',
    readOnly: 'このビューをクリックすると編集できます。'
};

function FunctionEditor({targetId, functionId, editable, label, mountEditor}: {
    targetId: string;
    functionId: string;
    editable: boolean;
    label: string;
    mountEditor: React.RefObject<MountFunctionEditor | undefined>;
}) {
    const element = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        const dispose = mountEditor.current?.(element.current, targetId, functionId, {editable});
        return () => {
            if (typeof dispose === 'function') dispose();
        };
    }, [targetId, functionId, editable, mountEditor]);
    return <div ref={element} className="tw-sprite-functions__editor" role="group" aria-label={label}
        data-function-editor={functionId} data-editable={editable || undefined} />;
}

export function SpriteFunctionPane({locale, editable, data, defaultOrder = 'name', onOrderChange, mountEditor}:
    SpriteFunctionPaneProps) {
    const labels = /^ja(?:-|$)/i.test(locale) ? japanese : english;
    const [order, setLocalOrder] = React.useState<FunctionOrder>(defaultOrder);
    const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
    const mount = React.useRef(mountEditor);
    mount.current = mountEditor;
    const ordered = React.useMemo(() => orderFunctions(data.functions, order, locale), [data.functions, order, locale]);
    const [idPrefix] = React.useState(() => `tw-sprite-functions-${++paneCount}`);

    function setOrder(next: FunctionOrder) {
        setLocalOrder(next);
        onOrderChange?.(next);
    }

    function toggle(id: string) {
        setExpanded(current => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
        });
    }

    return <section className="tw-sprite-functions" aria-label={labels.panel}>
        <div className="tw-sprite-functions__bar">
            <label className="tw-sprite-functions__order">
                <span>{labels.order}</span>
                <select value={order} onChange={event => setOrder(event.currentTarget.value as FunctionOrder)}>
                    {functionOrders.map(id => <option key={id} value={id}>{labels.orders[id]}</option>)}
                </select>
            </label>
            {!editable && ordered.length > 0 && <p className="tw-sprite-functions__hint">{labels.readOnly}</p>}
        </div>
        {ordered.length ? <ul className="tw-sprite-functions__list">
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
                            {fn.warp && <span className="tw-sprite-functions__badge" title={labels.warp}>⚡
                                <span className="tw-sprite-functions__visually-hidden">{labels.warp}</span></span>}
                            <span className="tw-sprite-functions__badge" data-unused={fn.calls === 0 || undefined}>
                                {labels.calls(fn.calls)}
                            </span>
                        </button>
                    </h3>
                    {open && <div id={panelId} className="tw-sprite-functions__panel">
                        <FunctionEditor targetId={data.targetId} functionId={fn.id} editable={editable}
                            label={labels.editor.replace('%1', () => label)} mountEditor={mount} />
                    </div>}
                </li>;
            })}
        </ul> : <p className="tw-sprite-functions__empty">{data.isStage ? labels.emptyStage : labels.empty}</p>}
    </section>;
}
