import React from 'react';

/**
 * The modal dialog the sprite editor panes share, shaped like Scratch's “New Variable” prompt: the
 * variable pane creates, renames and deletes variables in it, and the message pane renames messages.
 */

const iconProps = {viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false} as const;
const CloseIcon = () => <svg {...iconProps} className="tw-sprite-variables__icon"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>;

let nextDialogId = 0;

/**
 * IDs for one dialog's title and input. React's own ID hook arrived in React 18, but the package
 * supports React 16.14 (see peerDependencies), and the Editor mounts this pane in the GUI's React 16.
 */
export function useDialogIds() {
    const [ids] = React.useState(() => {
        const id = 'tw-sprite-variables-dialog-' + ++nextDialogId;
        return {titleId: id + '-title', inputId: id + '-input'};
    });
    return ids;
}

export function PaneDialog({title, closeLabel, onClose, children, list}: React.PropsWithChildren<{
    title: string;
    closeLabel: string;
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
        // An input starts with its text selected. The check works across windows, unlike instanceof.
        if (initial && 'select' in initial && typeof initial.select === 'function') initial.select();
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
            <button type="button" className="tw-sprite-variables__dialog-close" aria-label={closeLabel} onClick={onClose}>
                <CloseIcon />
            </button>
        </div>
        {children}
    </dialog>;
}

export function PaneDialogActions({cancelLabel, confirmLabel, onClose, deleting = false}: {
    cancelLabel: string;
    confirmLabel: string;
    onClose(): void;
    deleting?: boolean;
}) {
    return <div className="tw-sprite-variables__dialog-buttons tw-plus-dialog-actions">
        <button type="button" className="tw-sprite-variables__dialog-button" onClick={onClose}
            data-dialog-action="cancel" data-initial-focus={deleting ? '' : undefined}>{cancelLabel}</button>
        <button type="submit" className="tw-sprite-variables__dialog-button tw-sprite-variables__dialog-button--ok"
            data-dialog-action={deleting ? 'delete' : 'confirm'}>{confirmLabel}</button>
    </div>;
}
