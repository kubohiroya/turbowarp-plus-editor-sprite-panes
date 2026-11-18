import {scanProjectMessages} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';
import type {MessageTarget, MessageUse} from '@kubohiroya/turbowarp-plus-editor-project-model/project-messages';
import type {FunctionTarget, SpriteFunction} from './sprite-function-pane.tsx';

/** A script at either end of a message relationship, in its original target. */
export interface MessageCallGraphScript {
    /** Local scripts use their block id; foreign scripts use the same prefix as global functions. */
    id: string;
    targetId: string;
    targetName: string;
    isStage: boolean;
    scriptId: string;
    opcode: string;
    x: number;
    y: number;
    label?: string;
    receivedMessage?: string;
    /** Foreign definitions have graph-qualified callees, so raw ids cannot point into this target. */
    definition?: SpriteFunction;
}

/** A broadcast from one script to one receiving script. */
export interface MessageCallGraphEdge {
    from: string;
    to: string;
    messageKey: string;
    messageName: string;
    wait: boolean;
}

export interface MessageCallGraph {
    scripts: MessageCallGraphScript[];
    edges: MessageCallGraphEdge[];
}

/**
 * Read the message relationships touching a target. Broadcast recognition and identity come from
 * the same scanner as the message pane and project search; this module only joins their scripts.
 */
export function readMessageCallGraph(target: FunctionTarget, others: readonly FunctionTarget[],
    definitions: ReadonlyMap<string, readonly SpriteFunction[]>,
    describeScript?: (targetId: string, scriptId: string) => string | undefined): MessageCallGraph {
    const targets = new Map<string, FunctionTarget>([[target.id, target]]);
    for (const other of others) if (!targets.has(other.id)) targets.set(other.id, other);
    const project = {targets: [...targets.values()].map((owner): MessageTarget => {
        const blocks = owner.blocks._blocks;
        return {
            id: owner.id,
            isStage: Boolean(owner.isStage),
            isOriginal: owner.isOriginal !== false,
            getName: () => owner.getName?.() ?? owner.sprite?.name ?? (owner.isStage ? 'Stage' : owner.id),
            variables: owner.variables ?? {},
            blocks: {
                getScripts: () => Object.values(blocks).filter(block => !block.shadow &&
                    (block.topLevel === true || (!block.parent && block.topLevel !== false))).map(block => block.id),
                getBlock: id => blocks[id]
            }
        };
    })};
    const scripts = new Map<string, MessageCallGraphScript>();
    const edges = new Map<string, MessageCallGraphEdge>();
    const definitionByTarget = new Map([...definitions].map(([id, items]) =>
        [id, new Map(items.map(definition => [definition.id, definition]))]));

    function scriptOf(use: MessageUse) {
        const id = use.targetId === target.id ? use.scriptId : `${use.targetId}:${use.scriptId}`;
        if (!scripts.has(id)) {
            const root = targets.get(use.targetId)?.blocks._blocks[use.scriptId];
            const localDefinitions = definitionByTarget.get(use.targetId);
            const definition = localDefinitions?.get(use.scriptId);
            scripts.set(id, {
                id, targetId: use.targetId, targetName: use.targetName, isStage: use.isStage,
                scriptId: use.scriptId, opcode: use.scriptOpcode,
                x: Number(root?.x) || 0, y: Number(root?.y) || 0,
                label: describeScript?.(use.targetId, use.scriptId),
                receivedMessage: use.scriptMessageName,
                definition: definition && use.targetId !== target.id ? {...definition,
                    // The global-function reader owns links outside this foreign target. A raw
                    // local id here must never accidentally bind to one in the displayed target.
                    callees: definition.callees.filter(callee => localDefinitions.has(callee))
                        .map(callee => `${use.targetId}:${callee}`)
                } : definition
            });
        }
        return id;
    }

    for (const message of scanProjectMessages(project)) {
        const ownReceives = message.receives.filter(use => use.targetId === target.id);
        // Keep unmatched uses in this target, too: they are scripts even without a resolved edge.
        for (const use of [...message.sends, ...message.receives]) {
            if (use.targetId === target.id) scriptOf(use);
        }
        for (const send of message.sends) {
            // Avoid the full foreign-sender × foreign-receiver product in a large project.
            const receives = send.targetId === target.id ? message.receives : ownReceives;
            for (const receive of receives) {
                const from = scriptOf(send);
                const to = scriptOf(receive);
                const key = JSON.stringify([from, to, message.key, send.wait]);
                if (!edges.has(key)) edges.set(key, {from, to, messageKey: message.key,
                    messageName: message.name, wait: send.wait});
            }
        }
    }
    return {scripts: [...scripts.values()], edges: [...edges.values()]};
}
