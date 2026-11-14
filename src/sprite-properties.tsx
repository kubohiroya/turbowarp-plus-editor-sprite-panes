import React, {useRef, useState} from 'react';

type RotationStyle = 'all around' | 'left-right' | "don't rotate";
type SpriteProperties = {name: string; x: number; y: number; size: number; direction: number; visible: boolean;
    rotationStyle: RotationStyle};

export interface SpritePropertiesPanelProps {
    targetId: string | null;
    values?: Partial<SpriteProperties>;
    disabled?: boolean;
    nameReadOnly?: boolean;
    locale?: string;
    onChange(targetId: string, patch: Partial<SpriteProperties>): void;
}

const labels = {
    en: {
        panel: 'Sprite properties',
        title: 'Sprite',
        name: 'Sprite name',
        readOnly: 'Read only',
        visibility: 'Visibility',
        show: 'Show',
        hide: 'Hide',
        size: 'Size',
        direction: 'Direction',
        directionDial: 'Direction dial',
        lockedDirection: 'The costume does not rotate. The number still sets the movement direction.',
        rotation: 'Rotation style',
        allAround: 'All around',
        leftRight: 'Left-right',
        dontRotate: "Don't rotate"
    },
    ja: {
        panel: 'スプライトのプロパティ',
        title: 'スプライト',
        name: 'スプライト名',
        readOnly: '読み取り専用',
        visibility: '表示',
        show: '表示する',
        hide: '表示しない',
        size: '大きさ',
        direction: '向き',
        directionDial: '向きのダイヤル',
        lockedDirection: '見た目は回転しません。移動の向きは数値で変更できます。',
        rotation: '回転方法',
        allAround: '自由に回転',
        leftRight: '左右のみ',
        dontRotate: '回転しない'
    }
};

const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;
export const spritePropertiesTitle = (locale: string) => labelsFor(locale).title;

function BufferedInput({label, value, disabled, readOnly = false, numeric, onCommit}) {
    const [draft, setDraft] = useState(null);
    const pending = useRef(null);
    const display = numeric && Number.isFinite(value) ? Math.round(value) : value;

    function flush(event) {
        const next = pending.current;
        pending.current = null;
        setDraft(null);
        if (!next || disabled || next.badInput || event.currentTarget.validity.badInput) return;
        const result = numeric ? Number(next.value) : next.value;
        if (numeric && !Number.isFinite(result)) return;
        if (result !== value) onCommit(result);
    }

    return (
        <input
            aria-label={label}
            disabled={disabled}
            readOnly={readOnly}
            onBlur={flush}
            onChange={event => {
                const {value: next, validity} = event.currentTarget;
                pending.current = {value: next, badInput: validity.badInput};
                setDraft(next);
            }}
            onKeyDown={event => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.currentTarget.blur();
            }}
            step={numeric ? 'any' : undefined}
            type={numeric ? 'number' : 'text'}
            value={draft === null ? (display ?? '') : draft}
        />
    );
}

function dialDirection(event: React.PointerEvent<HTMLDivElement>, horizontal: boolean) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    if (horizontal) return x < 0 ? -90 : x > 0 ? 90 : null;
    if (Math.hypot(x, y) < 3) return null;
    const angle = Math.round(Math.atan2(x, -y) * 180 / Math.PI);
    return angle === -180 ? 180 : angle;
}

const dialTicks = Array.from({length: 24}, (_, index) => index * 15);
const rotationIcons: Record<RotationStyle, string> = {
    'all around': 'M20 11a8 8 0 1 0-8 9m4-8 4 4 4-4m-4 4v-5',
    'left-right': 'M12 5v14M8 8l-4 4 4 4m8-8 4 4-4 4M4 12h4m8 0h4',
    "don't rotate": 'M3 21 21 3M8 18a8 8 0 0 1 10-12m2 5v5m-4-4 4 4 4-4'
};

function DirectionDial({direction, rotation, disabled, text, preview, setPreview, onChange}: {
    direction?: number;
    rotation?: RotationStyle;
    disabled: boolean;
    text: typeof labels.en;
    preview: number | null;
    setPreview(value: number | null): void;
    onChange(value: number): void;
}) {
    const pointer = useRef<number | null>(null);
    const currentPreview = useRef<number | null>(null);
    const locked = rotation === "don't rotate";
    const horizontal = rotation === 'left-right';
    const unavailable = disabled || locked;
    const angle = preview ?? direction ?? 90;
    const rendered = locked ? 90 : horizontal ? (angle < 0 ? -90 : 90) : Math.round(angle);
    const radians = rendered * Math.PI / 180;
    const rimX = 64 + 49 * Math.sin(radians);
    const rimY = 64 - 49 * Math.cos(radians);
    function draft(value: number | null) {
        currentPreview.current = value;
        setPreview(value);
    }
    function cancel() {
        pointer.current = null;
        draft(null);
    }
    React.useLayoutEffect(() => {
        if (pointer.current !== null) cancel();
    }, [rotation, unavailable]);
    const update = (event: React.PointerEvent<HTMLDivElement>) => {
        const next = dialDirection(event, horizontal);
        if (next !== null) draft(next);
    };
    return <div className="tw-sprite-properties__dial" role="slider" aria-label={text.directionDial}
        aria-valuemin={horizontal ? -90 : -179} aria-valuemax={horizontal ? 90 : 180}
        aria-valuenow={rendered} aria-valuetext={rendered + '°'} aria-disabled={unavailable}
        title={locked ? text.lockedDirection : text.directionDial} tabIndex={unavailable ? -1 : 0}
        onPointerDown={event => {
            if (unavailable || event.button !== 0 || pointer.current !== null) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = event.pointerId;
            update(event);
        }}
        onPointerMove={event => {
            if (!unavailable && pointer.current === event.pointerId) update(event);
        }}
        onPointerUp={event => {
            if (pointer.current !== event.pointerId) return;
            const next = dialDirection(event, horizontal) ?? currentPreview.current;
            cancel();
            if (!unavailable && next !== null && next !== direction) onChange(next);
        }}
        onLostPointerCapture={cancel}
        onKeyDown={event => {
            if (unavailable || pointer.current !== null) return;
            const delta = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[event.key];
            if (delta === undefined) return;
            event.preventDefault();
            const step = event.shiftKey ? 15 : 1;
            const next = horizontal ? (delta < 0 ? -90 : 90) :
                ((rendered + delta * step + 179 + 360) % 360) - 179;
            if (next !== direction) onChange(next);
        }}>
        <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">
            <circle className="tw-sprite-properties__dial-face" cx="64" cy="64" r="49" />
            {!locked && !horizontal && rendered !== 0 && <path className="tw-sprite-properties__dial-sector"
                d={`M64 64V15A49 49 0 0 ${rendered < 0 ? 0 : 1} ${rimX} ${rimY}Z`} />}
            <g className="tw-sprite-properties__dial-ticks">
                {(horizontal ? [90, -90] : dialTicks).map(tick =>
                    <path key={tick} transform={`rotate(${tick} 64 64)`} d={tick % 90 === 0 ? 'M64 28v7' : 'M64 28v5'} />)}
            </g>
            <g transform={`rotate(${rendered} 64 64)`}>
                <circle className="tw-sprite-properties__dial-handle" cx="64" cy="15" r="13" />
                <path className="tw-sprite-properties__dial-arrow" d="M64 21V10m-4 4 4-4 4 4" />
            </g>
        </svg>
    </div>;
}

let nextVisibilityGroup = 0;

function Fields({values, disabled, nameReadOnly, text, commit}) {
    const [visibilityGroup] = useState(() => 'sprite-visibility-' + ++nextVisibilityGroup);
    const [directionPreview, setDirectionPreview] = useState<number | null>(null);
    const input = (field, label, numeric) => (
        <BufferedInput
            label={label}
            value={field === 'direction' ? directionPreview ?? values[field] : values[field]}
            disabled={disabled}
            readOnly={field === 'name' && nameReadOnly}
            numeric={numeric}
            onCommit={next => commit(field, next)}
        />
    );
    const rotationLabels: [RotationStyle, string][] = [
        ['all around', text.allAround],
        ['left-right', text.leftRight],
        ["don't rotate", text.dontRotate]
    ];

    return (
        <div className="tw-sprite-properties__fields">
            <label className="tw-sprite-properties__field">
                <span>{text.name}{nameReadOnly && <small className="tw-sprite-properties__read-only">
                    {text.readOnly}
                </small>}</span>
                {input('name', text.name, false)}
            </label>
            <label className="tw-sprite-properties__field">
                <span>x</span>
                {input('x', 'x', true)}
            </label>
            <label className="tw-sprite-properties__field">
                <span>y</span>
                {input('y', 'y', true)}
            </label>
            <div className="tw-sprite-properties__field tw-sprite-properties__visibility-field">
                <span>{text.visibility}</span>
                <div className="tw-sprite-properties__visibility" role="radiogroup" aria-label={text.visibility}>
                    {[true, false].map(visible => {
                        const label = visible ? text.show : text.hide;
                        return <label key={label} title={label}>
                            <input type="radio" name={visibilityGroup} aria-label={label} disabled={disabled}
                                checked={values.visible === visible} onChange={() => commit('visible', visible)} />
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                {visible ? <>
                                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                                    <circle cx="12" cy="12" r="2.5" />
                                </> : <path d="M3 21 21 3M9 6.5a10 10 0 0 1 3-.5c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.1M15 17.5a10 10 0 0 1-3 .5c-6 0-9.5-6-9.5-6a17 17 0 0 1 2.6-3.1" />}
                            </svg>
                        </label>;
                    })}
                </div>
            </div>
            <label className="tw-sprite-properties__field">
                <span>{text.size}</span>
                {input('size', text.size, true)}
            </label>
            <div className="tw-sprite-properties__field tw-sprite-properties__direction">
                <label className="tw-sprite-properties__field">
                    <span>{text.direction}</span>
                    {input('direction', text.direction, true)}
                </label>
                <div className="tw-sprite-properties__dial-controls">
                    <DirectionDial direction={values.direction} rotation={values.rotationStyle}
                        disabled={disabled || values.direction === undefined} text={text}
                        preview={directionPreview} setPreview={setDirectionPreview} onChange={next => commit('direction', next)} />
                    <div className="tw-sprite-properties__visibility tw-sprite-properties__rotation"
                        role="radiogroup" aria-label={text.rotation}>
                        {rotationLabels.map(([value, label]) => <label key={value} title={label}>
                            <input type="radio" name={visibilityGroup + '-rotation'} aria-label={label} disabled={disabled}
                                checked={values.rotationStyle === value} onChange={() => commit('rotationStyle', value)} />
                            <svg viewBox="0 0 26 24" aria-hidden="true" focusable="false">
                                <path d={rotationIcons[value]} />
                            </svg>
                        </label>)}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function SpritePropertiesPanel({targetId, values, disabled = false, nameReadOnly = false, locale = 'en', onChange}: SpritePropertiesPanelProps) {
    const text = labelsFor(locale);
    const unavailable = disabled || !targetId;
    const commit = (field, next) => {
        if (!unavailable) onChange(targetId, {[field]: next});
    };

    return (
        <section aria-label={text.panel} className="tw-sprite-properties">
            <Fields
                key={JSON.stringify([targetId, unavailable])}
                values={targetId ? (values ?? {}) : {}}
                disabled={unavailable}
                nameReadOnly={nameReadOnly}
                text={text}
                commit={commit}
            />
        </section>
    );
}

interface SpriteTarget {
    id: string;
    isStage: boolean;
}

type SpriteSelection = Pick<SpritePropertiesPanelProps, 'targetId' | 'values' | 'locale'> & {
    vm: {
        editingTarget?: SpriteTarget;
        _dragTarget?: SpriteTarget;
        renameSprite(id: string, name: string): void;
        postSpriteInfo(patch: Partial<SpriteProperties>): void;
    };
};

export function createSpriteInfoAdapter<Props extends object>(Fallback: React.ComponentType<Props>,
    Panel: React.ComponentType<SpritePropertiesPanelProps & {fallback: React.ReactNode}>) {
    return function SpriteInfoAdapter({targetId, values, vm, locale, ...props}: Props & SpriteSelection) {
        const target = vm.editingTarget;
        const change: SpritePropertiesPanelProps['onChange'] = (id, patch) => {
            if (!values || !target || target !== vm.editingTarget || target.isStage ||
                id !== targetId || id !== target.id || (vm._dragTarget && vm._dragTarget !== target)) return;
            if ('name' in patch) vm.renameSprite(id, patch.name);
            else vm.postSpriteInfo(patch);
        };

        return <Panel targetId={values ? targetId : null} values={values} locale={locale}
            disabled={!values} onChange={change} fallback={<Fallback {...props as Props} />} />;
    };
}

export const spriteListClasses = {
    selector: 'tw-sprite-properties-selector',
    scroll: 'tw-sprite-properties-scroll',
    compact: 'tw-sprite-properties-scroll--compact'
};
