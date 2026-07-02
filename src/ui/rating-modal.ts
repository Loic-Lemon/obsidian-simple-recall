import { App, Modal } from 'obsidian';

export class RatingModal extends Modal {
	private submitted = false;

	constructor(
		app: App,
		private noteTitle: string,
		private onSubmit: (rating: number) => void,
		private onCancel?: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', {
			text: `How well did you know "${this.noteTitle}"?`,
		});

		const btnContainer = contentEl.createDiv({
			cls: 'simple-recall-rating-buttons',
		});

		const labels = ['Forgot', 'Vague', 'Mixed', 'Mostly', 'Knew it cold'];

		for (let i = 1; i <= 5; i++) {
			const btnWrapper = btnContainer.createDiv({
				cls: 'simple-recall-rating-btn-wrapper',
			});

			const btn = btnWrapper.createEl('button', {
				text: i.toString(),
				cls: 'simple-recall-rating-btn',
			});
			btn.addEventListener('click', () => {
				this.submitted = true;
				this.onSubmit(i);
				this.close();
			});

			const label = btnWrapper.createDiv({
				text: labels[i - 1] || '',
				cls: 'simple-recall-rating-label',
			});
			if (i === 1) label.addClass('simple-recall-rating-label-left');
			if (i === 5) label.addClass('simple-recall-rating-label-right');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.submitted) {
			this.onCancel?.();
		}
	}
}
