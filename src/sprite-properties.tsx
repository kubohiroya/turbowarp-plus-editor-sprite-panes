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

let nextVisibilityGroup = 0;

function Fields({values, disabled, nameReadOnly, text, commit}) {
    const [visibilityGroup] = useState(() => 'sprite-visibility-' + ++nextVisibilityGroup);
    const input = (field, label, numeric) => (
        <BufferedInput
            label={label}
            value={values[field]}
            disabled={disabled}
            readOnly={field === 'name' && nameReadOnly}
            numeric={numeric}
            onCommit={next => commit(field, next)}
        />
    );
    const rotationLabels = [
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
            <div className="tw-sprite-properties__field">
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
            <div className="tw-sprite-properties__field">
                <label className="tw-sprite-properties__field">
                    <span>{text.direction}</span>
                    {input('direction', text.direction, true)}
                </label>
                <select
                    aria-label={text.rotation}
                    disabled={disabled}
                    value={values.rotationStyle ?? ''}
                    onChange={event => commit('rotationStyle', event.currentTarget.value)}
                >
                    {values.rotationStyle === undefined && <option value="" disabled>—</option>}
                    {rotationLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
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
