import { App, normalizePath, Notice } from 'obsidian';
import { RecallNote, HistoryRow } from './types';

export function parseCsvLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
				current += '"';
				i++;
			} else if (ch === '"') {
				inQuotes = false;
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				result.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
	}
	result.push(current);
	return result;
}

export function toCsvValue(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return '"' + value.replace(/"/g, '""') + '"';
	}
	return value;
}

export function assertIsCsvPath(path: string): void {
	if (!path.toLowerCase().endsWith('.csv')) {
		const msg = `Invalid CSV path: "${path}" must end with .csv`;
		new Notice(msg);
		throw new Error(msg);
	}
}

export function csvRowToString(values: string[]): string {
	return values.map(toCsvValue).join(',');
}

export function noteToCsvRow(note: RecallNote): string[] {
	const lastReviewed = note.lastReviewed || '';
	const daysSinceReview = lastReviewed
		? Math.floor(
				(Date.now() - new Date(lastReviewed).getTime()) /
					(1000 * 60 * 60 * 24),
			).toString()
		: '';
	return [
		note.path,
		note.title,
		note.tags.join(';'),
		note.noteType,
		note.createdAt,
		lastReviewed,
		note.totalReviews.toString(),
		note.understandingRating.toString(),
		daysSinceReview,
	];
}

export function csvRowToNote(values: string[]): RecallNote | null {
	if (values.length < 8) return null;
	return {
		path: values[0] || '',
		title: values[1] || '',
		tags: (values[2] || '').split(';').filter(Boolean),
		noteType: values[3] || '',
		createdAt: values[4] || '',
		lastReviewed: values[5] || '',
		totalReviews: parseInt(values[6] || '0', 10),
		understandingRating: parseInt(values[7] || '3', 10),
	};
}

export function historyRow(
	note: RecallNote,
	rating: number,
): string[] {
	const now = new Date().toISOString();
	const daysSinceReview = note.lastReviewed
		? Math.floor(
				(Date.now() - new Date(note.lastReviewed).getTime()) /
					(1000 * 60 * 60 * 24),
			).toString()
		: 'new';
	return [
		now,
		note.path,
		note.title,
		rating.toString(),
		daysSinceReview,
		note.totalReviews.toString(),
	];
}

export async function loadCsv(
	app: App,
	path: string,
): Promise<RecallNote[]> {
	const normalizedPath = normalizePath(path);
	assertIsCsvPath(normalizedPath);
	const file = app.vault.getFileByPath(normalizedPath);
	if (!file) return [];

	try {
		const content = await app.vault.read(file);
		const lines = content.split('\n').filter((l) => l.trim().length > 0);
		if (lines.length <= 1) return [];

		return lines
			.slice(1)
			.map((line) => csvRowToNote(parseCsvLine(line)))
			.filter((n): n is RecallNote => n !== null);
	} catch {
		return [];
	}
}

export async function saveCsv(
	app: App,
	path: string,
	notes: RecallNote[],
): Promise<void> {
	const normalizedPath = normalizePath(path);
	assertIsCsvPath(normalizedPath);
	const header =
		'path,title,tags,note_type,created_at,last_reviewed,total_reviews,understanding_rating,days_since_review';
	const rows = notes.map((n) => csvRowToString(noteToCsvRow(n)));
	const content = [header, ...rows].join('\n');

	let file = app.vault.getFileByPath(normalizedPath);
	if (file) {
		await app.vault.modify(file, content);
	} else {
		const dir = (normalizedPath.split('/').slice(0, -1).join('/')) || '';
		if (dir) {
			const dirExists = app.vault.getFolderByPath(dir);
			if (!dirExists) {
				await app.vault.createFolder(dir);
			}
		}
		await app.vault.create(normalizedPath, content);
	}
}

export async function appendHistoryRow(
	app: App,
	path: string,
	values: string[],
): Promise<void> {
	const normalizedPath = normalizePath(path);
	assertIsCsvPath(normalizedPath);
	const row = csvRowToString(values);

	let file = app.vault.getFileByPath(normalizedPath);
	if (file) {
		const content = await app.vault.read(file);
		await app.vault.modify(
			file,
			content.replace(/\n*$/, '') + '\n' + row,
		);
	} else {
		const dir = (normalizedPath.split('/').slice(0, -1).join('/')) || '';
		if (dir) {
			const dirExists = app.vault.getFolderByPath(dir);
			if (!dirExists) {
				await app.vault.createFolder(dir);
			}
		}
		const header = 'date,path,title,rating,days_since_review,total_reviews';
		await app.vault.create(normalizedPath, header + '\n' + row);
	}
}

export async function updateNoteInCsv(
	app: App,
	csvPath: string,
	note: RecallNote,
): Promise<void> {
	const notes = await loadCsv(app, csvPath);
	const index = notes.findIndex((n) => n.path === note.path);
	if (index >= 0) {
		notes[index] = note;
	} else {
		notes.push(note);
	}
	await saveCsv(app, csvPath, notes);
}

export async function removeNoteFromCsv(
	app: App,
	csvPath: string,
	notePath: string,
): Promise<void> {
	const notes = await loadCsv(app, csvPath);
	const filtered = notes.filter((n) => n.path !== notePath);
	if (filtered.length !== notes.length) {
		await saveCsv(app, csvPath, filtered);
	}
}

export async function replaceNotePath(
	app: App,
	csvPath: string,
	oldPath: string,
	newNote: RecallNote,
): Promise<boolean> {
	const notes = await loadCsv(app, csvPath);
	const index = notes.findIndex((n) => n.path === oldPath);
	if (index >= 0) {
		notes[index] = newNote;
		await saveCsv(app, csvPath, notes);
		return true;
	}
	console.warn(
		`replaceNotePath: old path "${oldPath}" not found in CSV`,
	);
	return false;
}

export function loadHistoryRows(
	app: App,
	path: string,
): Promise<HistoryRow[]> {
	const normalizedPath = normalizePath(path);
	assertIsCsvPath(normalizedPath);
	const file = app.vault.getFileByPath(normalizedPath);
	if (!file) return Promise.resolve([]);

	return app.vault.read(file).then((content) => {
		const lines = content.split('\n').filter((l) => l.trim().length > 0);
		if (lines.length <= 1) return [];

		const rows: HistoryRow[] = [];
		for (let i = 1; i < lines.length; i++) {
			const vals = parseCsvLine(lines[i]!);
			if (vals.length < 6) continue;
			const d = vals[4]!;
			rows.push({
				date: vals[0] || '',
				path: vals[1] || '',
				title: vals[2] || '',
				rating: parseInt(vals[3] || '0', 10),
				daysSinceReview: d === '' || d === 'new' ? null : parseInt(d, 10),
				totalReviews: parseInt(vals[5] || '0', 10),
			});
		}
		rows.sort((a, b) => b.date.localeCompare(a.date));
		return rows;
	});
}

export function daysSince(dateStr: string): number {
	if (!dateStr) return Infinity;
	const date = new Date(dateStr);
	if (isNaN(date.getTime())) return Infinity;
	const diff = Date.now() - date.getTime();
	return Math.floor(diff / (1000 * 60 * 60 * 24));
}
