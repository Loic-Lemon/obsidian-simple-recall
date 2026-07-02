import { App, Notice, PluginSettingTab, Setting, TFolder, AbstractInputSuggest } from 'obsidian';
import type SimpleRecallPlugin from './main';
import { SimpleRecallSettings, DEFAULT_SETTINGS } from './types';

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private inputEl: HTMLInputElement,
		private onSelectCallback: (folderPath: string) => void,
	) {
		super(app, inputEl);
	}

	getSuggestions(inputStr: string): TFolder[] {
		const allFolders = this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder);

		return allFolders.filter((folder) =>
			folder.path.toLowerCase().includes(inputStr.toLowerCase()),
		);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path || '/');
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path || '/';
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
		this.onSelectCallback(folder.path || '/');
	}
}

export { DEFAULT_SETTINGS };
export type { SimpleRecallSettings };

export class SimpleRecallSettingTab extends PluginSettingTab {
	plugin: SimpleRecallPlugin;

	constructor(app: App, plugin: SimpleRecallPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Review setup')
			.setHeading();

		this.renderFolderList(containerEl);

		new Setting(containerEl)
			.setName('Notes per session')
			.setDesc('How many notes to review each session (default: 3)')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.notesPerSession)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.notesPerSession = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Include subfolders')
			.setDesc(
				'Scan notes in subfolders of the target folders as well',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSubfolders)
					.onChange(async (value) => {
						this.plugin.settings.includeSubfolders = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Tracking CSV path')
			.setDesc(
				'Path for the tracking CSV file within your vault (must end with .CSV)',
			)
			.addText((text) =>
				text
					.setPlaceholder('simple-recall.csv')
					.setValue(this.plugin.settings.trackingCsvPath)
					.onChange(async (value) => {
						this.plugin.settings.trackingCsvPath = value || 'simple-recall.csv';
						if (
							this.plugin.settings.trackingCsvPath ===
							this.plugin.settings.historyCsvPath
						) {
							new Notice(
								'Tracking and history CSV paths must be different!',
							);
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('History CSV path')
			.setDesc(
				'Path for the review history CSV file within your vault (must end with .CSV)',
			)
			.addText((text) =>
				text
					.setPlaceholder('simple-recall-history.csv')
					.setValue(this.plugin.settings.historyCsvPath)
					.onChange(async (value) => {
						this.plugin.settings.historyCsvPath =
							value || 'simple-recall-history.csv';
						if (
							this.plugin.settings.trackingCsvPath ===
							this.plugin.settings.historyCsvPath
						) {
							new Notice(
								'Tracking and history CSV paths must be different!',
							);
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Auto-scan on startup')
			.setDesc(
				'Automatically scan target folders when Obsidian starts',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoScanOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.autoScanOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Rescan now')
			.setDesc(
				'Manually rescan all target folders and sync the CSV',
			)
			.addButton((btn) =>
				btn.setButtonText('Rescan').onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText('Scanning...');
					await this.plugin.scanNow();
					btn.setDisabled(false);
					btn.setButtonText('Rescan');
				}),
			);
	}

	private renderFolderList(containerEl: HTMLElement): void {
		const folders = this.plugin.settings.targetFolders;

		new Setting(containerEl)
			.setName('Target folders')
			.setHeading();

		const listEl = containerEl.createDiv({
			cls: 'simple-recall-folder-list',
		});

		for (let i = 0; i < folders.length; i++) {
			const folderEl = listEl.createDiv({
				cls: 'simple-recall-folder-item',
			});

			folderEl.createSpan({ text: folders[i] });

			const removeBtn = folderEl.createEl('button', {
				text: 'Remove',
				cls: 'simple-recall-remove-folder-btn',
			});
			const idx = i;
			removeBtn.addEventListener('click', () => {
				this.plugin.settings.targetFolders.splice(idx, 1);
				void this.plugin.saveSettings().then(() => this.display());
			});
		}

		const addRow = containerEl.createDiv({
			cls: 'simple-recall-add-folder',
		});

		const input = addRow.createEl('input', {
			type: 'text',
			placeholder: 'Folder path (e.g. Notes/)',
			cls: 'simple-recall-folder-input',
		});

		new FolderSuggest(this.app, input, (folderPath) => {
			if (
				folderPath &&
				!this.plugin.settings.targetFolders.includes(folderPath)
			) {
				this.plugin.settings.targetFolders.push(folderPath);
				void this.plugin.saveSettings().then(() => this.display());
			}
		});

		const addBtn = addRow.createEl('button', {
			text: 'Add',
			cls: 'simple-recall-add-folder-btn',
		});
		addBtn.addEventListener('click', () => {
			const path = input.value.trim();
			if (path && !this.plugin.settings.targetFolders.includes(path)) {
				const folder = this.app.vault.getFolderByPath(path);
				if (folder) {
					this.plugin.settings.targetFolders.push(path);
					void this.plugin.saveSettings().then(() => this.display());
				}
			}
		});
	}
}
