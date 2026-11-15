import React from 'react';
import {PenIcon} from './pen-icon.tsx';
import {BlockImage, hatName, type GetBlockImage} from './block-image.tsx';
import {PaneDialog, PaneDialogActions, useDialogIds} from './pane-dialog.tsx';
import type {ScriptStart} from './script-start.ts';
import type {
    MessageRenameError, MessageStatus, MessageUse, ProjectMessage, TargetMessages
} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';
import {checkMessageRename, receiveOpcode} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';

export type {MessageRenameError};

export interface MessagePaneData extends TargetMessages {
    getThumbnailUrl?(targetId: string): string | undefined;
    /** Draws the hats of the scripts as Scratch shows them. See `createBlockImageRenderer` in `./block-image`. */
    getBlockImage?: GetBlockImage;
    /**
     * Tells how the script holding a block starts: a hat, a function or a named function. See
     * `describeScriptStart` in `./script-start`.
     */
    describeScript?(targetId: string, blockId: string): ScriptStart | undefined;
}

export interface SpriteMessagePaneProps {
    kind: 'messages';
    locale: string;
    editable: boolean;
    data: MessagePaneData;
    /** Open the block that sends or receives the message. */
    onOpen?(use: MessageUse): void;
    /** Open a sprite or the stage from the diagram. */
    onOpenTarget?(targetId: string): void;
    onRename?(message: ProjectMessage, name: string): MessageRenameError | void;
}

const english = {
    panel: 'Messages',
    sent: 'Sent',
    received: 'Received',
    message: 'Message',
    block: 'Block',
    scriptStart: 'Script starts with %1',
    rename: 'Rename message',
    functionScript: 'Function %1',
    namedFunctionScript: 'Named function %1',
    renameConfirm: 'Rename',
    newName: 'New message name:',
    close: 'Close',
    cancel: 'Cancel',
    name: 'Message name',
    projectWide: 'Renaming a message changes it everywhere in the project.',
    noSends: 'This sprite sends no messages.',
    noReceives: 'This sprite receives no messages.',
    noSendsStage: 'The stage sends no messages.',
    noReceivesStage: 'The stage receives no messages.',
    emptyName: 'Enter a message name.',
    duplicateName: 'A message with this name already exists.',
    unavailable: 'This message can no longer be renamed.',
    sendOnly: 'No receivers',
    receiveOnly: 'Never sent',
    unused: 'Unused',
    diagram: 'Messages between sprites and the stage',
    senders: 'Sends',
    receivers: 'Receives',
    stage: 'Stage',
    openBlock: 'Open this block',
    openTarget: 'Open this sprite',
    openStage: 'Open the stage',
    broadcast: 'broadcast %1',
    broadcastAndWait: 'broadcast %1 and wait',
    whenReceived: 'when I receive %1'
};

const japanese: typeof english = {
    panel: 'メッセージ',
    sent: '送信',
    received: '受信',
    message: 'メッセージ',
    block: 'ブロック',
    scriptStart: '「%1」から始まるスクリプト',
    rename: 'メッセージ名を変更',
    functionScript: '関数 %1',
    namedFunctionScript: '名前付き関数 %1',
    renameConfirm: '変更',
    newName: '新しいメッセージ名:',
    close: '閉じる',
    cancel: 'キャンセル',
    name: 'メッセージ名',
    projectWide: 'メッセージの名前を変えると、作品全体で変わります。',
    noSends: 'このスプライトはメッセージを送っていません。',
    noReceives: 'このスプライトはメッセージを受け取っていません。',
    noSendsStage: '背景はメッセージを送っていません。',
    noReceivesStage: '背景はメッセージを受け取っていません。',
    emptyName: 'メッセージ名を入力してください。',
    duplicateName: '同じ名前のメッセージがすでにあります。',
    unavailable: 'このメッセージの名前を変更できなくなりました。',
    sendOnly: '受け取るブロックがありません',
    receiveOnly: '送るブロックがありません',
    unused: '使われていません',
    diagram: 'スプライト・背景とメッセージの関係',
    senders: '送信元',
    receivers: '受信先',
    stage: '背景',
    openBlock: 'このブロックを開く',
    openTarget: 'このスプライトを開く',
    openStage: '背景を開く',
    broadcast: '%1を送る',
    broadcastAndWait: '%1を送って待つ',
    whenReceived: '%1を受け取ったとき'
};

type Labels = typeof english;
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;
const quoted = (name: string) => '「' + name + '」';

const blockLabel = (labels: Labels, use: MessageUse) => {
    const name = quoted(use.name);
    if (use.direction === 'receive') return labels.whenReceived.replace('%1', name);
    return (use.wait ? labels.broadcastAndWait : labels.broadcast).replace('%1', name);
};

const scriptLabel = (locale: string, use: MessageUse) =>
    hatName(locale, use.scriptOpcode, use.scriptOpcode === receiveOpcode ? use.scriptMessageName : undefined);

/** The warning before a message that nothing receives, or that nothing sends. */
const WarningIcon = () => <svg className="tw-sprite-messages__warning" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3 2.5 20h19Z" /><path d="M12 9.5v5M12 17.2v.3" />
</svg>;

/** Warns when a message has no receivers, or no senders. A message used at both ends needs no mark. */
function Status({labels, status}: {labels: Labels; status: MessageStatus}) {
    if (status === 'both') return null;
    return <span className="tw-sprite-messages__status" data-status={status} role="note">
        <WarningIcon />{labels[status]}
    </span>;
}

/** The speech bubble that marks a message, in the tables as on the arrows of the diagram. */
const MessageIcon = () => <svg className="tw-sprite-messages__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
</svg>;

/** The pencil after a message name. It shows while the row is pointed at or focused, and opens the rename dialog. */
function RenameButton({labels, editable, onClick}: {labels: Labels; editable: boolean; onClick(): void}) {
    return <button type="button" className="tw-pane-name-edit" disabled={!editable}
        aria-label={labels.rename} title={labels.rename} onClick={onClick}>
        <PenIcon />
    </button>;
}

function RenameDialog({labels, message, onSubmit, onClose}: {
    labels: Labels;
    message: ProjectMessage;
    onSubmit(name: string): MessageRenameError | void;
    onClose(): void;
}) {
    const [error, setError] = React.useState<MessageRenameError | undefined>();
    const {inputId} = useDialogIds();
    const errorId = inputId + '-error';
    return <PaneDialog title={labels.rename} closeLabel={labels.close} onClose={onClose}>
        <form className="tw-sprite-variables__dialog-body"
            onSubmit={event => {
                event.preventDefault();
                const result = onSubmit(String(new FormData(event.currentTarget).get('name') ?? ''));
                if (result) setError(result);
                else onClose();
            }}>
            <label className="tw-sprite-variables__dialog-label" htmlFor={inputId}>{labels.newName}</label>
            <input id={inputId} className="tw-sprite-variables__dialog-input" name="name" defaultValue={message.name}
                data-initial-focus="" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
                onChange={() => setError(undefined)} />
            <p className="tw-sprite-messages__hint">{labels.projectWide}</p>
            {error && <p id={errorId} role="alert" className="tw-sprite-variables__dialog-error">{labels[error]}</p>}
            <PaneDialogActions cancelLabel={labels.cancel} confirmLabel={labels.renameConfirm} onClose={onClose} />
        </form>
    </PaneDialog>;
}

/** Says where a send is: the hat its script starts with, the function or the named function. */
function sendSource(locale: string, labels: Labels, use: MessageUse, start: ScriptStart | undefined) {
    if (start?.kind === 'function') return labels.functionScript.replace('%1', () => start.label);
    if (start?.kind === 'named-function') return labels.namedFunctionScript.replace('%1', () => quoted(start.label));
    const receive = use.scriptOpcode === receiveOpcode;
    return [hatName(locale, use.scriptOpcode, receive ? use.scriptMessageName : undefined),
        ...receive ? [] : start?.text ?? []].join(' ');
}

/** The scripts of one sender that send the message, each as its hat drawn small with words beside it. */
function SendScripts({locale, labels, uses, getBlockImage, describeScript}: {
    locale: string;
    labels: Labels;
    uses: readonly MessageUse[];
    getBlockImage?: GetBlockImage;
    describeScript?: MessagePaneData['describeScript'];
}) {
    const scripts = new Map(uses.map(use => [use.scriptId, use]));
    return <ul className="tw-sprite-messages__sources">
        {[...scripts.values()].map(use => {
            const text = sendSource(locale, labels, use, describeScript?.(use.targetId, use.scriptId));
            return <li key={use.scriptId} data-script-id={use.scriptId}>
                {/* The words follow the drawing, so nothing stands in for an undrawn hat. */}
                <BlockImage targetId={use.targetId} blockId={use.scriptId} label={text} getBlockImage={getBlockImage}><></></BlockImage>
                <span className="tw-sprite-messages__source-text">{text}</span>
            </li>;
        })}
    </ul>;
}

function DiagramTargets({locale, labels, uses, current, direction, getThumbnailUrl, onOpenTarget, getBlockImage,
    describeScript}: {
    locale: string;
    getBlockImage?: GetBlockImage;
    describeScript?: MessagePaneData['describeScript'];
    labels: Labels;
    uses: readonly MessageUse[];
    current: string;
    direction: 'send' | 'receive';
    getThumbnailUrl: MessagePaneData['getThumbnailUrl'];
    onOpenTarget: SpriteMessagePaneProps['onOpenTarget'];
}) {
    if (!uses.length) {
        return <span className="tw-sprite-messages__missing">
            <WarningIcon />{direction === 'send' ? labels.receiveOnly : labels.sendOnly}
        </span>;
    }
    const targets = new Map(uses.map(use => [use.targetId, use]));
    return <ul className="tw-sprite-messages__endpoints" data-direction={direction}>
        {[...targets.values()].map(({targetId, targetName, isStage}) => {
            const name = isStage ? labels.stage : targetName;
            const thumbnail = getThumbnailUrl?.(targetId);
            const title = onOpenTarget ? name + ' — ' + (isStage ? labels.openStage : labels.openTarget) : name;
            const nodeProps = {
                className: 'tw-sprite-messages__node',
                'aria-current': targetId === current ? true : undefined,
                title
            };
            const content = <>
                {thumbnail && <img src={thumbnail} alt="" data-backdrop={isStage || undefined} />}
                <span className="tw-sprite-messages__node-text">
                    <span>{name}</span>
                    {/* A sender also shows which scripts in it send the message. */}
                    {direction === 'send' && <SendScripts locale={locale} labels={labels}
                        uses={uses.filter(use => use.targetId === targetId)}
                        getBlockImage={getBlockImage} describeScript={describeScript} />}
                </span>
            </>;
            return <li key={targetId}>
                {onOpenTarget ? <button type="button" {...nodeProps} onClick={() => onOpenTarget(targetId)}>
                    {content}
                </button> : <span {...nodeProps}>{content}</span>}
            </li>;
        })}
    </ul>;
}

/**
 * The connections of the messages this target sends, or of those it receives. Every sender and
 * receiver of those messages is drawn, with this target highlighted.
 */
function Diagram({side, locale, labels, data, onOpenTarget}: {
    side: 'send' | 'receive';
    locale: string;
    labels: Labels;
    data: MessagePaneData;
    onOpenTarget: SpriteMessagePaneProps['onOpenTarget'];
}) {
    const {targetId, messages, getThumbnailUrl, getBlockImage, describeScript} = data;
    const connections = messages.filter(message =>
        (side === 'send' ? message.sends : message.receives).some(use => use.targetId === targetId));
    // The table above already says when this target sends or receives nothing.
    if (!connections.length) return null;
    const endpointProps = {locale, labels, current: targetId, getThumbnailUrl, onOpenTarget, getBlockImage, describeScript};

    return <figure className="tw-sprite-messages__diagram">
        <figcaption>{labels.diagram}</figcaption>
        <div className="tw-sprite-messages__connections">
            <div className="tw-sprite-messages__headings">
                <span>{labels.senders}</span><span>{labels.receivers}</span>
            </div>
            <ul className="tw-sprite-messages__connections-list">
                {connections.map(message => <li className="tw-sprite-messages__connection" key={message.key}>
                    <DiagramTargets {...endpointProps} uses={message.sends} direction="send" />
                    <div className="tw-sprite-messages__edge" data-status={message.status}>
                        <span className="tw-sprite-messages__edge-label">
                            <MessageIcon />
                            <span>{message.name}</span>
                        </span>
                    </div>
                    <DiagramTargets {...endpointProps} uses={message.receives} direction="receive" />
                </li>)}
            </ul>
        </div>
    </figure>;
}

function Group({locale, labels, title, uses, empty, byKey, editable, onOpen, onRename, onStartRename,
    getBlockImage}: {
    locale: string;
    labels: Labels;
    getBlockImage?: GetBlockImage;
    title: string;
    uses: readonly MessageUse[];
    empty: string;
    byKey: Map<string, ProjectMessage>;
    editable: boolean;
    onOpen?(use: MessageUse): void;
    onRename?: SpriteMessagePaneProps['onRename'];
    onStartRename(key: string | null): void;
}) {
    // The tab above names the group, so it has no heading of its own.
    return <section className="tw-sprite-messages__group" aria-label={title}>
        {uses.length ? <table className="tw-sprite-messages__table">
            <thead><tr>
                <th scope="col">{labels.message}</th>
                <th scope="col">{labels.block}</th>
            </tr></thead>
            <tbody>{uses.map(use => {
                const message = byKey.get(use.key);
                return <tr key={use.blockId}>
                    <th scope="row">
                        <MessageIcon />
                        {onOpen ? <button type="button" className="tw-sprite-messages__link" data-message-key={use.key}
                            title={labels.openBlock} onClick={() => onOpen(use)}>{use.name}</button> :
                            <span data-message-key={use.key} tabIndex={-1}>{use.name}</span>}
                        {onRename && message && <RenameButton labels={labels} editable={editable}
                            onClick={() => onStartRename(use.key)} />}
                        {message && <Status labels={labels} status={message.status} />}
                    </th>
                    <td>
                        {/* A receiving block is the hat of its script, so it is drawn as Scratch shows it. */}
                        {use.blockId === use.scriptId ?
                            <BlockImage targetId={use.targetId} blockId={use.blockId} label={blockLabel(labels, use)}
                                getBlockImage={getBlockImage} className="tw-sprite-messages__hat" /> :
                            blockLabel(labels, use)}
                        {use.blockId !== use.scriptId && <small className="tw-sprite-messages__script-start">
                            <BlockImage targetId={use.targetId} blockId={use.scriptId}
                                label={labels.scriptStart.replace('%1', () => scriptLabel(locale, use))}
                                getBlockImage={getBlockImage} className="tw-sprite-messages__hat" />
                        </small>}
                    </td>
                </tr>;
            })}</tbody>
        </table> : <p className="tw-sprite-messages__empty">{empty}</p>}
    </section>;
}

type Side = 'send' | 'receive';

export function SpriteMessagePane({locale, editable, data, onOpen, onOpenTarget, onRename}: SpriteMessagePaneProps) {
    const labels = labelsFor(locale);
    const [renaming, setRenaming] = React.useState<string | null>(null);
    // Open on the side this target uses: sending, or receiving when it only receives.
    const [side, setSide] = React.useState<Side>(() => !data.sends.length && data.receives.length ? 'receive' : 'send');
    const tabs = React.useRef<HTMLDivElement>(null);
    const ids = useDialogIds();
    React.useLayoutEffect(() => {
        if (!editable) setRenaming(null);
    }, [editable]);
    const byKey = React.useMemo(() => new Map(data.messages.map(message => [message.key, message])),
        [data.messages]);
    const renamingMessage = renaming === null ? undefined : byKey.get(renaming);
    const rename: SpriteMessagePaneProps['onRename'] = onRename && ((message, name) => {
        const result = checkMessageRename(data.messages, message, name);
        if ('error' in result) return result.error;
        if ('name' in result) return onRename(message, result.name);
        return undefined;
    });
    const group = (title: string, uses: readonly MessageUse[], empty: string) =>
        <Group {...{locale, labels, title, uses, empty, byKey, editable, onOpen, onStartRename: setRenaming}}
            onRename={rename} getBlockImage={data.getBlockImage} />;

    const sides = [
        {side: 'send', title: labels.sent, uses: data.sends, empty: data.isStage ? labels.noSendsStage : labels.noSends},
        {side: 'receive', title: labels.received, uses: data.receives,
            empty: data.isStage ? labels.noReceivesStage : labels.noReceives}
    ] as const;
    const tabId = (side: string) => `${ids.titleId}-${side}`;
    const choose = (side: Side, focus = false) => {
        setSide(side);
        if (focus) tabs.current?.querySelector<HTMLElement>(`[data-side="${side}"]`)?.focus();
    };

    return <section className="tw-sprite-messages" aria-label={labels.panel}>
        <div ref={tabs} className="tw-sprite-messages__tabs" role="tablist" aria-label={labels.panel}
            onKeyDown={event => {
                const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'send' :
                    event.key === 'ArrowRight' || event.key === 'End' ? 'receive' : undefined;
                if (!next) return;
                event.preventDefault();
                choose(next, true);
            }}>
            {sides.map(({side: each, title, uses}) => <button key={each} type="button" role="tab" data-side={each}
                id={tabId(each)} aria-controls={tabId(each) + '-panel'} aria-selected={side === each}
                tabIndex={side === each ? 0 : -1} className="tw-sprite-messages__tab" onClick={() => choose(each)}>
                {title}<span className="tw-sprite-messages__tab-count">{uses.length}</span>
            </button>)}
        </div>
        {sides.map(({side: each, title, uses, empty}) => <div key={each} role="tabpanel" id={tabId(each) + '-panel'}
            aria-labelledby={tabId(each)} hidden={side !== each} className="tw-sprite-messages__tab-panel">
            {group(title, uses, empty)}
            <Diagram side={each} locale={locale} labels={labels} data={data} onOpenTarget={onOpenTarget} />
        </div>)}
        {rename && renamingMessage && <RenameDialog key={renamingMessage.key} labels={labels} message={renamingMessage}
            onSubmit={name => rename(renamingMessage, name)} onClose={() => setRenaming(null)} />}
    </section>;
}
