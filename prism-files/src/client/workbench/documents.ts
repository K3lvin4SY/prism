import { listFiles, readFile, writeFile } from '../api';
import { getConfig } from '../config';
import { deleteDraft, getDraft, saveDraft, type Draft } from '../lib/drafts';
import { basename, dirname, languageFor } from '../lib/paths';
import monaco from './monaco';
import type { WorkbenchState } from './store';

export interface Document {
    path: string;
    model: monaco.editor.ITextModel;
    /** The model version that matches the file on the server. */
    savedVersion: number;
    /** The file's modification time on the server when it was opened or last saved. */
    modified: string | null;
    /** A draft from an earlier visit, restored into the model. */
    restoredDraft: Draft | null;
    viewState: monaco.editor.ICodeEditorViewState | null;
}

export class ConflictError extends Error {
    constructor(public readonly modified: string) {
        super('The file changed on the server since it was opened.');
    }
}

/** The open files of one server, each a Monaco model, with drafts kept as they are edited. */
export class Documents {
    private documents = new Map<string, Document>();
    private loading = new Map<string, Promise<Document>>();
    private draftTimers = new Map<string, number>();

    constructor(
        private readonly server: string,
        private readonly state: WorkbenchState
    ) {}

    get(path: string): Document | undefined {
        return this.documents.get(path);
    }

    all(): Document[] {
        return [...this.documents.values()];
    }

    isDirty(path: string): boolean {
        const document = this.documents.get(path);

        return !!document && document.model.getAlternativeVersionId() !== document.savedVersion;
    }

    open(path: string): Promise<Document> {
        const existing = this.documents.get(path);
        if (existing) return Promise.resolve(existing);

        let pending = this.loading.get(path);
        if (!pending) {
            pending = this.load(path).finally(() => this.loading.delete(path));
            this.loading.set(path, pending);
        }

        return pending;
    }

    private async load(path: string): Promise<Document> {
        const entry = (await listFiles(this.server, dirname(path))).find((file) => file.name === basename(path));
        if (entry && entry.size > getConfig().maxEditBytes) {
            throw new Error(`${basename(path)} is ${Math.ceil(entry.size / 1048576)} MB, more than the editor opens. Download it instead.`);
        }

        const content = entry ? await readFile(this.server, path) : '';
        const uri = monaco.Uri.from({ scheme: 'prism', authority: this.server, path });
        monaco.editor.getModel(uri)?.dispose();
        const model = monaco.editor.createModel(content, languageFor(basename(path)), uri);
        const document: Document = { path, model, savedVersion: model.getAlternativeVersionId(), modified: entry?.modified ?? null, restoredDraft: null, viewState: null };

        const draft = await getDraft(this.server, path);
        if (draft && draft.content !== content) {
            model.setValue(draft.content);
            document.restoredDraft = draft;
            this.state.setDirty(path, true);
        } else if (draft) {
            void deleteDraft(this.server, path);
        }

        this.attach(document);
        this.documents.set(path, document);

        return document;
    }

    /** Tracks unsaved changes and keeps a draft of them a moment after each edit. */
    private attach(document: Document): void {
        document.model.onDidChangeContent(() => {
            const path = document.path;
            const dirty = this.isDirty(path);
            this.state.setDirty(path, dirty);
            window.clearTimeout(this.draftTimers.get(path));
            this.draftTimers.set(
                path,
                window.setTimeout(() => (dirty ? saveDraft(this.server, path, document.model.getValue(), document.modified) : deleteDraft(this.server, path)), 800)
            );
        });
    }

    /** Saves to the server. A file changed there since it was opened throws ConflictError unless forced. */
    async save(path: string, force = false): Promise<void> {
        const document = this.documents.get(path);
        if (!document) return;

        const version = document.model.getAlternativeVersionId();
        try {
            const result = await writeFile(this.server, path, document.model.getValue(), document.modified, force);
            document.modified = result.modified ?? document.modified;
        } catch (error) {
            const response = (error as { response?: { status?: number; data?: { modified?: string } } }).response;
            if (response?.status === 409 && response.data?.modified) throw new ConflictError(response.data.modified);
            throw error;
        }

        document.savedVersion = version;
        document.restoredDraft = null;
        this.state.setDirty(path, this.isDirty(path));
        window.clearTimeout(this.draftTimers.get(path));
        await deleteDraft(this.server, path);
    }

    /** Throws away the edits and the draft, and reloads the file from the server. */
    async revert(path: string): Promise<void> {
        const document = this.documents.get(path);
        if (!document) return;
        const content = await readFile(this.server, path);
        const entry = (await listFiles(this.server, dirname(path))).find((file) => file.name === basename(path));
        document.model.setValue(content);
        document.savedVersion = document.model.getAlternativeVersionId();
        document.modified = entry?.modified ?? null;
        document.restoredDraft = null;
        this.state.setDirty(path, false);
        await deleteDraft(this.server, path);
    }

    close(path: string): void {
        const document = this.documents.get(path);
        if (!document) return;
        window.clearTimeout(this.draftTimers.get(path));
        document.model.dispose();
        this.documents.delete(path);
    }

    /** Follows a renamed file, keeping its edits. */
    rename(from: string, to: string): void {
        for (const [path, document] of [...this.documents]) {
            if (path !== from && !path.startsWith(from + '/')) continue;
            const next = to + path.slice(from.length);
            const uri = monaco.Uri.from({ scheme: 'prism', authority: this.server, path: next });
            const model = monaco.editor.createModel(document.model.getValue(), languageFor(basename(next)), uri);
            const dirty = this.isDirty(path);
            document.model.dispose();
            this.documents.delete(path);
            const moved: Document = { ...document, path: next, model, savedVersion: dirty ? -1 : model.getAlternativeVersionId() };
            this.attach(moved);
            this.documents.set(next, moved);
        }
    }
}

const registry = new Map<string, Documents>();

export function documentsFor(server: string, state: WorkbenchState): Documents {
    let documents = registry.get(server);
    if (!documents) {
        documents = new Documents(server, state);
        registry.set(server, documents);
    }

    return documents;
}
