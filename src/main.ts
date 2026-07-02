import { Plugin, Notice, TAbstractFile } from 'obsidian';
import { SimpleRecallSettings, DEFAULT_SETTINGS } from './types';
import { SimpleRecallSettingTab } from './settings';
import { ReviewManager } from './review';
import { SelectionModal } from './ui/selection-modal';
import { RatingModal } from './ui/rating-modal';
import { ReviewHistoryView, REVIEW_HISTORY_VIEW } from './ui/history-view';
import {
	scanFolders,
	handleFileCreated,
	handleFileDeleted,
	handleFileRenamed,
} from './scanner';
import { PickedNote } from './types';

export default class SimpleRecallPlugin extends Plugin {
	settings!: SimpleRecallSettings;
	reviewManager!: ReviewManager;
	private ribbonIconEl: HTMLElement | null = null;
	private statusBarItem: HTMLElement | null = null;
	private pendingReviewPath: string | null = null;

	async onload() {
		await this.loadSettings();
		this.reviewManager = new ReviewManager(this.app, () => this.settings);

		this.reviewManager.onStateChange = () => {
			this.updateStatusBar();
			this.updateRibbon();
			if (!this.reviewManager.getSession()) {
				this.pendingReviewPath = null;
			}
		};

		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('simple-recall-status-bar');
		this.statusBarItem.addEventListener('click', () => {
			void this.markReviewed();
		});
		this.statusBarItem.hide();

		this.ribbonIconEl = this.addRibbonIcon('book-open', 'Simple recall', () => {
			void this.startReview();
		});

		this.addCommand({
			id: 'simple-recall-start-review',
			name: 'Start daily review',
			callback: () => void this.startReview(),
		});

		this.addCommand({
			id: 'simple-recall-mark-reviewed',
			name: 'Mark as reviewed',
			callback: () => void this.markReviewed(),
		});

		this.addCommand({
			id: 'simple-recall-rescan',
			name: 'Rescan folders',
			callback: () => void this.scanNow(),
		});

		this.addCommand({
			id: 'simple-recall-show-history',
			name: 'Show review history',
			callback: () => void this.openHistoryView(),
		});

		this.registerView(
			REVIEW_HISTORY_VIEW,
			(leaf) => new ReviewHistoryView(leaf, () => this.settings),
		);

		this.addSettingTab(new SimpleRecallSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(async () => {
			if (this.settings.autoScanOnStartup) {
				await this.scanNow();
			}

			this.registerEvent(
				this.app.vault.on('create', (file: TAbstractFile) => {
					this.onFileCreated(file);
				}),
			);

			this.registerEvent(
				this.app.vault.on('delete', (file: TAbstractFile) => {
					this.onFileDeleted(file);
				}),
			);

			this.registerEvent(
				this.app.vault.on(
					'rename',
					(file: TAbstractFile, oldPath: string) => {
						this.onFileRenamed(file, oldPath);
					},
				),
			);
		});
	}

	onunload() {
		this.reviewManager.cancelSession();
	}

	async loadSettings() {
		const data: unknown = await this.loadData();
		if (data && typeof data === 'object') {
			this.settings = Object.assign(
				{},
				DEFAULT_SETTINGS,
				data,
			);
		} else {
			this.settings = { ...DEFAULT_SETTINGS };
		}
		if (this.settings.trackingCsvPath === this.settings.historyCsvPath) {
			new Notice(
				'Simple recall: tracking and history CSV paths are the same! Please fix in settings.',
			);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async scanNow() {
		if (this.settings.targetFolders.length === 0) return;
		try {
			await scanFolders(
				this.app,
				this.settings.targetFolders,
				this.settings.includeSubfolders,
				this.settings.trackingCsvPath,
			);
		} catch (e) {
			console.error('Simple Recall: scan error', e);
		}
	}

	private async startReview() {
		const session = this.reviewManager.getSession();
		if (session) {
			new SelectionModal(
				this.app,
				this.reviewManager,
				session.picked,
				(pickedNote: PickedNote) => {
					void this.openNoteForReview(pickedNote);
				},
				session.reviewed,
			).open();
			return;
		}

		this.pendingReviewPath = null;
		const picked = await this.reviewManager.startSession();
		if (!picked) return;

		new SelectionModal(
			this.app,
			this.reviewManager,
			picked,
			(pickedNote: PickedNote) => {
				void this.openNoteForReview(pickedNote);
			},
		).open();
	}

	private async openNoteForReview(pickedNote: PickedNote) {
		const file = this.app.vault.getFileByPath(pickedNote.note.path);
		if (!file) {
			new Notice('Note file not found.');
			return;
		}

		this.pendingReviewPath = pickedNote.note.path;
		await this.app.workspace.getLeaf('tab').openFile(file);

		const handler = () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile && activeFile.path === pickedNote.note.path) {
				new Notice(
					`Reviewing: ${pickedNote.note.title}. Use "Mark as reviewed" when done.`,
				);
				this.app.workspace.off('file-open', handler);
			}
		};
		this.registerEvent(
			this.app.workspace.on('file-open', handler),
		);
	}

	private async markReviewed() {
		const targetPath =
			this.pendingReviewPath
			?? this.app.workspace.getActiveFile()?.path
			?? null;

		if (!targetPath) {
			new Notice('No active file open.');
			return;
		}

		if (!this.reviewManager.isNoteInSession(targetPath)) {
			new Notice('This note is not part of the current review session.');
			return;
		}

		if (this.reviewManager.isNoteReviewed(targetPath)) {
			new Notice('This note has already been reviewed in this session.');
			return;
		}

		const note = this.app.vault.getFileByPath(targetPath);
		if (!note) {
			new Notice('Note file not found.');
			return;
		}

		const cache = this.app.metadataCache.getFileCache(note);
		const fmTitle: unknown =
			cache?.frontmatter?.title;
		const title =
			typeof fmTitle === 'string' ? fmTitle : note.basename;

		new RatingModal(
			this.app,
			title,
			(rating: number) => {
				void this.reviewManager
					.markReviewed(targetPath, rating)
					.then(() => {
						this.refreshHistoryView();
						this.pendingReviewPath = null;
						const session = this.reviewManager.getSession();
						if (session) {
							new SelectionModal(
								this.app,
								this.reviewManager,
								session.picked,
								(pickedNote: PickedNote) => {
									void this.openNoteForReview(pickedNote);
								},
								session.reviewed,
							).open();
						}
					})
					.catch((err) => {
						console.error(
							'Simple Recall: markReviewed failed',
							err,
						);
						new Notice(
							'Failed to save review. Check console for details.',
						);
						this.pendingReviewPath = null;
						this.refreshHistoryView();
					});
			},
			() => {
				this.pendingReviewPath = null;
			},
		).open();
	}

	private async openHistoryView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(REVIEW_HISTORY_VIEW);
		if (existing.length > 0) {
			this.app.workspace.setActiveLeaf(existing[0]!);
			this.refreshHistoryView();
			return;
		}

		const leaf = this.app.workspace.getLeftLeaf(false);
		if (!leaf) {
			new Notice('Cannot open sidebar view.');
			return;
		}
		await leaf.setViewState({ type: REVIEW_HISTORY_VIEW, active: true });
	}

	private refreshHistoryView(): void {
		const leaves = this.app.workspace.getLeavesOfType(REVIEW_HISTORY_VIEW);
		for (const leaf of leaves) {
			if (leaf.view instanceof ReviewHistoryView) {
				void leaf.view.refresh();
			}
		}
	}

	private updateStatusBar(): void {
		if (!this.statusBarItem) return;
		const session = this.reviewManager.getSession();
		if (session) {
			const done = session.reviewed.size;
			const total = session.picked.length;
			if (done >= total) {
				this.statusBarItem.hide();
				return;
			}
			this.statusBarItem.setText(`★ ${done}/${total} reviewed`);
			this.statusBarItem.show();
		} else {
			this.statusBarItem.hide();
		}
	}

	private updateRibbon(): void {
		if (!this.ribbonIconEl) return;
		const session = this.reviewManager.getSession();
		this.ribbonIconEl.setAttribute(
			'aria-label',
			session ? 'Review session active' : 'Simple recall',
		);
	}

	private onFileCreated(file: TAbstractFile) {
		handleFileCreated(
			this.app,
			file,
			this.settings.targetFolders,
			this.settings.includeSubfolders,
			this.settings.trackingCsvPath,
		).catch((e) =>
			console.error('Simple Recall: file create handler error', e),
		);
	}

	private onFileDeleted(file: TAbstractFile) {
		handleFileDeleted(
			this.app,
			file.path,
			this.settings.trackingCsvPath,
		).catch((e) =>
			console.error('Simple Recall: file delete handler error', e),
		);
	}

	private onFileRenamed(file: TAbstractFile, oldPath: string) {
		handleFileRenamed(
			this.app,
			file,
			oldPath,
			this.settings.targetFolders,
			this.settings.includeSubfolders,
			this.settings.trackingCsvPath,
		).catch((e) =>
			console.error('Simple Recall: file rename handler error', e),
		);
	}
}
