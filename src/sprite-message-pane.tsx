import React from 'react';
import {PenIcon} from './pen-icon.tsx';
import type {
    MessageRenameError, MessageStatus, MessageUse, ProjectMessage, TargetMessages
} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';
import {checkMessageRename, receiveOpcode} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';

export type {MessageRenameError};

export interface MessagePaneData extends TargetMessages {
    getThumbnailUrl?(targetId: string): string | undefined;
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
    elsewhere: 'Used elsewhere in this project',
    message: 'Message',
    block: 'Block',
    scriptStart: 'Script starts with %1',
    actions: 'Actions',
    rename: 'Rename message',
    cancel: 'Cancel',
    name: 'Message name',
    projectWide: 'Renaming a message changes it everywhere in the project.',
    noSends: 'This sprite sends no messages.',
    noReceives: 'This sprite receives no messages.',
    noSendsStage: 'The stage sends no messages.',
    noReceivesStage: 'The stage receives no messages.',
    noElsewhere: 'Every message in this project is used here.',
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
    noMessages: 'This project has no messages.',
    noConnections: 'This diagram shows messages with a sender or a receiver.',
    openBlock: 'Open this block',
    openTarget: 'Open this sprite',
    openStage: 'Open the stage',
    broadcast: 'broadcast %1',
    broadcastAndWait: 'broadcast %1 and wait',
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
};

const japanese: typeof english = {
    panel: 'メッセージ',
    sent: '送信',
    received: '受信',
    elsewhere: 'この作品の他の場所のメッセージ',
    message: 'メッセージ',
    block: 'ブロック',
    scriptStart: '「%1」から始まるスクリプト',
    actions: '操作',
    rename: 'メッセージ名を変更',
    cancel: 'キャンセル',
    name: 'メッセージ名',
    projectWide: 'メッセージの名前を変えると、作品全体で変わります。',
    noSends: 'このスプライトはメッセージを送っていません。',
    noReceives: 'このスプライトはメッセージを受け取っていません。',
    noSendsStage: '背景はメッセージを送っていません。',
    noReceivesStage: '背景はメッセージを受け取っていません。',
    noElsewhere: 'この作品のメッセージはすべてここで使われています。',
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
    noMessages: 'この作品にはメッセージがありません。',
    noConnections: '送信または受信に使われているメッセージがここに表示されます。',
    openBlock: 'このブロックを開く',
    openTarget: 'このスプライトを開く',
    openStage: '背景を開く',
    broadcast: '%1を送る',
    broadcastAndWait: '%1を送って待つ',
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
    }
};

type Labels = typeof english;
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;
const quoted = (name: string) => '「' + name + '」';

const blockLabel = (labels: Labels, use: MessageUse) => {
    const name = quoted(use.name);
    if (use.direction === 'receive') return labels.whenReceived.replace('%1', name);
    return (use.wait ? labels.broadcastAndWait : labels.broadcast).replace('%1', name);
};

const scriptLabel = (labels: Labels, use: MessageUse) => {
    if (use.scriptOpcode === receiveOpcode && use.scriptMessageName !== undefined) {
        return labels.whenReceived.replace('%1', quoted(use.scriptMessageName));
    }
    return labels.hats[use.scriptOpcode] ?? use.scriptOpcode.replaceAll('_', ' ');
};

function Status({labels, status}: {labels: Labels; status: MessageStatus}) {
    if (status === 'both') return null;
    return <span className="tw-sprite-messages__status" data-status={status}>{labels[status]}</span>;
}

function RenameButton({labels, editable, onClick}: {labels: Labels; editable: boolean; onClick(): void}) {
    return <button type="button" className="tw-sprite-messages__button tw-sprite-messages__rename"
        disabled={!editable} onClick={onClick}>
        <PenIcon />{labels.rename}
    </button>;
}

function RenameForm({labels, message, onSubmit, onCancel}: {
    labels: Labels;
    message: ProjectMessage;
    onSubmit(name: string): MessageRenameError | void;
    onCancel(): void;
}) {
    const [error, setError] = React.useState<MessageRenameError | undefined>();
    return <form className="tw-sprite-messages__editor" aria-label={labels.rename}
        onSubmit={event => {
            event.preventDefault();
            const result = onSubmit(String(new FormData(event.currentTarget).get('name') ?? ''));
            if (result) setError(result);
            else onCancel();
        }}
        onKeyDown={event => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        }}>
        <input className="tw-sprite-messages__input" name="name" aria-label={labels.name}
            defaultValue={message.name} autoFocus onChange={() => setError(undefined)} />
        <button type="submit" className="tw-sprite-messages__button">{labels.rename}</button>
        <button type="button" className="tw-sprite-messages__button" onClick={onCancel}>{labels.cancel}</button>
        <p className="tw-sprite-messages__hint">{labels.projectWide}</p>
        {error && <p role="alert">{labels[error]}</p>}
    </form>;
}

function DiagramTargets({labels, uses, current, direction, getThumbnailUrl, onOpenTarget}: {
    labels: Labels;
    uses: readonly MessageUse[];
    current: string;
    direction: 'send' | 'receive';
    getThumbnailUrl: MessagePaneData['getThumbnailUrl'];
    onOpenTarget: SpriteMessagePaneProps['onOpenTarget'];
}) {
    if (!uses.length) {
        return <span className="tw-sprite-messages__missing">
            {direction === 'send' ? labels.receiveOnly : labels.sendOnly}
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
                <span>{name}</span>
            </>;
            return <li key={targetId}>
                {onOpenTarget ? <button type="button" {...nodeProps} onClick={() => onOpenTarget(targetId)}>
                    {content}
                </button> : <span {...nodeProps}>{content}</span>}
            </li>;
        })}
    </ul>;
}

function Diagram({labels, data, onOpenTarget}: {
    labels: Labels;
    data: MessagePaneData;
    onOpenTarget: SpriteMessagePaneProps['onOpenTarget'];
}) {
    const {targetId, isStage, messages, getThumbnailUrl} = data;
    const connections = messages.filter(message => isStage ? message.sends.length || message.receives.length :
        message.sends.some(use => use.targetId === targetId) || message.receives.some(use => use.targetId === targetId));
    const endpointProps = {labels, current: targetId, getThumbnailUrl, onOpenTarget};

    return <figure className="tw-sprite-messages__diagram">
        <figcaption>{labels.diagram}</figcaption>
        {connections.length ? <div className="tw-sprite-messages__connections">
            <div className="tw-sprite-messages__headings">
                <span>{labels.senders}</span><span>{labels.receivers}</span>
            </div>
            <ul className="tw-sprite-messages__connections-list">
                {connections.map(message => <li className="tw-sprite-messages__connection" key={message.key}>
                    <DiagramTargets {...endpointProps} uses={message.sends} direction="send" />
                    <div className="tw-sprite-messages__edge" data-status={message.status}>
                        <span className="tw-sprite-messages__edge-label">
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                            </svg>
                            <span>{message.name}</span>
                        </span>
                    </div>
                    <DiagramTargets {...endpointProps} uses={message.receives} direction="receive" />
                </li>)}
            </ul>
        </div> : <p className="tw-sprite-messages__missing">
            {messages.length ? labels.noConnections : labels.noMessages}
        </p>}
    </figure>;
}

function Group({labels, title, uses, empty, byKey, editable, renaming, onOpen, onRename, onStartRename}: {
    labels: Labels;
    title: string;
    uses: readonly MessageUse[];
    empty: string;
    byKey: Map<string, ProjectMessage>;
    editable: boolean;
    renaming: string | null;
    onOpen?(use: MessageUse): void;
    onRename?: SpriteMessagePaneProps['onRename'];
    onStartRename(key: string | null): void;
}) {
    return <section className="tw-sprite-messages__group" aria-label={title}>
        <h3 className="tw-sprite-messages__title">{title}</h3>
        {uses.length ? <table className="tw-sprite-messages__table">
            <thead><tr>
                <th scope="col">{labels.message}</th>
                <th scope="col">{labels.block}</th>
                {onRename && <th scope="col">{labels.actions}</th>}
            </tr></thead>
            <tbody>{uses.map(use => {
                const message = byKey.get(use.key);
                return <tr key={use.blockId}>
                    <th scope="row">
                        {onOpen ? <button type="button" className="tw-sprite-messages__link" data-message-key={use.key}
                            title={labels.openBlock} onClick={() => onOpen(use)}>{use.name}</button> :
                            <span data-message-key={use.key} tabIndex={-1}>{use.name}</span>}
                        {message && <Status labels={labels} status={message.status} />}
                    </th>
                    <td>
                        {blockLabel(labels, use)}
                        {use.blockId !== use.scriptId && <small className="tw-sprite-messages__script-start">
                            {labels.scriptStart.replace('%1', () => scriptLabel(labels, use))}
                        </small>}
                    </td>
                    {onRename && <td>
                        {renaming === use.key && message ?
                            <RenameForm labels={labels} message={message}
                                onSubmit={name => onRename(message, name)}
                                onCancel={() => onStartRename(null)} /> :
                            <RenameButton labels={labels} editable={editable} onClick={() => onStartRename(use.key)} />}
                    </td>}
                </tr>;
            })}</tbody>
        </table> : <p className="tw-sprite-messages__empty">{empty}</p>}
    </section>;
}

export function SpriteMessagePane({locale, editable, data, onOpen, onOpenTarget, onRename}: SpriteMessagePaneProps) {
    const labels = labelsFor(locale);
    const [renaming, setRenaming] = React.useState<string | null>(null);
    React.useLayoutEffect(() => {
        if (!editable) setRenaming(null);
    }, [editable]);
    const byKey = React.useMemo(() => new Map(data.messages.map(message => [message.key, message])),
        [data.messages]);
    const rename: SpriteMessagePaneProps['onRename'] = onRename && ((message, name) => {
        const result = checkMessageRename(data.messages, message, name);
        if ('error' in result) return result.error;
        if ('name' in result) return onRename(message, result.name);
        return undefined;
    });
    const group = (title: string, uses: readonly MessageUse[], empty: string) =>
        <Group {...{labels, title, uses, empty, byKey, editable, renaming, onOpen, onStartRename: setRenaming}}
            onRename={rename} />;

    return <section className="tw-sprite-messages" aria-label={labels.panel}>
        {group(labels.sent, data.sends, data.isStage ? labels.noSendsStage : labels.noSends)}
        {group(labels.received, data.receives, data.isStage ? labels.noReceivesStage : labels.noReceives)}
        <section className="tw-sprite-messages__group" aria-label={labels.elsewhere}>
            <h3 className="tw-sprite-messages__title">{labels.elsewhere}</h3>
            {data.elsewhere.length ? <ul className="tw-sprite-messages__list">
                {data.elsewhere.map(message => <li key={message.key}>
                    <span data-message-key={message.key} tabIndex={-1}>{message.name}</span>
                    <Status labels={labels} status={message.status} />
                    {rename && (renaming === message.key ?
                        <RenameForm labels={labels} message={message}
                            onSubmit={name => rename(message, name)}
                            onCancel={() => setRenaming(null)} /> :
                        <RenameButton labels={labels} editable={editable} onClick={() => setRenaming(message.key)} />)}
                </li>)}
            </ul> : <p className="tw-sprite-messages__empty">{labels.noElsewhere}</p>}
        </section>
        <Diagram labels={labels} data={data} onOpenTarget={onOpenTarget} />
    </section>;
}
