import React from 'react';
import {PenIcon} from './pen-icon.tsx';
import {observeTileNameTitles} from './native-tile-title.ts';
import {SpritePropertiesPanel, type SpritePropertiesPanelProps} from './sprite-properties.tsx';
import {cloudVariablePrefix, type SpriteVariableEdit, type SpriteVariableEditError, type SpriteVariableValue, type SpriteListItem} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';

interface NativeAssetPanelProps {
    children?: React.ReactNode;
    buttons: readonly {title: string; img: string; onClick(): void}[];
    items: readonly {dragPayload?: object; name: string; url?: string; details?: React.ReactNode}[];
    isRtl?: boolean;
    listActions?: React.ElementType;
    selectedItemIndex: number;
    onItemClick(index: number): void;
}

interface NativeSelectorProps extends NativeAssetPanelProps {
    wrapperAttributes?: Record<string, string>;
    listRef?(node: HTMLElement | null): void;
    onListScroll?(event: React.UIEvent<HTMLElement>): void;
    draggingType?: null;
    onAddSortable?(): void;
    onRemoveSortable?(): void;
}

export type SpriteAssetKind = 'costumes' | 'sounds';

export interface SpriteAssetPreviewItem {
    asset: object;
    name: string;
    imageUrl?: string;
    buffer?: AudioBuffer;
    duration?: number;
}

export type NativeAssetSelector = React.ComponentType<NativeSelectorProps>;
export type NativeAssetPanelRenderer = (props: NativeAssetPanelProps, options: {
    panelAttributes: Record<string, string>;
    detailAttributes: Record<string, string>;
    renderSelector(Component: NativeAssetSelector, props: NativeSelectorProps): React.ReactNode;
}) => React.ReactNode;

export type SpriteAssetLayout = (items: readonly SpriteAssetPreviewItem[], index: number,
    detail: React.ReactNode, scrollTop: number) => React.ReactNode;

interface PanelState {
    rememberLayout(render: SpriteAssetLayout): void;
    getScrollTop(): number;
    rememberScrollTop(position: number): void;
}

const noop = () => {};

function NativeAssetPanelSurface({render, panel, kind, state, previewSelector, scrollTop}: {
    render: NativeAssetPanelRenderer;
    panel: NativeAssetPanelProps;
    kind?: SpriteAssetKind;
    state?: PanelState;
    previewSelector?: NativeAssetSelector;
    scrollTop?: number;
}) {
    const list = React.useRef<HTMLElement | null>(null);
    const stopObserving = React.useRef<() => void>();
    const setList = React.useCallback((node: HTMLElement | null) => {
        stopObserving.current?.();
        list.current = node;
        stopObserving.current = observeTileNameTitles(node);
    }, []);
    React.useLayoutEffect(() => {
        const position = state?.getScrollTop() ?? scrollTop;
        if (list.current && position !== undefined) list.current.scrollTop = position;
    }, [state, scrollTop]);
    return render(panel, {
        panelAttributes: {'data-layout-asset-panel': kind ?? ''},
        detailAttributes: {'data-layout-asset-detail': ''},
        renderSelector(Component, props) {
            const selectorProps = {...props, listRef: setList, wrapperAttributes: {'data-layout-asset-list': ''}};
            if (previewSelector) {
                return <div {...{inert: ''}} style={{display: 'contents'}}>
                    {React.createElement(previewSelector, {
                        ...selectorProps, draggingType: null, onAddSortable: noop, onRemoveSortable: noop
                    })}
                </div>;
            }
            return <Component {...selectorProps} onListScroll={event => {
                state?.rememberScrollTop(event.currentTarget.scrollTop);
            }} />;
        }
    });
}

export function NativeAssetPanel({render, previewSelector, panel, kind, locale = 'en', state}: {
    render: NativeAssetPanelRenderer;
    previewSelector: NativeAssetSelector;
    panel: NativeAssetPanelProps;
    kind?: SpriteAssetKind;
    locale?: string;
    state?: PanelState;
}) {
    const {items, buttons, isRtl, listActions} = panel;
    React.useLayoutEffect(() => {
        if (!state) return;
        const previousItems = new Map(items.map(item => [item.dragPayload, item]));
        const readOnlyButtons = buttons.map(({title, img}) => ({title, img, onClick: noop}));
        state.rememberLayout((previewItems, selectedItemIndex, detail, scrollTop) => <NativeAssetPanelSurface
            render={render} kind={kind} previewSelector={previewSelector} scrollTop={scrollTop} panel={{
                isRtl, listActions, selectedItemIndex, buttons: readOnlyButtons,
                onItemClick: noop, children: detail,
                items: previewItems.map(item => {
                    const previous = previousItems.get(item.asset);
                    return {name: item.name, url: item.imageUrl || previous?.url, details: previous?.details};
                })
            }} />);
    }, [state, render, previewSelector, items, buttons, isRtl, listActions, kind]);
    const activePanel = kind === 'sounds' ? {
        ...panel,
        children: <>
            {items.length === 0 && <p className="tw-sprite-media__empty">{labelsFor(locale).emptySounds}</p>}
            {panel.children}
        </>
    } : panel;
    return <NativeAssetPanelSurface render={render} panel={activePanel} kind={kind} state={state} />;
}

export interface SpriteMediaAsset {
    /** Host identity for this item within its target, independent of the list order. */
    id: string;
    name: string;
    imageUrl?: string;
    duration?: number;
    /** Downsampled waveform magnitudes in the range from zero to one. */
    peaks?: readonly number[];
}

export interface SpriteVariable {
    id: string;
    name: string;
    value: SpriteVariableValue;
    scope?: 'local' | 'global';
    isCloud?: boolean;
    monitor?: {visible: boolean; setVisible(visible: boolean): void};
    accesses?: {read: number; write: number; open(access: 'read' | 'write'): void};
}

interface PaneProps {
    locale: string;
    editable: boolean;
}

export interface SpriteMediaPaneProps extends PaneProps {
    kind: 'costumes' | 'sounds';
    items: readonly SpriteMediaAsset[];
    selectedId: string | null;
    detailOnly?: boolean;
    onSelect(id: string): void;
    /** Optional host surface. It must honor editable without unmounting its layout. */
    renderEditor?(selected: SpriteMediaAsset, editable: boolean): React.ReactNode;
}

export interface SpriteVariablePaneProps extends PaneProps {
    kind: 'variables';
    variables: readonly SpriteVariable[];
    properties?: SpritePropertiesPanelProps['values'];
    targetId?: string;
    clone?: boolean;
    global?: {canAddCloudVariable: boolean};
    notice?: React.ReactNode;
    onWriteProperties?: SpritePropertiesPanelProps['onChange'];
    onWrite(id: string, value: SpriteVariable['value']): void;
    onEdit?(edit: SpriteVariableEdit): SpriteVariableEditError | void;
}

export type SpriteAssetPaneProps = SpriteMediaPaneProps | SpriteVariablePaneProps;

const english = {
    costumes: 'Costumes', sounds: 'Sounds', name: 'Variable name', value: 'Value',
    type: 'Type', variable: 'Variable', list: 'List',
    editList: 'Edit', editListTitle: 'Edit list: %1', emptyList: 'Empty list',
    listItem: 'Item %1', moveUp: 'Move item %1 up', moveDown: 'Move item %1 down',
    deleteItem: 'Delete item %1', addItem: 'Add item', save: 'Save',
    moreItems: '+%1',
    spriteVariables: 'Sprite Variables', globalVariables: 'Global Variables',
    spriteDescription: 'These variables belong to this sprite.',
    globalDescription: 'The stage and all sprites can use these variables.',
    cloneDescription: 'Each clone has its own values for its sprite variables.',
    showOnStage: 'Show %1 on the stage',
    showOriginalOnStage: 'Show the original sprite’s %1 on the stage',
    stageColumn: 'Stage',
    local: 'Sprite', global: 'Project', cloudVariable: 'Cloud variable', emptyCostumes: 'No costumes', emptySounds: 'No sounds',
    emptyVariables: 'No variables or lists', selectCostume: 'Select a costume', selectSound: 'Select a sound',
    imageUnavailable: 'Image unavailable', waveformUnavailable: 'Waveform unavailable', waveform: 'Waveform',
    seconds: 's', read: 'Read', write: 'Write',
    actions: 'Actions', addSprite: 'Add a new sprite variable', addGlobal: 'Add a new global variable',
    rename: 'Rename variable', delete: 'Delete variable',
    cancel: 'Cancel', ok: 'OK', close: 'Close', confirmDelete: 'Delete',
    newSprite: 'New Sprite Variable', newGlobal: 'New Global Variable',
    renameTitle: 'Rename Variable', deleteTitle: 'Delete Variable', newName: 'New variable name:',
    deletePrompt: 'Delete variable “%1”?', emptyName: 'Enter a variable name.',
    duplicateName: 'A variable with this name is already in scope.',
    inUse: 'This variable is used by a block. Remove its uses before deleting it.',
    unavailable: 'This variable or target is no longer available.',
    sharedDefinition: 'This change applies to the original sprite and all its clones.',
    cloudLimit: 'This project cannot have any more cloud variables.'
};
const japanese: typeof english = {
    costumes: 'コスチューム', sounds: '音', name: '変数名', value: '値',
    type: '種類', variable: '変数', list: 'リスト',
    editList: '編集', editListTitle: 'リストを編集：%1', emptyList: '空のリスト',
    listItem: '項目 %1', moveUp: '項目 %1 を上に移動', moveDown: '項目 %1 を下に移動',
    deleteItem: '項目 %1 を削除', addItem: '項目を追加', save: '保存',
    moreItems: '+%1',
    spriteVariables: 'スプライト変数', globalVariables: 'グローバル変数',
    spriteDescription: 'このスプライト専用の変数です。',
    globalDescription: 'この背景とすべてのスプライトで参照・利用できる変数です。',
    cloneDescription: 'クローンのスプライト変数はそれぞれのクローンごとに別々の値を持ちます。',
    showOnStage: '「%1」をステージに表示',
    showOriginalOnStage: '元のスプライトの「%1」をステージに表示',
    stageColumn: 'ステージ',
    local: 'スプライト', global: '作品', cloudVariable: 'クラウド変数', emptyCostumes: 'コスチュームがありません', emptySounds: '音がありません',
    emptyVariables: '変数やリストがありません', selectCostume: 'コスチュームを選択してください', selectSound: '音を選択してください',
    imageUnavailable: '画像を表示できません', waveformUnavailable: '波形を表示できません', waveform: '波形',
    seconds: '秒', read: '読み取り', write: '変更',
    actions: '操作', addSprite: '新しいスプライト変数を追加', addGlobal: '新しいグローバル変数を追加',
    rename: '変数名を変更', delete: '変数を削除',
    cancel: 'キャンセル', ok: 'OK', close: '閉じる', confirmDelete: '削除',
    newSprite: '新しいスプライト変数', newGlobal: '新しいグローバル変数',
    renameTitle: '変数名を変更', deleteTitle: '変数を削除', newName: '新しい変数名:',
    deletePrompt: '変数「%1」を削除しますか？', emptyName: '変数名を入力してください。',
    duplicateName: '同じ名前の変数がすでにあります。',
    inUse: 'この変数はブロックで使用中です。削除するには、先に参照を外してください。',
    unavailable: 'この変数または編集対象を操作できなくなりました。',
    sharedDefinition: 'この変更は元のスプライトとすべてのクローンに反映されます。',
    cloudLimit: 'この作品にはこれ以上クラウド変数を追加できません。'
};
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;

function Waveform({name, peaks, label}: {name: string; peaks: readonly number[]; label: string}) {
    const path = peaks.map((sample, index) => {
        const x = (index + 0.5) * 100 / peaks.length;
        const magnitude = Number.isFinite(sample) ? Math.max(0, Math.min(sample, 1)) : 0;
        const y = magnitude * 49;
        return 'M' + x + ' ' + (50 - y) + 'V' + (50 + y);
    }).join(' ');
    return <svg className="tw-sprite-media__waveform" viewBox="0 0 100 100" preserveAspectRatio="none"
        role="img" aria-label={label + ': ' + name}>
        <path d="M0 50H100" vectorEffect="non-scaling-stroke" className="tw-sprite-media__axis" />
        <path d={path} vectorEffect="non-scaling-stroke" className="tw-sprite-media__peaks" />
    </svg>;
}

function MediaPane({kind, items, selectedId, onSelect, renderEditor, editable, locale, detailOnly}: SpriteMediaPaneProps) {
    const labels = labelsFor(locale);
    const isSound = kind === 'sounds';
    const selected = items.find(asset => asset.id === selectedId);
    const duration = selected?.duration;
    return <section className={detailOnly ? 'tw-sprite-media tw-sprite-media--detail' : 'tw-sprite-media'} aria-label={labels[kind]}>
        {!detailOnly && <ul className="tw-sprite-media__list" aria-label={labels[kind]}>
            {items.map(asset => <li key={asset.id}>
                <button type="button" className="tw-sprite-media__item" title={asset.name} aria-current={asset.id === selectedId || undefined}
                    aria-disabled={!editable || undefined} tabIndex={editable ? 0 : -1} onClick={() => {
                        if (editable) onSelect(asset.id);
                    }}>
                    {asset.imageUrl ? <img src={asset.imageUrl} alt="" className="tw-sprite-media__thumbnail" /> :
                        <span className="tw-sprite-media__symbol" aria-hidden="true">{isSound ? '♪' : '◫'}</span>}
                    <span className="tw-sprite-media__name">{asset.name}</span>
                </button>
            </li>)}
        </ul>}
        <div className="tw-sprite-media__detail">
            {selected ? <>
                <h3 className="tw-sprite-media__title">{selected.name}</h3>
                <div className="tw-sprite-media__surface">
                    {renderEditor?.(selected, editable) ?? (isSound ?
                        (selected.peaks?.length ? <Waveform peaks={selected.peaks} name={selected.name} label={labels.waveform} /> :
                            <p>{labels.waveformUnavailable}</p>) :
                        (selected.imageUrl ? <img src={selected.imageUrl} alt={selected.name} className="tw-sprite-media__preview" /> :
                            <p>{labels.imageUnavailable}</p>))}
                </div>
                {isSound && Number.isFinite(duration) && duration >= 0 &&
                    <p className="tw-sprite-media__duration">{new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(duration)} {labels.seconds}</p>}
            </> : <p>{items.length ? (isSound ? labels.selectSound : labels.selectCostume) :
                (isSound ? labels.emptySounds : labels.emptyCostumes)}</p>}
        </div>
    </section>;
}

const isList = (value: SpriteVariableValue): value is readonly SpriteListItem[] => Array.isArray(value);

function VariableField({variable, editable, onWrite}: {
    variable: SpriteVariable & {value: string | number};
    editable: boolean;
    onWrite: SpriteVariablePaneProps['onWrite'];
}) {
    const [text, setText] = React.useState<string | null>(null);
    const pending = React.useRef<{text: string; variable: SpriteVariable; write: typeof onWrite} | null>(null);
    const finish = (save: boolean) => {
        const draft = pending.current;
        if (!draft) return;
        pending.current = null;
        setText(null);
        if (!save || draft.text === String(variable.value)) return;
        const number = Number(draft.text);
        const value = typeof draft.variable.value === 'number' && draft.text.trim() && Number.isFinite(number) ?
            number : draft.text;
        draft.write(draft.variable.id, value);
    };

    React.useLayoutEffect(() => {
        // A click can change the active pane before the old input receives blur.
        if (!editable) finish(true);
    }, [editable]);

    return <input className="tw-sprite-variables__input" aria-label={variable.name} data-variable-id={variable.id} readOnly={!editable}
        tabIndex={editable ? 0 : -1} value={text ?? String(variable.value)}
        onChange={event => {
            if (!editable) return;
            const next = event.currentTarget.value;
            pending.current = {text: next, variable, write: onWrite};
            setText(next);
        }}
        onBlur={() => finish(true)}
        onKeyDown={event => {
            if (!editable || event.nativeEvent.isComposing) return;
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === 'Enter');
        }} />;
}

const variableName = (variable: SpriteVariable) => variable.isCloud && variable.name.startsWith(cloudVariablePrefix) ?
    variable.name.slice(cloudVariablePrefix.length) : variable.name;

type VariableLabels = ReturnType<typeof labelsFor>;

const iconProps = {viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false} as const;
const PlusIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon"><path d="M8 3.5v9M3.5 8h9" /></svg>;
const TrashIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon">
    <path d="M2.8 4.3h10.4M6.3 4.3V2.8h3.4v1.5M4.2 4.3l.7 8.9h6.2l.7-8.9M6.8 6.8v4.1M9.2 6.8v4.1" />
</svg>;
const CloseIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>;

let nextDialogId = 0;

/**
 * IDs for one dialog's title and input. React's own ID hook arrived in React 18, but the package
 * supports React 16.14 (see peerDependencies), and the Editor mounts this pane in the GUI's React 16.
 */
function useDialogIds() {
    const [ids] = React.useState(() => {
        const id = 'tw-sprite-variables-dialog-' + ++nextDialogId;
        return {titleId: id + '-title', inputId: id + '-input'};
    });
    return ids;
}

function VariableModal({title, labels, onClose, children, list}: React.PropsWithChildren<{
    title: string;
    labels: VariableLabels;
    onClose(): void;
    list?: boolean;
}>) {
    const dialog = React.useRef<HTMLDialogElement>(null);
    const {titleId} = useDialogIds();
    React.useLayoutEffect(() => {
        const node = dialog.current;
        if (!node) return;
        if (typeof node.showModal === 'function') {
            if (!node.open) node.showModal();
        } else node.setAttribute('open', '');
        // React sets autoFocus before the dialog opens.
        const initial = node.querySelector<HTMLElement>('[data-initial-focus]');
        initial?.focus();
        if (initial instanceof HTMLInputElement) initial.select();
        return () => {
            if (node.open && typeof node.close === 'function') node.close();
        };
    }, []);
    return <dialog ref={dialog}
        className={list ? 'tw-sprite-variables__dialog tw-sprite-variables__dialog--list' : 'tw-sprite-variables__dialog'}
        aria-labelledby={titleId}
        onCancel={event => {
            event.preventDefault();
            onClose();
        }}
        onKeyDown={event => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        }}
        onClick={event => {
            if (event.target === event.currentTarget) onClose();
        }}>
        <div className="tw-sprite-variables__dialog-header">
            <h2 id={titleId} className="tw-sprite-variables__dialog-title">{title}</h2>
            <button type="button" className="tw-sprite-variables__dialog-close" aria-label={labels.close} onClick={onClose}>
                <CloseIcon />
            </button>
        </div>
        {children}
    </dialog>;
}

function VariableDialog({action, labels, targetName, error, onSubmit, onClose, clone, global}: {
    action: SpriteVariableEdit;
    labels: VariableLabels;
    targetName: string;
    clone?: boolean;
    global?: SpriteVariablePaneProps['global'];
    error?: SpriteVariableEditError;
    onSubmit(event: React.FormEvent<HTMLFormElement>): void;
    onClose(): void;
}) {
    const {inputId} = useDialogIds();
    const isDelete = action.type === 'delete';
    const title = action.type === 'create' ? (global ? labels.newGlobal : labels.newSprite) :
        action.type === 'rename' ? labels.renameTitle : labels.deleteTitle;
    return <VariableModal title={title} labels={labels} onClose={onClose}>
        <form className="tw-sprite-variables__dialog-body" onSubmit={onSubmit}>
            {isDelete ? <p className="tw-sprite-variables__dialog-message">{labels.deletePrompt.replace('%1', targetName)}</p> : <>
                <label className="tw-sprite-variables__dialog-label" htmlFor={inputId}>{labels.newName}</label>
                <input id={inputId} className="tw-sprite-variables__dialog-input" name="name" defaultValue={action.name}
                    autoComplete="off" spellCheck={false} data-initial-focus="" />
            </>}
            {action.type === 'create' && global && <>
                <label className="tw-sprite-variables__cloud-option">
                    <input type="checkbox" name="isCloud" disabled={!global.canAddCloudVariable} />
                    {labels.cloudVariable}
                </label>
                {!global.canAddCloudVariable && <p>{labels.cloudLimit}</p>}
            </>}
            {clone && <p>{labels.sharedDefinition}</p>}
            {error && <p role="alert" className="tw-sprite-variables__dialog-error">{labels[error]}</p>}
            <div className="tw-sprite-variables__dialog-buttons tw-plus-dialog-actions">
                <button type="button" className="tw-sprite-variables__dialog-button" onClick={onClose}
                    data-dialog-action="cancel" data-initial-focus={isDelete ? '' : undefined}>{labels.cancel}</button>
                <button type="submit" className="tw-sprite-variables__dialog-button tw-sprite-variables__dialog-button--ok"
                    data-dialog-action={isDelete ? 'delete' : 'confirm'}>
                    {isDelete ? labels.confirmDelete : labels.ok}
                </button>
            </div>
        </form>
    </VariableModal>;
}

const listItemValue = ({original, text}: {original: SpriteListItem; text: string}): SpriteListItem => {
    if (text === String(original)) return original;
    const number = Number(text);
    return typeof original === 'number' && text.trim() && Number.isFinite(number) ? number : text;
};

function ListValueDialog({name, value, labels, onSave, onClose}: {
    name: string;
    value: readonly SpriteListItem[];
    labels: VariableLabels;
    onSave(items: SpriteListItem[]): void;
    onClose(): void;
}) {
    const [initial] = React.useState(() => value.map((original, id) => ({id, original, text: String(original)})));
    const [items, setItems] = React.useState(initial);
    const nextId = React.useRef(initial.length);
    const focusId = React.useRef<number | null>(null);
    const form = React.useRef<HTMLFormElement>(null);
    React.useLayoutEffect(() => {
        if (focusId.current === null) return;
        const input = form.current?.querySelector<HTMLElement>(`[data-list-item="${focusId.current}"]`);
        (input ?? form.current?.querySelector<HTMLElement>('[data-add-item]'))?.focus();
        focusId.current = null;
    }, [items]);
    const move = (index: number, step: number) => {
        const next = items.slice();
        [next[index], next[index + step]] = [next[index + step], next[index]];
        focusId.current = items[index].id;
        setItems(next);
    };
    const remove = (index: number) => {
        const next = items.filter((_, position) => position !== index);
        focusId.current = (next[index] ?? next[index - 1])?.id ?? -1;
        setItems(next);
    };
    const add = () => {
        const id = nextId.current++;
        focusId.current = id;
        setItems([...items, {id, original: '', text: ''}]);
    };
    return <VariableModal list title={labels.editListTitle.replace('%1', name)} labels={labels} onClose={onClose}>
        <form ref={form} className="tw-sprite-variables__list-form" onSubmit={event => {
            event.preventDefault();
            const next = items.map(listItemValue);
            if (next.length !== initial.length || next.some((item, i) => !Object.is(item, initial[i].original))) {
                onSave(next);
            } else onClose();
        }}>
            <div className="tw-sprite-variables__list-scroll">
                {!items.length && <p>{labels.emptyList}</p>}
                <ol className="tw-sprite-variables__list-items">
                    {items.map((item, index) => {
                        const position = String(index + 1);
                        const up = labels.moveUp.replace('%1', position);
                        const down = labels.moveDown.replace('%1', position);
                        const del = labels.deleteItem.replace('%1', position);
                        return <li key={item.id}>
                            <span className="tw-sprite-variables__list-position" aria-hidden="true">{position}</span>
                            <textarea rows={1} className="tw-sprite-variables__dialog-input" data-list-item={item.id}
                                aria-label={labels.listItem.replace('%1', position)} value={item.text}
                                data-initial-focus={index === 0 ? '' : undefined}
                                onChange={event => {
                                    const text = event.currentTarget.value;
                                    setItems(items.map(entry => entry.id === item.id ? {...entry, text} : entry));
                                }} />
                            <button type="button" className="tw-sprite-variables__action" aria-label={up} title={up}
                                disabled={index === 0} onClick={() => move(index, -1)}>
                                <ListArrow />
                            </button>
                            <button type="button" className="tw-sprite-variables__action" aria-label={down} title={down}
                                disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                                <ListArrow down />
                            </button>
                            <button type="button" className="tw-sprite-variables__action" aria-label={del} title={del}
                                onClick={() => remove(index)}><TrashIcon /></button>
                        </li>;
                    })}
                </ol>
            </div>
            <div className="tw-sprite-variables__list-footer">
                <button type="button" className="tw-sprite-variables__action" data-add-item=""
                    data-initial-focus={!items.length ? '' : undefined} onClick={add}><PlusIcon />{labels.addItem}</button>
                <div className="tw-sprite-variables__dialog-buttons tw-plus-dialog-actions">
                    <button type="button" className="tw-sprite-variables__dialog-button" data-dialog-action="cancel"
                        onClick={onClose}>{labels.cancel}</button>
                    <button type="submit" className="tw-sprite-variables__dialog-button tw-sprite-variables__dialog-button--ok"
                        data-dialog-action="confirm">{labels.save}</button>
                </div>
            </div>
        </form>
    </VariableModal>;
}

const ListArrow = ({down}: {down?: boolean}) => <svg {...iconProps} className="tw-sprite-variables__icon">
    <path d={down ? 'M8 3v10m-4-4 4 4 4-4' : 'M8 13V3M4 7l4-4 4 4'} />
</svg>;

function VariableType({list, label}: {list: boolean; label: string}) {
    return <span className="tw-sprite-variables__type" role="img" aria-label={label} title={label}>
        <svg {...iconProps} className="tw-sprite-variables__icon">
            <path d={list ? 'M2.5 2.5h11v10h-11zM3.5 13v1m9-1v1m-10-8h11m-11 3.3h11M7 4.2h2m-2 3.4h2M7 11h2' :
                'M3 6v7h10V6M2 3h12v3H2zM6.5 8.5h3'} />
        </svg>
    </span>;
}

function ListPreview({id, value, editable, labels, onEdit}: {
    id: string;
    value: readonly SpriteListItem[];
    editable: boolean;
    labels: VariableLabels;
    onEdit(): void;
}) {
    return <div className="tw-sprite-variables__list-preview" data-variable-id={id} tabIndex={-1}>
        {value.length ? <ul>{value.slice(0, 5).map((item, index) =>
            <li key={index} title={String(item)}>{String(item)}</li>)}
            {value.length > 5 && <li>{labels.moreItems.replace('%1', String(value.length - 5))}</li>}
        </ul> : <span>{labels.emptyList}</span>}
        {editable && <button type="button" className="tw-sprite-variables__action tw-sprite-variables__list-edit"
            onClick={onEdit}><PenIcon />{labels.editList}</button>}
    </div>;
}

type SortColumn = 'stageColumn' | 'type' | 'name' | 'value' | 'read' | 'write';
type Sort = {column: SortColumn; direction: 'ascending' | 'descending'};

const referenceCount = (variable: SpriteVariable) => (variable.accesses?.read ?? 0) + (variable.accesses?.write ?? 0);

function compareVariables(a: SpriteVariable, b: SpriteVariable, column: SortColumn, collator: Intl.Collator) {
    switch (column) {
    case 'stageColumn': return Number(Boolean(a.monitor?.visible)) - Number(Boolean(b.monitor?.visible));
    case 'type': return Number(isList(a.value)) - Number(isList(b.value));
    case 'name': return collator.compare(variableName(a), variableName(b));
    case 'read':
    case 'write': return (a.accesses?.[column] ?? 0) - (b.accesses?.[column] ?? 0);
    case 'value':
        if (isList(a.value)) return isList(b.value) ? a.value.length - b.value.length : 1;
        if (isList(b.value)) return -1;
        if (typeof a.value === 'number' && typeof b.value === 'number') return a.value - b.value;
        if (typeof a.value !== typeof b.value) return typeof a.value === 'number' ? -1 : 1;
        return collator.compare(String(a.value), String(b.value));
    }
}

function VariablePane({variables, editable, onWrite, onEdit, locale, properties, targetId, onWriteProperties,
    clone, notice, global}: SpriteVariablePaneProps) {
    const labels = labelsFor(locale);
    const [action, setAction] = React.useState<SpriteVariableEdit | null>(null);
    const [error, setError] = React.useState<SpriteVariableEditError | undefined>();
    const [listId, setListId] = React.useState<string | null>(null);
    const [sort, setSort] = React.useState<Sort | null>(null);
    const collator = React.useMemo(() => new Intl.Collator(locale || undefined, {numeric: true, sensitivity: 'base'}), [locale]);
    const activeList = variables.find(variable => variable.id === listId && isList(variable.value));
    const listValue = activeList && isList(activeList.value) ? activeList.value : undefined;
    const start = (next: SpriteVariableEdit | null) => {
        setError(undefined);
        setAction(next);
    };
    React.useLayoutEffect(() => {
        if (!editable) start(null);
        if (!editable || !activeList) setListId(null);
    }, [editable, activeList?.id]);
    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!onEdit || !editable || !action) return;
        const form = new FormData(event.currentTarget);
        const result = onEdit(action.type === 'delete' ? action : {
            ...action, name: String(form.get('name') ?? ''),
            ...(action.type === 'create' && global && form.has('isCloud') ? {isCloud: true} : {})
        });
        if (result) setError(result);
        else start(null);
    };
    const selected = action && action.type !== 'create' ? variables.find(variable => variable.id === action.id) : undefined;
    const showAccesses = variables.some(variable => variable.accesses);
    const showMonitors = variables.some(variable => variable.monitor);
    const sorted = sort ? variables.slice().sort((a, b) =>
        (sort.direction === 'ascending' ? 1 : -1) * compareVariables(a, b, sort.column, collator)) : variables;
    const header = (column: SortColumn, className?: string) => {
        const direction = sort?.column === column ? sort.direction : undefined;
        return <th scope="col" className={className} aria-sort={direction}>
            <button type="button" className="tw-sprite-variables__sort"
                onClick={() => setSort({column, direction: direction === 'ascending' ? 'descending' : 'ascending'})}>
                {labels[column]}
                <svg viewBox="0 0 10 16" aria-hidden="true" focusable="false">
                    <path d="M1 6 5 1l4 5Z" data-active={direction === 'ascending'} />
                    <path d="m1 10 4 5 4-5Z" data-active={direction === 'descending'} />
                </svg>
            </button>
        </th>;
    };
    return <section className="tw-sprite-variables" aria-label={global ? labels.globalVariables : labels.spriteVariables}>
        <div className="tw-sprite-variables__scroll">
            {notice}
            {properties && targetId && onWriteProperties &&
                <SpritePropertiesPanel targetId={targetId} values={properties} locale={locale}
                    disabled={!editable} nameReadOnly={clone} onChange={onWriteProperties} />}
            <div className="tw-sprite-variables__intro">
                {!global && <h3>{labels.spriteVariables}</h3>}
                <p>{global ? labels.globalDescription : labels.spriteDescription}</p>
                {clone && <p>{labels.cloneDescription}</p>}
            </div>
            {variables.length ? <table className="tw-sprite-variables__table">
                <thead><tr>
                    {showMonitors && header('stageColumn', 'tw-sprite-variables__monitor')}
                    {header('type', 'tw-sprite-variables__type-cell')}{header('name')}{header('value')}
                    {showAccesses && header('read', 'tw-sprite-variables__references')}
                    {showAccesses && header('write', 'tw-sprite-variables__references')}
                    {onEdit && <th scope="col" className="tw-sprite-variables__actions-cell">{labels.actions}</th>}
                </tr></thead>
                <tbody>{sorted.map(variable => {
                    const {value} = variable;
                    const list = isList(value);
                    const inUse = referenceCount(variable) > 0;
                    const monitorLabel = (clone ? labels.showOriginalOnStage : labels.showOnStage).replace('%1', variableName(variable));
                    return <tr key={variable.id}>
                        {showMonitors && <td className="tw-sprite-variables__monitor">
                            {variable.monitor && <input type="checkbox"
                                aria-label={monitorLabel} title={monitorLabel}
                                checked={variable.monitor.visible} disabled={!editable}
                                onChange={event => variable.monitor.setVisible(event.currentTarget.checked)} />}
                        </td>}
                        <td className="tw-sprite-variables__type-cell">
                            <VariableType list={list} label={list ? labels.list : labels.variable} />
                        </td>
                        <th scope="row">
                            {variableName(variable)}
                            {variable.isCloud && <> <span className="tw-sprite-variables__cloud" role="img"
                                aria-label={labels.cloudVariable} title={labels.cloudVariable}>☁︎</span></>}
                            {variable.scope && <span className="tw-sprite-variables__scope">{labels[variable.scope]}</span>}
                        </th>
                        <td>{list ? <ListPreview id={variable.id} value={value} editable={editable} labels={labels}
                            onEdit={() => setListId(variable.id)} /> :
                            <VariableField variable={{...variable, value}} editable={editable} onWrite={onWrite} />}</td>
                        {showAccesses && (['read', 'write'] as const).map(access => {
                            const counts = variable.accesses;
                            return <td key={access} className="tw-sprite-variables__references">
                                {counts && (editable ? <a href="#" className="tw-sprite-variables__reference-link"
                                    aria-label={`${variableName(variable)}: ${labels[access]} ${counts[access]}`}
                                    onClick={event => {
                                        event.preventDefault();
                                        counts.open(access);
                                    }}>{counts[access]}</a> : counts[access])}
                            </td>;
                        })}
                        {onEdit && <td className="tw-sprite-variables__actions-cell">
                            {!list && <div className="tw-sprite-variables__actions">
                                <button type="button" className="tw-sprite-variables__action" disabled={!editable}
                                    onClick={() => start({type: 'rename', id: variable.id, name: variableName(variable)})}>
                                    <PenIcon />{labels.rename}
                                </button>
                                <button type="button" className="tw-sprite-variables__action tw-sprite-variables__action--delete"
                                    disabled={!editable || inUse} title={inUse ? labels.inUse : undefined}
                                    onClick={() => start({type: 'delete', id: variable.id})}>
                                    <TrashIcon />{labels.delete}
                                </button>
                            </div>}
                        </td>}
                    </tr>;
                })}</tbody>
            </table> : <p>{labels.emptyVariables}</p>}
        </div>
        {onEdit && <button type="button" className="tw-sprite-variables__add" disabled={!editable}
            onClick={() => start({type: 'create', name: ''})}>
            <span className="tw-sprite-variables__add-icon"><PlusIcon /></span>
            <span className="tw-sprite-variables__add-label">{global ? labels.addGlobal : labels.addSprite}</span>
        </button>}
        {editable && action && <VariableDialog key={action.type === 'create' ? 'create' : action.type + action.id}
            action={action} labels={labels} error={error} clone={clone} global={global} onSubmit={submit} onClose={() => start(null)}
            targetName={selected ? variableName(selected) : ''} />}
        {editable && activeList && listValue &&
            <ListValueDialog key={activeList.id} name={variableName(activeList)} value={listValue} labels={labels}
                onClose={() => setListId(null)} onSave={items => {
                    if (items.length !== listValue.length || items.some((item, index) => !Object.is(item, listValue[index]))) {
                        onWrite(activeList.id, items);
                    }
                    setListId(null);
                }} />}
    </section>;
}

export function SpriteAssetPane(props: SpriteAssetPaneProps) {
    return props.kind === 'variables' ? <VariablePane {...props} /> : <MediaPane {...props} />;
}
