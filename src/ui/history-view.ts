import { ItemView, WorkspaceLeaf } from 'obsidian';
import { HistoryRow, SimpleRecallSettings } from '../types';
import { loadHistoryRows } from '../data';

export const REVIEW_HISTORY_VIEW = 'simple-recall-review-history';

export class ReviewHistoryView extends ItemView {
	private rows: HistoryRow[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private getSettings: () => SimpleRecallSettings,
	) {
		super(leaf);
	}

	getViewType(): string {
		return REVIEW_HISTORY_VIEW;
	}

	getDisplayText(): string {
		return 'Review history';
	}

	getIcon(): string {
		return 'history';
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async refresh(): Promise<void> {
		this.rows = await loadHistoryRows(
			this.app,
			this.getSettings().historyCsvPath,
		);
		this.render();
	}

	private render(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (this.rows.length === 0) {
			containerEl.createDiv({
				cls: 'simple-recall-history-empty',
				text: 'No review history yet.\nStart a review session to see entries here.',
			});
			return;
		}

		const scrollEl = containerEl.createDiv({
			cls: 'simple-recall-history-scroll',
		});

		const groups = this.groupRows();
		const groupLabels = ['Today', 'Past 7 days', 'Past 30 days', 'Older'];

		for (const label of groupLabels) {
			const groupRows = groups.get(label);
			if (!groupRows || groupRows.length === 0) continue;

			scrollEl.createDiv({
				cls: 'simple-recall-history-group-header',
				text: label,
			});

			for (const row of groupRows) {
				const entryEl = scrollEl.createDiv({
					cls: 'simple-recall-history-entry',
				});

				const leftEl = entryEl.createDiv({
					cls: 'simple-recall-history-left',
				});

				const starsEl = leftEl.createDiv({
					cls: 'simple-recall-history-stars',
				});
				starsEl.setText(this.starsText(row.rating));
				if (row.rating <= 2) starsEl.addClass('simple-recall-rating-low');
				else if (row.rating >= 4) starsEl.addClass('simple-recall-rating-high');

				const titleEl = leftEl.createSpan({
					cls: 'simple-recall-history-title',
					text: row.title,
				});
				titleEl.addEventListener('click', () => {
					this.openNote(row.path);
				});

				entryEl.createDiv({
					cls: 'simple-recall-history-meta',
					text: `${this.relativeDate(row.date)} · Review #${row.totalReviews}`,
				});
			}
		}
	}

	private parseLocalDate(s: string): Date | null {
		const datePart = s.split('T')[0];
		if (!datePart) return null;
		const parts = datePart.split('-');
		if (parts.length < 3) return null;
		return new Date(
			parseInt(parts[0]!, 10),
			parseInt(parts[1]!, 10) - 1,
			parseInt(parts[2]!, 10),
		);
	}

	private localMidnight(d: Date): number {
		return new Date(
			d.getFullYear(),
			d.getMonth(),
			d.getDate(),
		).getTime();
	}

	private groupRows(): Map<string, HistoryRow[]> {
		const groups = new Map<string, HistoryRow[]>();
		const nowMs = this.localMidnight(new Date());
		const msInDay = 1000 * 60 * 60 * 24;

		const todayMs = nowMs;
		const sevenDaysAgoMs = nowMs - 6 * msInDay;
		const thirtyDaysAgoMs = nowMs - 29 * msInDay;

		for (const row of this.rows) {
			const rowDate = this.parseLocalDate(row.date);
			if (!rowDate) continue;
			const rowMs = rowDate.getTime();

			let label: string;
			if (rowMs >= todayMs) {
				label = 'Today';
			} else if (rowMs >= sevenDaysAgoMs) {
				label = 'Past 7 days';
			} else if (rowMs >= thirtyDaysAgoMs) {
				label = 'Past 30 days';
			} else {
				label = 'Older';
			}

			let group = groups.get(label);
			if (!group) {
				group = [];
				groups.set(label, group);
			}
			group.push(row);
		}

		return groups;
	}

	private starsText(rating: number): string {
		const filled = Math.min(5, Math.max(0, rating));
		return '★'.repeat(filled) + '☆'.repeat(5 - filled);
	}

	private relativeDate(dateStr: string): string {
		if (!dateStr) return '';
		const rowDate = this.parseLocalDate(dateStr);
		if (!rowDate) return '';
		const diffDays = Math.floor(
			(this.localMidnight(new Date()) - rowDate.getTime()) /
				(1000 * 60 * 60 * 24),
		);
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		return `${diffDays}d ago`;
	}

	private openNote(path: string): void {
		const file = this.app.vault.getFileByPath(path);
		if (file) {
			void this.app.workspace.getLeaf('tab').openFile(file);
		}
	}
}
