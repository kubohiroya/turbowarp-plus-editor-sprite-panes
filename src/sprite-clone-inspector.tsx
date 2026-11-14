import React from 'react';
import {SpriteAssetPane, type SpriteVariable, type SpriteVariablePaneProps} from './sprite-asset-pane.tsx';
import type {SpriteVariableEdit, SpriteVariableEditError} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';
import type {SpritePropertiesPanelProps} from './sprite-properties.tsx';

type Properties = NonNullable<SpritePropertiesPanelProps['values']>;
type Listener = () => void;
type CloneVariable = {id: string; name: string; type: string; value: unknown};

interface Target extends Properties {
    id: string;
    isOriginal: boolean;
    isStage: boolean;
    sprite: {clones: readonly Target[]};
    variables: Record<string, CloneVariable>;
    getName(): string;
    postSpriteInfo(patch: Properties): void;
}

export interface SpriteCloneVm {
    _dragTarget?: Target | null;
    runtime: {
        getTargetById(id: string): Target | undefined;
        on(event: string, listener: Listener): void;
        removeListener(event: string, listener: Listener): void;
        requestRedraw(): void;
    };
    setVariableValue(targetId: string, variableId: string, value: SpriteVariable['value']): boolean;
}

const labels = {
    ja: {
        navigation: 'クローンを切り替える', original: '元のスプライト', count: (n: number) => `クローン ${n} 体`,
        clone: (n: number) => `クローン ${n}`, selected: (n: number) => `クローン ${n} を編集中`,
        previous: '前のクローン', next: '次のクローン', choose: 'クローン番号を選ぶ',
        temporary: 'プロパティと変数の値の変更はこの実行中だけ有効',
        removed: 'クローンが消えたため、元のスプライトに戻りました。'
    },
    en: {
        navigation: 'Switch clones', original: 'Original sprite', count: (n: number) => `${n} clones`,
        clone: (n: number) => `Clone ${n}`, selected: (n: number) => `Editing clone ${n}`,
        previous: 'Previous clone', next: 'Next clone', choose: 'Choose clone number',
        temporary: 'Property and variable value edits apply only to this run',
        removed: 'The clone disappeared. The original sprite is selected.'
    }
};
const textFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;

/** The original owns local variable definitions. Running clones store their values separately. */
export function editClonedSpriteVariable(vm: SpriteCloneVm, targetId: string, edit: SpriteVariableEdit,
    apply: () => SpriteVariableEditError | void) {
    const error = apply();
    if (error || edit.type === 'create') return error;
    const original = vm.runtime.getTargetById(targetId);
    if (!original?.isOriginal || original.isStage) return;
    const definition = original.variables[edit.id];
    for (const clone of original.sprite.clones) {
        if (clone.isOriginal || clone.variables[edit.id]?.type !== '') continue;
        if (edit.type === 'delete' && !definition) delete clone.variables[edit.id];
        if (edit.type === 'rename' && definition?.type === '') clone.variables[edit.id].name = definition.name;
    }
}

function readClone(target: Target) {
    const {id, x, y, size, direction, visible, rotationStyle} = target;
    const properties: Properties = {name: target.getName(), x, y, size, direction, visible, rotationStyle};
    const variables: SpriteVariable[] = [];
    for (const variable of Object.values(target.variables)) {
        const {id, name, value, type} = variable;
        if (type === '' && (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')) {
            variables.push({id, name, value: typeof value === 'boolean' ? String(value) : value});
        }
    }
    return {id, properties, variables};
}

function createView(vm: SpriteCloneVm, targetId: string) {
    const {runtime} = vm;
    const listeners = new Set<Listener>();
    let ids: string[] = [];
    let selectedId: string | null = null;
    let removed = false;
    let clone: ReturnType<typeof readClone> | undefined;
    let cloneKey = '';
    let refreshQueued = false;
    let lastRead = -Infinity;

    const notify = () => {for (const listener of listeners) listener();};
    const getSelected = (id: string | null = selectedId) => {
        if (!id || id !== selectedId) return undefined;
        const original = runtime.getTargetById(targetId);
        const target = runtime.getTargetById(id);
        return original?.isOriginal && !original.isStage && target && !target.isOriginal &&
            target.sprite === original.sprite ? target : undefined;
    };
    function readSelection() {
        const target = getSelected();
        const next = target ? readClone(target) : undefined;
        const key = next ? JSON.stringify(next) : '';
        if (key === cloneKey) return false;
        clone = next;
        cloneKey = key;
        return true;
    }
    function refreshTargets() {
        const original = runtime.getTargetById(targetId);
        const next = original?.isOriginal && !original.isStage ? original.sprite.clones
            .filter(target => !target.isOriginal && runtime.getTargetById(target.id) === target).map(target => target.id) : [];
        const changed = ids.length !== next.length || ids.some((id, index) => id !== next[index]);
        if (changed) ids = next;
        if (selectedId && !ids.includes(selectedId)) {
            selectedId = null;
            removed = true;
        }
        const changedSelection = readSelection();
        if (changed || changedSelection) notify();
    }
    const queueRefresh = () => {
        // The VM notifies listeners during creation and disposal, before it updates its target list.
        if (refreshQueued) return;
        refreshQueued = true;
        queueMicrotask(() => {
            refreshQueued = false;
            if (listeners.size) refreshTargets();
        });
    };
    const refreshValues = () => {
        if (!selectedId) return;
        const now = Date.now();
        if (now - lastRead < 100) return;
        lastRead = now;
        if (readSelection()) notify();
    };
    const events = ['targetWasCreated', 'targetWasRemoved', 'PROJECT_STOP_ALL', 'PROJECT_CHANGED'];
    refreshTargets();
    return {
        snapshot: () => ({ids, selectedId, removed, clone}),
        subscribe(listener: Listener) {
            if (!listeners.size) {
                for (const event of events) runtime.on(event, queueRefresh);
                runtime.on('AFTER_EXECUTE', refreshValues);
                refreshTargets();
            }
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                if (listeners.size) return;
                for (const event of events) runtime.removeListener(event, queueRefresh);
                runtime.removeListener('AFTER_EXECUTE', refreshValues);
            };
        },
        select(id: string | null) {
            if (id !== null && !ids.includes(id)) return;
            if (selectedId === id && !removed) return;
            selectedId = id;
            removed = false;
            readSelection();
            notify();
        },
        writeProperties(id: string, {name, ...patch}: Properties) {
            const target = getSelected(id);
            if (!target || (vm._dragTarget && vm._dragTarget !== target)) return;
            if (name !== undefined) return;
            target.postSpriteInfo(patch);
            runtime.requestRedraw();
            if (readSelection()) notify();
        },
        writeVariable(id: string, variableId: string, value: SpriteVariable['value']) {
            const target = getSelected(id);
            if (target?.variables[variableId]?.type !== '') return;
            vm.setVariableValue(id, variableId, value);
            if (readSelection()) notify();
        }
    };
}

type View = ReturnType<typeof createView>;
const CloneViews = React.createContext<((viewId: string, targetId: string) => View) | null>(null);

export function SpriteCloneInspector({vm, children}: {vm: SpriteCloneVm; children: React.ReactNode}) {
    const getView = React.useMemo(() => {
        const views = new Map<string, {targetId: string; view: View}>();
        return (viewId: string, targetId: string) => {
            const current = views.get(viewId);
            if (current?.targetId === targetId) return current.view;
            const view = createView(vm, targetId);
            views.set(viewId, {targetId, view});
            return view;
        };
    }, [vm]);
    return <CloneViews.Provider value={getView}>{children}</CloneViews.Provider>;
}

type ViewProps = {viewId: string; targetId: string; locale: string};

function useCloneView({viewId, targetId}: ViewProps) {
    const getView = React.useContext(CloneViews);
    const view = getView?.(viewId, targetId);
    const [, setVersion] = React.useState(0);
    React.useLayoutEffect(() => {
        if (!view) return;
        const refresh = () => setVersion(version => version + 1);
        const unsubscribe = view.subscribe(refresh);
        refresh();
        return unsubscribe;
    }, [view]);
    return view;
}

export function SpriteClonePagination(props: ViewProps) {
    const view = useCloneView(props);
    const state = view?.snapshot();
    if (!state?.ids.length) return null;
    const {ids, selectedId} = state;
    const text = textFor(props.locale);
    const index = selectedId ? ids.indexOf(selectedId) : -1;

    return <nav className="tw-sprite-clone-pages" aria-label={text.navigation}>
        <button type="button" className="tw-sprite-clone-pages__original"
            aria-current={selectedId === null ? 'true' : undefined} onClick={() => view.select(null)}>{text.original}</button>
        {ids.length <= 5 ? <>
            <span className="tw-sprite-clone-pages__count">{text.count(ids.length)}</span>
            <div className="tw-sprite-clone-pages__numbers">
                {ids.map((id, offset) => <button key={id} type="button" aria-label={text.clone(offset + 1)}
                    aria-current={id === selectedId ? 'true' : undefined} onClick={() => view.select(id)}>
                    {offset + 1}
                </button>)}
            </div>
        </> : <div className="tw-sprite-clone-pages__stepper">
            <button type="button" className="tw-sprite-clone-pages__arrow" aria-label={text.previous}
                title={text.previous} disabled={index <= 0} onClick={() => view.select(ids[index - 1])}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            </button>
            <select aria-label={text.choose} value={selectedId ?? ''} onChange={event => view.select(event.currentTarget.value)}>
                {index < 0 && <option value="" disabled>— / {ids.length}</option>}
                {ids.map((id, offset) => <option key={id} value={id}>{offset + 1} / {ids.length}</option>)}
            </select>
            <button type="button" className="tw-sprite-clone-pages__arrow" aria-label={text.next}
                title={text.next} disabled={index >= ids.length - 1} onClick={() => view.select(ids[index + 1])}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
            </button>
        </div>}
    </nav>;
}

export function SpriteCloneVariables(props: ViewProps & {
    editable: boolean;
    children: React.ReactElement<SpriteVariablePaneProps>;
}) {
    const view = useCloneView(props);
    const state = view?.snapshot();
    const text = textFor(props.locale);
    if (!state?.clone) return <>
        {state?.removed && <p className="tw-sprite-clone-notice" role="status">{text.removed}</p>}
        {props.children}
    </>;
    const clone = state.clone;
    const {variables: originalVariables, onEdit} = props.children.props;
    const byId = new Map(originalVariables.map(variable => [variable.id, variable]));
    const variables = clone.variables.map(variable => ({
        ...variable,
        accesses: byId.get(variable.id)?.accesses
    }));
    return <SpriteAssetPane kind="variables" key={clone.id} targetId={clone.id}
        locale={props.locale} editable={props.editable} clone properties={clone.properties} variables={variables}
        onEdit={onEdit}
        onWriteProperties={view.writeProperties} onWrite={(id, value) => view.writeVariable(clone.id, id, value)}
        notice={<p className="tw-sprite-clone-notice" role="status">
            <strong>{text.selected(state.ids.indexOf(clone.id) + 1)}</strong><span>{text.temporary}</span>
        </p>} />;
}
