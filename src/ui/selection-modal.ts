import { App, Modal, Notice } from 'obsidian';
import { PickedNote } from '../types';
import { ReviewManager } from '../review';
import { daysSince } from '../data';

export class SelectionModal extends Modal {
	private picked: PickedNote[];

	constructor(
		app: App,
		private reviewManager: ReviewManager,
		picked: PickedNote[],
		private onGo: (note: PickedNote) => void,
		private reviewed: Set<string> = new Set(),
	) {
		super(app);
		this.picked = [...picked];
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: "Today's review notes" });

		const listEl = contentEl.createDiv({ cls: 'simple-recall-list' });

		this.picked.forEach((picked, index) => {
			const note = picked.note;
			const isReviewed = this.reviewed.has(note.path);

			const rowEl = listEl.createDiv({
				cls: 'simple-recall-row',
			});

			const infoEl = rowEl.createDiv({ cls: 'simple-recall-info' });

			if (isReviewed) {
				infoEl.createEl('strong', {
					text: note.title,
					cls: 'simple-recall-reviewed-title',
				});

				const metaEl = infoEl.createDiv({
					cls: 'simple-recall-meta',
				});
				metaEl.createSpan({
					text: '✓ Reviewed',
					cls: 'simple-recall-reviewed-label',
				});
			} else {
				const d = daysSince(note.lastReviewed);
				const dLabel =
					d === Infinity || note.totalReviews === 0
						? 'Never reviewed'
						: `${d} day${d === 1 ? '' : 's'} since review`;

				infoEl.createEl('strong', {
					text: note.title,
				});

				const metaEl = infoEl.createDiv({
					cls: 'simple-recall-meta',
				});
				metaEl.createSpan({
					text: dLabel,
					cls: d > 30 ? 'simple-recall-overdue' : '',
				});

				if (note.tags.length > 0) {
					metaEl.createSpan({
						text: ' — ' + note.tags.slice(0, 3).join(', '),
						cls: 'simple-recall-tags',
					});
				}

				const actionsEl = rowEl.createDiv({
					cls: 'simple-recall-actions',
				});

				const refreshBtn = actionsEl.createEl('button', {
					text: '↻',
					cls: 'simple-recall-refresh-btn',
					attr: { 'aria-label': 'Pick a different note' },
				});
				refreshBtn.addEventListener('click', () => {
					if (
						!confirm(
							'Replace this note with a different one?',
						)
					)
						return;
					refreshBtn.disabled = true;
					refreshBtn.setText('...');
					void this.reviewManager
						.refreshOne(index)
						.then((result) => {
							if (result) {
								this.picked[index] = result;
							} else {
								new Notice(
									'No other notes available in this category.',
								);
							}
							this.render();
						});
				});

				const goBtn = actionsEl.createEl('button', {
					text: 'Go',
					cls: 'simple-recall-go-btn',
				});
				goBtn.addEventListener('click', () => {
					this.close();
					this.onGo(picked);
				});
			}
		});

		const bottomEl = contentEl.createDiv({
			cls: 'simple-recall-bottom',
		});

		const refreshAllBtn = bottomEl.createEl('button', {
			text: 'Refresh all',
			cls: 'simple-recall-refresh-all-btn',
		});
		refreshAllBtn.addEventListener('click', () => {
			if (
				!confirm(
					'Replace all unreviewed notes with new picks?',
				)
			)
				return;
			refreshAllBtn.disabled = true;
			refreshAllBtn.setText('Refreshing...');
			void this.reviewManager.refreshAll().then((result) => {
				if (result) {
					this.picked = result;
				}
				this.render();
			});
		});

		const cancelBtn = bottomEl.createEl('button', {
			text: 'Cancel',
			cls: 'simple-recall-cancel-btn',
		});
		cancelBtn.addEventListener('click', () => {
			this.reviewManager.cancelSession();
			this.close();
		});
	}
}
