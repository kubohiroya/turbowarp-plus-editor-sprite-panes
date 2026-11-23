import React from 'react';
import {PenIcon} from './pen-icon.tsx';
import {BlockImage, hatName, type GetBlockImage} from './block-image.tsx';
import {PaneDialog, PaneDialogActions, useDialogIds} from './pane-dialog.tsx';
import type {ScriptStart} from './script-start.ts';
import type {
    MessageRenameError, MessageUse, ProjectMessage, TargetMessages
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
    rename: 'Rename message',
    functionScript: 'Function %1',
    namedFunctionScript: 'Named function %1',
    renameConfirm: 'Rename',
    newName: 'New message name:',
    close: 'Close',
    cancel: 'Cancel',
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
    diagram: 'Messages between sprites and the stage',
    senders: 'Sends',
    receivers: 'Receives',
    stage: 'Stage',
    openBlock: 'Open this block',
    menu: 'Actions for “%1”',
    openTarget: 'Open this sprite',
    openStage: 'Open the stage'
};

const japanese: typeof english = {
    panel: 'メッセージ',
    sent: '送信',
    received: '受信',
    rename: 'メッセージ名を変更',
    functionScript: '関数 %1',
    namedFunctionScript: '名前付き関数 %1',
    renameConfirm: '変更',
    newName: '新しいメッセージ名:',
    close: '閉じる',
    cancel: 'キャンセル',
    projectWide: 'メッセージの名前を変えると、作品全体で変わります。',
    noSends: 'このスプライトはメッセージを送っていません。',
    noReceives: 'このスプライトはメッセージを受け取っていません。',
    noSendsStage: 'ステージはメッセージを送っていません。',
    noReceivesStage: 'ステージはメッセージを受け取っていません。',
    emptyName: 'メッセージ名を入力してください。',
    duplicateName: '同じ名前のメッセージがすでにあります。',
    unavailable: 'このメッセージの名前を変更できなくなりました。',
    sendOnly: '受け取るブロックがありません',
    receiveOnly: '送るブロックがありません',
    diagram: 'スプライト・ステージとメッセージの関係',
    senders: '送信元',
    receivers: '受信先',
    stage: 'ステージ',
    openBlock: 'このブロックを開く',
    menu: '「%1」の操作',
    openTarget: 'このスプライトを開く',
    openStage: 'ステージを開く'
};

type Labels = typeof english;
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;
const quoted = (name: string) => '「' + name + '」';

/** The warning before the empty end of a message that nothing receives, or that nothing sends. */
const WarningIcon = () => <svg className="tw-sprite-messages__warning" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3 2.5 20h19Z" /><path d="M12 9.5v5M12 17.2v.3" />
</svg>;

/** The speech bubble that marks a message on the arrows of the diagram. */
const MessageIcon = () => <svg className="tw-sprite-messages__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
</svg>;

const MenuIcon = () => <svg className="tw-sprite-messages__menu-icon" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M1.5 3h7L5 7.5Z" />
</svg>;

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

/**
 * The ▼ after a message name in the diagram. It opens a menu whose item leads to the rename dialog.
 * The menu closes on Escape, on a press outside it, and when an item is chosen.
 */
function MessageMenu({labels, message, editable, onRename}: {
    labels: Labels;
    message: ProjectMessage;
    editable: boolean;
    onRename(): void;
}) {
    const [open, setOpen] = React.useState(false);
    const root = React.useRef<HTMLSpanElement>(null);
    React.useLayoutEffect(() => {
        if (!editable) setOpen(false);
    }, [editable]);
    React.useLayoutEffect(() => {
        if (open) root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, [open]);
    React.useEffect(() => {
        const document = root.current?.ownerDocument;
        if (!open || !document) return;
        const closeOutside = (event: Event) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);
    const label = labels.menu.replace('%1', message.name);
    return <span ref={root} className="tw-sprite-messages__menu"
        onKeyDown={event => {
            if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
        }}>
        <button type="button" className="tw-sprite-messages__menu-button" aria-haspopup="menu" aria-expanded={open}
            aria-label={label} title={label} disabled={!editable} onClick={() => setOpen(!open)}>
            <MenuIcon />
        </button>
        {open && <ul className="tw-sprite-messages__menu-list" role="menu" aria-label={label}>
            <li role="none">
                <button type="button" role="menuitem" className="tw-sprite-messages__menu-item" onClick={() => {
                    setOpen(false);
                    onRename();
                }}><PenIcon />{labels.rename}</button>
            </li>
        </ul>}
    </span>;
}

/** Says where a send is: the hat its script starts with, the function or the named function. */
function sendSource(locale: string, labels: Labels, use: MessageUse, start: ScriptStart | undefined) {
    if (start?.kind === 'function') return labels.functionScript.replace('%1', () => start.label);
    if (start?.kind === 'named-function') return labels.namedFunctionScript.replace('%1', () => quoted(start.label));
    const receive = use.scriptOpcode === receiveOpcode;
    return [hatName(locale, use.scriptOpcode, receive ? use.scriptMessageName : undefined),
        ...receive ? [] : start?.text ?? []].join(' ');
}

/**
 * The scripts of one sender that send the message, each as its hat drawn small with words beside it.
 * Pressing one opens its first block that sends the message.
 */
function SendScripts({locale, labels, uses, getBlockImage, describeScript, onOpen}: {
    locale: string;
    labels: Labels;
    uses: readonly MessageUse[];
    getBlockImage?: GetBlockImage;
    describeScript?: MessagePaneData['describeScript'];
    onOpen?(use: MessageUse): void;
}) {
    const scripts = new Map<string, MessageUse>();
    for (const use of uses) if (!scripts.has(use.scriptId)) scripts.set(use.scriptId, use);
    return <ul className="tw-sprite-messages__sources">
        {[...scripts.values()].map(use => {
            const text = sendSource(locale, labels, use, describeScript?.(use.targetId, use.scriptId));
            const content = <>
                {/* The words follow the drawing, so nothing stands in for an undrawn hat. */}
                <BlockImage targetId={use.targetId} blockId={use.scriptId} label={text} getBlockImage={getBlockImage}><></></BlockImage>
                <span className="tw-sprite-messages__source-text">{text}</span>
            </>;
            return <li key={use.scriptId} data-script-id={use.scriptId}>
                {onOpen ? <button type="button" className="tw-sprite-messages__source" title={labels.openBlock}
                    onClick={() => onOpen(use)}>{content}</button> :
                    <span className="tw-sprite-messages__source">{content}</span>}
            </li>;
        })}
    </ul>;
}

function DiagramTargets({locale, labels, uses, current, direction, getThumbnailUrl, onOpenTarget, getBlockImage,
    describeScript, onOpen}: {
    locale: string;
    getBlockImage?: GetBlockImage;
    describeScript?: MessagePaneData['describeScript'];
    onOpen?(use: MessageUse): void;
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
            return <li key={targetId}>
                <div className="tw-sprite-messages__node" aria-current={targetId === current ? true : undefined}>
                    {thumbnail && <img src={thumbnail} alt="" data-backdrop={isStage || undefined} />}
                    <span className="tw-sprite-messages__node-text">
                        {onOpenTarget ? <button type="button" className="tw-sprite-messages__node-name" title={title}
                            onClick={() => onOpenTarget(targetId)}>{name}</button> :
                            <span className="tw-sprite-messages__node-name">{name}</span>}
                        {/* A sender also shows which scripts in it send the message. */}
                        {direction === 'send' && <SendScripts locale={locale} labels={labels}
                            uses={uses.filter(use => use.targetId === targetId)}
                            getBlockImage={getBlockImage} describeScript={describeScript} onOpen={onOpen} />}
                    </span>
                </div>
            </li>;
        })}
    </ul>;
}

/** The messages this target sends, or those it receives. */
const messagesOf = (data: MessagePaneData, side: Side) => data.messages.filter(message =>
    (side === 'send' ? message.sends : message.receives).some(use => use.targetId === data.targetId));

/**
 * The connections of the messages this target sends, or of those it receives. Every sender and
 * receiver of those messages is drawn, with this target highlighted.
 */
function Diagram({connections, locale, labels, data, editable, onOpen, onOpenTarget, onStartRename}: {
    connections: readonly ProjectMessage[];
    locale: string;
    labels: Labels;
    data: MessagePaneData;
    editable: boolean;
    onOpen?(use: MessageUse): void;
    onOpenTarget: SpriteMessagePaneProps['onOpenTarget'];
    onStartRename?(key: string): void;
}) {
    const {targetId, getThumbnailUrl, getBlockImage, describeScript} = data;
    const endpointProps = {locale, labels, current: targetId, getThumbnailUrl, onOpenTarget, getBlockImage, describeScript, onOpen};

    // The tab already says what the diagram shows, so it has no visible caption.
    return <figure className="tw-sprite-messages__diagram" aria-label={labels.diagram}>
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
                            <span data-message-key={message.key}>{message.name}</span>
                            {onStartRename && <MessageMenu labels={labels} message={message} editable={editable}
                                onRename={() => onStartRename(message.key)} />}
                        </span>
                    </div>
                    <DiagramTargets {...endpointProps} uses={message.receives} direction="receive" />
                </li>)}
            </ul>
        </div>
    </figure>;
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
    const renamingMessage = renaming === null ? undefined : data.messages.find(message => message.key === renaming);
    const rename: SpriteMessagePaneProps['onRename'] = onRename && ((message, name) => {
        const result = checkMessageRename(data.messages, message, name);
        if ('error' in result) return result.error;
        if ('name' in result) return onRename(message, result.name);
        return undefined;
    });

    const sides = [
        {side: 'send', title: labels.sent, connections: messagesOf(data, 'send'),
            empty: data.isStage ? labels.noSendsStage : labels.noSends},
        {side: 'receive', title: labels.received, connections: messagesOf(data, 'receive'),
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
            {sides.map(({side: each, title, connections}) => <button key={each} type="button" role="tab" data-side={each}
                id={tabId(each)} aria-controls={tabId(each) + '-panel'} aria-selected={side === each}
                tabIndex={side === each ? 0 : -1} className="tw-sprite-messages__tab" onClick={() => choose(each)}>
                {title}<span className="tw-sprite-messages__tab-count">{connections.length}</span>
            </button>)}
        </div>
        {sides.map(({side: each, connections, empty}) => <div key={each} role="tabpanel" id={tabId(each) + '-panel'}
            aria-labelledby={tabId(each)} hidden={side !== each} className="tw-sprite-messages__tab-panel">
            {connections.length ?
                <Diagram connections={connections} locale={locale} labels={labels} data={data} editable={editable}
                    onOpen={onOpen} onOpenTarget={onOpenTarget} onStartRename={rename ? setRenaming : undefined} /> :
                <p className="tw-sprite-messages__empty">{empty}</p>}
        </div>)}
        {rename && renamingMessage && <RenameDialog key={renamingMessage.key} labels={labels} message={renamingMessage}
            onSubmit={name => rename(renamingMessage, name)} onClose={() => setRenaming(null)} />}
    </section>;
}
