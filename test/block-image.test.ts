import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {BlockImage, createBlockImageRenderer, hatName, singleBlockXml} from '../dist/block-image.js';
import {SpriteMessagePane} from '../dist/sprite-message-pane.js';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<main></main>', {pretendToBeVisual: true});
const {window} = dom;
Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
    Event: window.Event, MouseEvent: window.MouseEvent, FormData: window.FormData
});
const {createRoot} = await import('react-dom/client');
const svgNamespace = 'http://www.w3.org/2000/svg';
const parse = (text: string) => new window.DOMParser().parseFromString(text, 'text/xml').documentElement;

const hatXml = (message: string) => `<block id="hat" type="event_whenbroadcastreceived" x="10" y="20">
    <comment id="c">note</comment>
    <field name="BROADCAST_OPTION" id="m">${message}</field>
    <next><block id="say" type="looks_say"></block></next>
</block>`;

test('a single block keeps its fields but not the blocks after it, its comment or its place', () => {
    const block = singleBlockXml(hatXml('go'), parse);
    assert.equal(block.getAttribute('type'), 'event_whenbroadcastreceived');
    assert.deepEqual([...block.children].map(child => child.localName), ['field']);
    assert.equal(block.hasAttribute('x'), false);
    assert.equal(singleBlockXml('', parse), undefined);
});

/** A ScratchBlocks that records its calls and draws each block as a group with one text element. */
function fakeBlocks() {
    const calls: string[] = [];
    let events = 0;
    const main = {options: {pathToMedia: 'media/', RTL: false, colours: {}}, clear() {}, dispose() {}};
    const blocks = {
        mainWorkspace: main as object,
        getMainWorkspace: () => blocks.mainWorkspace,
        inject(container: Element, options: {media?: string}) {
            calls.push('inject ' + options.media);
            const svg = window.document.createElementNS(svgNamespace, 'svg');
            container.append(svg);
            const workspace = {
                clear: () => svg.replaceChildren(),
                dispose: () => calls.push('dispose')
            };
            blocks.mainWorkspace = workspace;
            return workspace;
        },
        Xml: {
            textToDom: parse,
            domToBlock(xml: Element) {
                calls.push('draw ' + xml.querySelector('field')?.textContent + ' next:' + Boolean(xml.querySelector('next')));
                const group = window.document.createElementNS(svgNamespace, 'g');
                group.setAttribute('transform', 'translate(5,6)');
                group.setAttribute('id', 'drawn');
                const text = window.document.createElementNS(svgNamespace, 'text');
                text.textContent = xml.querySelector('field')?.textContent ?? '';
                group.append(text);
                window.document.querySelector('[data-tw-plus-block-image] svg').append(group);
                Object.assign(group, {getBBox: () => ({x: 0, y: -20, width: 120, height: 60})});
                return {getSvgRoot: () => group};
            }
        },
        Events: {disable: () => { events++; }, enable: () => { events--; }},
        Field: {stopCache: () => calls.push('stopCache')}
    };
    return {blocks, main, calls, events: () => events};
}

test('the renderer draws a block off screen once and returns a copy framed by its bounds', () => {
    const {blocks, main, calls, events} = fakeBlocks();
    let xml = hatXml('go');
    const runtime = {getTargetById: (id: string) => id === 'cat' ?
        {blocks: {blockToXML: (blockId: string) => blockId === 'hat' ? xml : undefined}} : undefined};
    const renderer = createBlockImageRenderer(() => blocks, runtime, window.document);

    const first = renderer.render('cat', 'hat');
    assert.equal(first.getAttribute('viewBox'), '0 -20 120 60');
    assert.equal(first.querySelector('g').hasAttribute('transform'), false, 'the viewBox places the block');
    assert.equal(first.querySelector('[id]'), null, 'ids of the workspace do not leak into the page');
    assert.equal(first.textContent, 'go');
    assert.equal(blocks.mainWorkspace, main, 'the editor keeps its main workspace');
    assert.equal(events(), 0);

    const second = renderer.render('cat', 'hat');
    assert.notEqual(second, first, 'each call gets its own element');
    assert.deepEqual(calls, ['inject media/', 'stopCache', 'draw go next:false']);

    xml = hatXml('stop');
    assert.equal(renderer.render('cat', 'hat').textContent, 'stop', 'an edited block is drawn again');
    assert.equal(renderer.render('cat', 'missing'), undefined);
    assert.equal(renderer.render('dog', 'hat'), undefined);

    renderer.dispose();
    assert.equal(calls.at(-1), 'dispose');
    assert.equal(window.document.querySelector('[data-tw-plus-block-image]'), null);
    assert.equal(createBlockImageRenderer(() => undefined, runtime, window.document).render('cat', 'hat'), undefined);
});

function render(t: TestContext, element: React.ReactElement) {
    const container = window.document.createElement('div');
    window.document.querySelector('main').append(container);
    const root = createRoot(container);
    act(() => root.render(element));
    t.after(() => {
        act(() => root.unmount());
        container.remove();
    });
    return container;
}

const image = (label: string) => {
    const svg = window.document.createElementNS(svgNamespace, 'svg');
    svg.dataset.drawn = label;
    return svg as SVGSVGElement;
};

test('a block image stands in its label until the host draws it', t => {
    const container = render(t, React.createElement('div', null,
        React.createElement(BlockImage, {targetId: 'cat', blockId: 'hat', label: 'when green flag clicked',
            getBlockImage: (targetId: string, blockId: string) => image(targetId + '/' + blockId)}),
        React.createElement(BlockImage, {targetId: 'cat', blockId: 'hat', label: 'when green flag clicked'})));
    const [drawn, missing] = [...container.querySelectorAll('.tw-block-image')];
    assert.equal(drawn.querySelector('svg').dataset.drawn, 'cat/hat');
    assert.equal(drawn.getAttribute('aria-label'), 'when green flag clicked');
    assert.equal((drawn as HTMLElement).hidden, false);
    assert.equal((missing as HTMLElement).hidden, true);
    assert.equal(container.textContent, 'when green flag clicked', 'only the undrawn image falls back to text');
});

test('hats are named the same way in every pane', () => {
    assert.equal(hatName('ja', 'event_whenflagclicked'), '緑の旗が押されたとき');
    assert.equal(hatName('ja', 'event_whenbroadcastreceived', 'go'), '「go」を受け取ったとき');
    assert.equal(hatName('en', 'control_start_as_clone'), 'when I start as a clone');
    assert.equal(hatName('en', 'pen_unknown_hat'), 'pen unknown hat');
});

test('the message diagram draws the hats that sending scripts start with', t => {
    const use = (patch: object) => ({
        direction: 'send', id: 'go', fieldValue: 'go', name: 'go', wait: false, key: 'go',
        targetId: 'cat', targetName: 'Cat', isStage: false, blockId: 'send', opcode: 'event_broadcast',
        scriptId: 'flag', scriptOpcode: 'event_whenflagclicked', ...patch
    });
    const sent = use({});
    const received = use({direction: 'receive', blockId: 'receive', scriptId: 'receive',
        scriptOpcode: 'event_whenbroadcastreceived', scriptMessageName: 'go'});
    const drawn: string[] = [];
    const container = render(t, React.createElement(SpriteMessagePane, {
        kind: 'messages', locale: 'ja', editable: true, onOpen() {},
        data: {
            targetId: 'cat', isStage: false, sends: [sent], receives: [received], elsewhere: [],
            messages: [{key: 'go', id: 'go', name: 'go', status: 'both', sends: [sent], receives: [received]}],
            getBlockImage: (targetId: string, blockId: string) => {
                drawn.push(targetId + '/' + blockId);
                return image(blockId);
            }
        }
    }));
    const images = [...container.querySelectorAll('[role="tabpanel"]:not([hidden]) .tw-sprite-messages__sources .tw-block-image')];
    assert.deepEqual(images.map(node => [node.querySelector('svg')?.dataset.drawn, node.getAttribute('aria-label')]),
        [['flag', '緑の旗が押されたとき']]);
    assert.deepEqual([...new Set(drawn)], ['cat/flag'], 'receivers are named alone, without their hats');
});
