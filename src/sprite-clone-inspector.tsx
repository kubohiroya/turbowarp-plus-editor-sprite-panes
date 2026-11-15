import React from 'react';
import {SpriteAssetPane, type SpriteVariable, type SpriteVariablePaneProps} from './sprite-asset-pane.tsx';
import {readSpriteVariable, writeSpriteVariableValue, type SpriteVariableEdit, type SpriteVariableEditError} from '@kubohiroya/turbowarp-plus-editor-project-model/sprite-variable-edit';
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
    createVariable(id: string, name: string, type: '' | 'list', isCloud: false): void;
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
        removed: 'クローンが消えたため、元のスプライトに戻りました。',
        actors: 'アクターを切り替える', chooseActor: 'アクターを選ぶ', actorPlaceholder: 'アクターを選ぶ…',
        actorSelected: (name: string) => `アクター「${name}」を編集中`
    },
    en: {
        navigation: 'Switch clones', original: 'Original sprite', count: (n: number) => `${n} clones`,
        clone: (n: number) => `Clone ${n}`, selected: (n: number) => `Editing clone ${n}`,
        previous: 'Previous clone', next: 'Next clone', choose: 'Choose clone number',
        temporary: 'Property and variable value edits apply only to this run',
        removed: 'The clone disappeared. The original sprite is selected.',
        actors: 'Switch actors', chooseActor: 'Choose actor', actorPlaceholder: 'Choose an actor…',
        actorSelected: (name: string) => `Editing actor "${name}"`
    }
};
const textFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;

/** The original owns local variable definitions. Running clones store their values separately. */
export function editClonedSpriteVariable(vm: SpriteCloneVm, targetId: string, edit: SpriteVariableEdit,
    apply: () => SpriteVariableEditError | void) {
    const original = vm.runtime.getTargetById(targetId);
    if (!original?.isOriginal || original.isStage || original.sprite.clones.length < 2) return apply();
    const oldIds = edit.type === 'create' ? new Set(Object.keys(original.variables)) : undefined;
    const error = apply();
    if (error) return error;
    const id = edit.type === 'create' ?
        Object.keys(original.variables).find(id => !oldIds.has(id)) : edit.id;
    if (!id) return;
    const definition = original.variables[id];
    for (const clone of original.sprite.clones) {
        if (clone.isOriginal) continue;
        if (edit.type === 'create' && (definition?.type === '' || definition?.type === 'list')) {
            clone.createVariable(id, definition.name, definition.type, false);
        } else if (clone.variables[id]?.type === '') {
            if (edit.type === 'delete' && !definition) delete clone.variables[id];
            if (edit.type === 'rename' && definition?.type === '') clone.variables[id].name = definition.name;
        }
    }
}

/**
 * A sprite-local variable that names the actor a clone plays. TurboWarp Kamishibai runs several
 * actors as clones of one sprite and tells them apart by this variable.
 */
export const cloneActorNameVariable = 'actorName';

/** The actor name a clone holds, or null when it holds none. */
export function cloneActorName(target: Pick<Target, 'variables'>): string | null {
    for (const variable of Object.values(target.variables ?? {})) {
        if (variable?.type !== '' || variable.name !== cloneActorNameVariable) continue;
        const value = typeof variable.value === 'string' ? variable.value.trim() : '';
        return value || null;
    }
    return null;
}

function readClone(target: Target) {
    const {id, x, y, size, direction, visible, rotationStyle} = target;
    const properties: Properties = {name: target.getName(), x, y, size, direction, visible, rotationStyle};
    const variables = Object.values(target.variables).flatMap(variable => readSpriteVariable(variable) ?? []);
    return {id, properties, variables};
}

function createView(vm: SpriteCloneVm, targetId: string) {
    const {runtime} = vm;
    const listeners = new Set<Listener>();
    let ids: string[] = [];
    let names: (string | null)[] = [];
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
    function readNames() {
        const next = ids.map(id => {
            const target = runtime.getTargetById(id);
            return target ? cloneActorName(target) : null;
        });
        const changed = next.length !== names.length || next.some((name, index) => name !== names[index]);
        if (changed) names = next;
        return changed;
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
        const changedNames = readNames();
        const changedSelection = readSelection();
        if (changed || changedNames || changedSelection) notify();
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
        if (!selectedId && !ids.length) return;
        const now = Date.now();
        if (now - lastRead < 100) return;
        lastRead = now;
        // A clone usually sets its actor name just after it is created, so names are read as it runs.
        const changedNames = readNames();
        if (readSelection() || changedNames) notify();
    };
    const events = ['targetWasCreated', 'targetWasRemoved', 'PROJECT_STOP_ALL', 'PROJECT_CHANGED'];
    refreshTargets();
    return {
        snapshot: () => ({ids, names, selectedId, removed, clone}),
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
            if (target && writeSpriteVariableValue(vm, id, variableId, value) && readSelection()) notify();
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

/** Option labels: the actor name, told apart by clone number when two clones share it. */
export function actorLabels(names: readonly (string | null)[], text: Pick<typeof labels.ja, 'clone'>) {
    const counts = new Map<string, number>();
    for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    return names.map((name, index) => !name ? text.clone(index + 1) :
        counts.get(name) > 1 ? `${name} (${text.clone(index + 1)})` : name);
}

export function SpriteClonePagination(props: ViewProps) {
    const view = useCloneView(props);
    const state = view?.snapshot();
    if (!state?.ids.length) return null;
    const {ids, names, selectedId} = state;
    const text = textFor(props.locale);
    const index = selectedId ? ids.indexOf(selectedId) : -1;

    if (names.some(Boolean)) {
        const labels = actorLabels(names, text);
        return <nav className="tw-sprite-clone-pages" aria-label={text.actors}>
            <button type="button" className="tw-sprite-clone-pages__original"
                aria-current={selectedId === null ? 'true' : undefined} onClick={() => view.select(null)}>{text.original}</button>
            <select className="tw-sprite-clone-pages__actors" aria-label={text.chooseActor} value={selectedId ?? ''}
                onChange={event => view.select(event.currentTarget.value || null)}>
                {index < 0 && <option value="" disabled>{text.actorPlaceholder}</option>}
                {ids.map((id, offset) => <option key={id} value={id}>{labels[offset]}</option>)}
            </select>
        </nav>;
    }

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
    const {variables: originalVariables, onEdit, temporaryVariables, onOpenFunction, getBlockImage} = props.children.props;
    const byId = new Map(originalVariables.map(variable => [variable.id, variable]));
    const variables = clone.variables.map(variable => ({
        ...variable,
        accesses: byId.get(variable.id)?.accesses,
        monitor: byId.get(variable.id)?.monitor
    }));
    return <SpriteAssetPane kind="variables" key={clone.id} targetId={clone.id}
        locale={props.locale} editable={props.editable} clone properties={clone.properties} variables={variables}
        onEdit={onEdit} temporaryVariables={temporaryVariables} onOpenFunction={onOpenFunction}
        getBlockImage={getBlockImage}
        onWriteProperties={view.writeProperties} onWrite={(id, value) => view.writeVariable(clone.id, id, value)}
        notice={<p className="tw-sprite-clone-notice" role="status">
            <strong>{state.names[state.ids.indexOf(clone.id)] ?
                text.actorSelected(state.names[state.ids.indexOf(clone.id)]) :
                text.selected(state.ids.indexOf(clone.id) + 1)}</strong><span>{text.temporary}</span>
        </p>} />;
}
