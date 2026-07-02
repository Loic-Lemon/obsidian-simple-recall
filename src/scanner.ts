import { App, TFile, TFolder, TAbstractFile, CachedMetadata } from 'obsidian';
import { RecallNote } from './types';
import { loadCsv, saveCsv, removeNoteFromCsv, updateNoteInCsv, replaceNotePath } from './data';

function getFilesInFolder(
	folder: TFolder,
	includeSubfolders: boolean,
): TFile[] {
	const files: TFile[] = [];
	for (const child of folder.children) {
		if (child instanceof TFile && child.extension === 'md') {
			files.push(child);
		} else if (
			child instanceof TFolder &&
			includeSubfolders
		) {
			files.push(...getFilesInFolder(child, true));
		}
	}
	return files;
}

function noteFromFile(
	file: TFile,
	cache: CachedMetadata | null,
): RecallNote {
	const fm = cache?.frontmatter ?? {};

	const tags: string[] = [];
	if (Array.isArray(fm.tags)) {
		tags.push(...fm.tags.map(String));
	} else if (typeof fm.tags === 'string') {
		tags.push(...fm.tags.split(/[,;]/).map((s: string) => s.trim()));
	}

	return {
		path: file.path,
		title: typeof fm.title === 'string' ? fm.title : file.basename,
		tags,
		noteType:
			typeof fm.type === 'string'
				? fm.type
				: typeof fm.note_type === 'string'
					? fm.note_type
					: '',
		createdAt:
			typeof fm.created === 'string'
				? fm.created
				: typeof fm.created_at === 'string'
					? fm.created_at
					: file.stat.ctime.toString(),
		lastReviewed: '',
		totalReviews: 0,
		understandingRating: 3,
	};
}

export async function scanFolders(
	app: App,
	folderPaths: string[],
	includeSubfolders: boolean,
	csvPath: string,
): Promise<void> {
	const existing = await loadCsv(app, csvPath);
	const updated = new Map<string, RecallNote>();

	for (const n of existing) {
		updated.set(n.path, n);
	}

	const root = app.vault.getRoot();

	for (const folderPath of folderPaths) {
		let folder = root;
		if (folderPath && folderPath !== '/') {
			const found = app.vault.getFolderByPath(folderPath);
			if (!found) continue;
			folder = found;
		}
		if (!(folder instanceof TFolder)) continue;

		const mdFiles = getFilesInFolder(folder, includeSubfolders);

		for (const file of mdFiles) {
			const cache = app.metadataCache.getFileCache(file);
			const existingNote = updated.get(file.path);

			if (existingNote) {
				const fm = cache?.frontmatter ?? {};
				existingNote.title =
					typeof fm.title === 'string' ? fm.title : file.basename;
				const tags: string[] = [];
				if (Array.isArray(fm.tags)) {
					tags.push(...fm.tags.map(String));
				} else if (typeof fm.tags === 'string') {
					tags.push(
						...fm.tags.split(/[,;]/).map((s: string) => s.trim()),
					);
				}
				existingNote.tags = tags;
				existingNote.noteType =
					typeof fm.type === 'string'
						? fm.type
						: typeof fm.note_type === 'string'
							? fm.note_type
							: '';
			} else {
				updated.set(file.path, noteFromFile(file, cache));
			}
		}
	}

	const pathsInFolders = new Set<string>();
	for (const folderPath of folderPaths) {
		const folder = app.vault.getFolderByPath(folderPath);
		if (!folder || !(folder instanceof TFolder)) continue;
		const files = getFilesInFolder(folder, includeSubfolders);
		for (const file of files) {
			pathsInFolders.add(file.path);
		}
	}

	for (const path of updated.keys()) {
		if (!pathsInFolders.has(path)) {
			updated.delete(path);
		}
	}

	const result = Array.from(updated.values());
	await saveCsv(app, csvPath, result);
}

export function isFileInTargetFolders(
	filePath: string,
	folderPaths: string[],
	includeSubfolders: boolean,
): boolean {
	for (const folder of folderPaths) {
		if (includeSubfolders) {
			if (folder === '' || filePath === folder || filePath.startsWith(folder + '/')) return true;
		} else {
			const dir = filePath.split('/').slice(0, -1).join('/') + '/';
			if (dir === folder || (folder === '' && !dir.includes('/'))) return true;
		}
	}
	return false;
}

export async function handleFileCreated(
	app: App,
	file: TAbstractFile,
	folderPaths: string[],
	includeSubfolders: boolean,
	csvPath: string,
): Promise<void> {
	if (!(file instanceof TFile) || file.extension !== 'md') return;
	if (!isFileInTargetFolders(file.path, folderPaths, includeSubfolders)) return;

	const cache = app.metadataCache.getFileCache(file);
	const note = noteFromFile(file, cache);
	await updateNoteInCsv(app, csvPath, note);
}

export async function handleFileDeleted(
	app: App,
	filePath: string,
	csvPath: string,
): Promise<void> {
	await removeNoteFromCsv(app, csvPath, filePath);
}

export async function handleFileRenamed(
	app: App,
	file: TAbstractFile,
	oldPath: string,
	folderPaths: string[],
	includeSubfolders: boolean,
	csvPath: string,
): Promise<void> {
	const wasInFolder = isFileInTargetFolders(
		oldPath,
		folderPaths,
		includeSubfolders,
	);
	const isInFolder =
		file instanceof TFile &&
		isFileInTargetFolders(file.path, folderPaths, includeSubfolders);

	if (wasInFolder && !isInFolder) {
		await removeNoteFromCsv(app, csvPath, oldPath);
	} else if (isInFolder && file instanceof TFile) {
		const cache = app.metadataCache.getFileCache(file);
		const newNote = noteFromFile(file, cache);
		const replaced = await replaceNotePath(app, csvPath, oldPath, newNote);
		if (!replaced) {
			await updateNoteInCsv(app, csvPath, newNote);
		}
	}
}
