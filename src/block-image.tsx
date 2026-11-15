/**
 * Draws a single block of any sprite or the stage as Scratch shows it, for small images such as the
 * hats in the variable and message panes. The editor only renders the blocks of the target it edits,
 * so the block is drawn in an off-screen workspace and a copy of its drawing is returned.
 *
 * The host passes its ScratchBlocks. This module does not import it.
 */

import React from 'react';

const svgNamespace = 'http://www.w3.org/2000/svg';

interface Workspace {
    scale?: number;
    options?: {pathToMedia?: string; RTL?: boolean; colours?: object};
    clear(): void;
    dispose(): void;
}
interface RenderedBlock {
    getSvgRoot(): SVGGElement;
}
export interface BlockImageScratchBlocks {
    mainWorkspace?: Workspace | null;
    getMainWorkspace?(): Workspace | null;
    inject(container: Element, options: object): Workspace;
    Xml: {textToDom(text: string): Element; domToBlock(dom: Element, workspace: Workspace): RenderedBlock};
    Events: {disable(): void; enable(): void};
    Field?: {stopCache?(): void};
}
interface Target {
    blocks: {blockToXML(id: string, comments?: object): string | undefined};
    comments?: object;
}
export interface BlockImageRuntime {
    getTargetById(id: string): Target | undefined;
}

/** Computed styles copied onto the drawing, so it looks the same outside the workspace's CSS. */
const copiedStyles = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity',
    'font-family', 'font-size', 'font-weight', 'font-style', 'dominant-baseline', 'text-anchor'];

/**
 * The XML of one block without the blocks that follow it or its comment. Blocks inside its inputs,
 * such as the menu of a hat, stay.
 */
export function singleBlockXml(xml: string, parse: (text: string) => Element) {
    const root = parse(`<xml xmlns="http://www.w3.org/1999/xhtml">${xml}</xml>`);
    const block = [...root.children].find(child => child.localName === 'block' || child.localName === 'shadow');
    if (!block) return undefined;
    for (const child of [...block.children]) {
        if (child.localName === 'next' || child.localName === 'comment') child.remove();
    }
    block.removeAttribute('x');
    block.removeAttribute('y');
    return block;
}

function copyStyles(source: Element, copy: Element) {
    const style = source.ownerDocument.defaultView?.getComputedStyle(source);
    if (style) {
        const declarations = copiedStyles.map(name => [name, style.getPropertyValue(name)] as const)
            .filter(([, value]) => value);
        if (declarations.length) {
            copy.setAttribute('style', declarations.map(([name, value]) => `${name}:${value}`).join(';'));
        }
    }
    const sources = source.children;
    const copies = copy.children;
    for (let index = 0; index < sources.length && index < copies.length; index++) copyStyles(sources[index], copies[index]);
}

export interface BlockImageRenderer {
    /**
     * A new SVG element showing the block, or undefined when the block or ScratchBlocks is not
     * available. Each call returns its own element, so callers may insert it anywhere.
     */
    render(targetId: string, blockId: string): SVGSVGElement | undefined;
    dispose(): void;
}

export function createBlockImageRenderer(getScratchBlocks: () => BlockImageScratchBlocks | undefined,
    runtime: BlockImageRuntime, document: Document = globalThis.document): BlockImageRenderer {
    let container: HTMLDivElement | undefined;
    let workspace: Workspace | undefined;
    let workspaceBlocks: BlockImageScratchBlocks | undefined;
    // One drawing per block, kept with the XML it was drawn from, so an edited block is drawn again.
    const drawings = new Map<string, {xml: string; drawing: SVGSVGElement}>();

    function workspaceFor(blocks: BlockImageScratchBlocks) {
        if (workspace && workspaceBlocks === blocks) return workspace;
        dispose();
        const main = blocks.getMainWorkspace?.() ?? blocks.mainWorkspace ?? undefined;
        container = document.createElement('div');
        container.dataset.twPlusBlockImage = '';
        container.setAttribute('aria-hidden', 'true');
        container.inert = true;
        container.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px;height:400px;visibility:hidden;pointer-events:none';
        document.body.append(container);
        blocks.Events.disable();
        try {
            workspace = blocks.inject(container, {
                readOnly: true, scrollbars: false, sounds: false, comments: false,
                media: main?.options?.pathToMedia, rtl: main?.options?.RTL, colours: main?.options?.colours,
                zoom: {startScale: 1}
            });
        } finally {
            // Injection changes Blockly's main workspace. Restore it without moving browser focus.
            blocks.mainWorkspace = main ?? null;
            blocks.Events.enable();
        }
        // The live workspace already holds a reference to Blockly's field width cache.
        blocks.Field?.stopCache?.();
        workspaceBlocks = blocks;
        return workspace;
    }

    function draw(blocks: BlockImageScratchBlocks, dom: Element) {
        const preview = workspaceFor(blocks);
        blocks.Events.disable();
        try {
            preview.clear();
            const root = blocks.Xml.domToBlock(dom, preview).getSvgRoot();
            const box = root.getBBox();
            if (!box.width || !box.height) return undefined;
            const copy = root.cloneNode(true) as SVGGElement;
            copyStyles(root, copy);
            // The workspace places the block with a transform. The image frames it with its viewBox instead.
            copy.removeAttribute('transform');
            for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
            const svg = document.createElementNS(svgNamespace, 'svg');
            svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
            svg.setAttribute('width', String(box.width));
            svg.setAttribute('height', String(box.height));
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            svg.append(copy);
            return svg;
        } finally {
            preview.clear();
            blocks.Events.enable();
        }
    }

    function dispose() {
        workspace?.dispose();
        container?.remove();
        workspace = undefined;
        container = undefined;
        workspaceBlocks = undefined;
        drawings.clear();
    }

    return {
        render(targetId, blockId) {
            const blocks = getScratchBlocks();
            const target = runtime.getTargetById(targetId);
            const xml = target?.blocks.blockToXML(blockId, target.comments ?? {});
            if (!blocks || !xml) return undefined;
            const key = targetId + '\n' + blockId;
            let drawing = drawings.get(key)?.xml === xml ? drawings.get(key).drawing : undefined;
            if (!drawing) {
                const dom = singleBlockXml(xml, text => blocks.Xml.textToDom(text));
                drawing = dom && draw(blocks, dom);
                if (!drawing) return undefined;
                drawings.set(key, {xml, drawing});
            }
            return drawing.cloneNode(true) as SVGSVGElement;
        },
        dispose
    };
}

/** Draws a block for a pane. See `createBlockImageRenderer`. */
export type GetBlockImage = (targetId: string, blockId: string) => SVGSVGElement | undefined;

/**
 * A block as Scratch draws it. Until the host draws it, or when it cannot, the children stand in for
 * it; they default to the label, which also names the image for assistive technology.
 */
export function BlockImage({targetId, blockId, label, getBlockImage, className, children}: {
    targetId?: string;
    blockId?: string;
    label: string;
    getBlockImage?: GetBlockImage;
    className?: string;
    children?: React.ReactNode;
}) {
    const frame = React.useRef<HTMLSpanElement>(null);
    const [drawn, setDrawn] = React.useState(false);
    // Draw on every render: the renderer keeps one drawing per block and draws it again only when the
    // block has changed, so an edited hat shows its new form.
    React.useLayoutEffect(() => {
        const image = targetId && blockId ? getBlockImage?.(targetId, blockId) : undefined;
        frame.current?.replaceChildren(...image ? [image] : []);
        setDrawn(Boolean(image));
    });
    return <>
        <span ref={frame} className={className ? 'tw-block-image ' + className : 'tw-block-image'}
            role="img" aria-label={label} title={label} hidden={!drawn} />
        {!drawn && (children ?? label)}
    </>;
}

const hatNames = {
    en: {
        whenReceived: 'when I receive %1',
        hats: {
            event_whenflagclicked: 'when green flag clicked',
            event_whenkeypressed: 'when key pressed',
            event_whenthisspriteclicked: 'when this sprite clicked',
            event_whenstageclicked: 'when stage clicked',
            event_whenbackdropswitchesto: 'when backdrop switches to',
            event_whengreaterthan: 'when value greater than',
            control_start_as_clone: 'when I start as a clone',
            procedures_definition: 'block definition'
        } as Record<string, string>
    },
    ja: {
        whenReceived: '%1を受け取ったとき',
        hats: {
            event_whenflagclicked: '緑の旗が押されたとき',
            event_whenkeypressed: 'キーが押されたとき',
            event_whenthisspriteclicked: 'このスプライトが押されたとき',
            event_whenstageclicked: 'ステージが押されたとき',
            event_whenbackdropswitchesto: '背景が切り替わったとき',
            event_whengreaterthan: '値が大きくなったとき',
            control_start_as_clone: 'クローンされたとき',
            procedures_definition: 'ブロックの定義'
        } as Record<string, string>
    }
};

/**
 * The name of the hat a script starts with, such as `when green flag clicked`. For `when I receive`,
 * pass the message to name it in full.
 */
export function hatName(locale: string, opcode: string, message?: string) {
    const names = /^ja(?:-|$)/i.test(locale) ? hatNames.ja : hatNames.en;
    if (opcode === 'event_whenbroadcastreceived' && message !== undefined) {
        return names.whenReceived.replace('%1', () => '「' + message + '」');
    }
    return names.hats[opcode] ?? opcode.replaceAll('_', ' ');
}
