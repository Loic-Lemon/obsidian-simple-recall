import { App, Notice } from 'obsidian';
import { ReviewSession, PickedNote, SimpleRecallSettings } from './types';
import { pickNotes, refreshNote } from './algorithm';
import {
	loadCsv,
	updateNoteInCsv,
	appendHistoryRow,
	historyRow,
} from './data';

export class ReviewManager {
	private session: ReviewSession | null = null;
	private currentIndex: number = -1;

	onStateChange: (() => void) | null = null;

	constructor(
		private app: App,
		private getSettings: () => SimpleRecallSettings,
	) {}

	getSession(): ReviewSession | null {
		return this.session;
	}

	async startSession(): Promise<PickedNote[] | null> {
		const settings = this.getSettings();
		const allNotes = await loadCsv(this.app, settings.trackingCsvPath);

		if (allNotes.length === 0) {
			new Notice(
				'No notes found in CSV. Run rescan folders first.',
			);
			return null;
		}

		const picked = pickNotes(allNotes, settings.notesPerSession);

		if (picked.length === 0) {
			new Notice('No notes available for review.');
			return null;
		}

		this.session = {
			picked,
			reviewed: new Set(),
			startedAt: Date.now(),
		};
		this.currentIndex = -1;

		this.onStateChange?.();

		return picked;
	}

	async refreshAll(): Promise<PickedNote[] | null> {
		if (!this.session) return null;

		const settings = this.getSettings();
		const allNotes = await loadCsv(this.app, settings.trackingCsvPath);
		const exclude = new Set<string>();
		for (const p of this.session.picked) {
			if (this.session.reviewed.has(p.note.path)) {
				exclude.add(p.note.path);
			}
		}

		const picked = pickNotes(
			allNotes.filter((n) => !exclude.has(n.path)),
			settings.notesPerSession - this.session.reviewed.size,
			exclude,
		);

		const reviewed = this.session.picked.filter((p) =>
			this.session!.reviewed.has(p.note.path),
		);
		this.session.picked = [...reviewed, ...picked];

		return this.session.picked;
	}

	async refreshOne(
		index: number,
	): Promise<PickedNote | null> {
		if (!this.session || index >= this.session.picked.length)
			return null;

		const settings = this.getSettings();
		const allNotes = await loadCsv(this.app, settings.trackingCsvPath);

		const result = refreshNote(allNotes, this.session.picked, index);

		if (result) {
			this.session.reviewed.delete(
				this.session.picked[index]!.note.path,
			);
			this.session.picked[index] = result;
		}

		return result;
	}

	getCurrentPicked(): PickedNote[] {
		if (!this.session) return [];
		return this.session.picked.filter(
			(p) => !this.session!.reviewed.has(p.note.path),
		);
	}

	isNoteInSession(path: string): boolean {
		if (!this.session) return false;
		return this.session.picked.some((p) => p.note.path === path);
	}

	isNoteReviewed(path: string): boolean {
		if (!this.session) return false;
		return this.session.reviewed.has(path);
	}

	async markReviewed(
		notePath: string,
		rating: number,
	): Promise<void> {
		if (!this.session) return;
		if (this.session.reviewed.has(notePath)) return;

		const settings = this.getSettings();
		const allNotes = await loadCsv(this.app, settings.trackingCsvPath);
		const note = allNotes.find((n) => n.path === notePath);
		if (!note) return;

		note.lastReviewed = new Date().toISOString();
		note.totalReviews += 1;
		note.understandingRating = rating;

		await updateNoteInCsv(this.app, settings.trackingCsvPath, note);
		await appendHistoryRow(
			this.app,
			settings.historyCsvPath,
			historyRow(note, rating),
		);

		this.session.reviewed.add(notePath);

		if (this.session.reviewed.size >= this.session.picked.length) {
			const elapsed = Math.round(
				(Date.now() - this.session.startedAt) / 1000,
			);
			new Notice(
				`Daily review complete! ${this.session.picked.length} notes refreshed in ${elapsed}s.`,
			);
			this.session = null;
			this.currentIndex = -1;
		}

		this.onStateChange?.();
	}

	cancelSession(): void {
		this.session = null;
		this.currentIndex = -1;
		this.onStateChange?.();
	}
}
