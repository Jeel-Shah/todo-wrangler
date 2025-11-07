import { App, Editor, MarkdownView, Modal, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface CustomTag {
	name: string;           // e.g., "TODO"
	completedForm: string;  // e.g., "DONE"
	enabled: boolean;
}

interface TodoCaptureSettings {
	keyword: string;
	customTags: CustomTag[];
	enableCustomTags: boolean;
	preserveHeadings: boolean;
	showCompletedItems: boolean;
}

const DEFAULT_SETTINGS: TodoCaptureSettings = {
	keyword: 'TODO',
	customTags: [
		{ name: 'TODO', completedForm: 'DONE', enabled: true },
		{ name: 'FIXME', completedForm: 'FIXED', enabled: true },
		{ name: 'NOTE', completedForm: 'NOTED', enabled: true },
		{ name: 'REVIEW', completedForm: 'REVIEWED', enabled: true }
	],
	enableCustomTags: false,
	preserveHeadings: true,
	showCompletedItems: true
}

export default class TodoCapture extends Plugin {
	settings: TodoCaptureSettings;

	async extractTodosFromCurrentNote(editor: Editor, view: MarkdownView): Promise<void> {
		if (!editor) {
			console.error('Editor is not defined');
			return;
		}

		// Use custom tags if enabled, otherwise fall back to legacy keyword
		if (this.settings.enableCustomTags) {
			await this.extractWithCustomTags(editor);
		} else {
			await this.extractWithLegacyKeyword(editor);
		}
	}

	async extractWithLegacyKeyword(editor: Editor): Promise<void> {
		const keyword = this.settings.keyword || 'TODO';

		// Here, we account for bulleted lines and lines with checkboxes
		const patternToMatch = new RegExp('^-?\\s*(\\[\\s?(|)x?\\])?\\s*' + keyword);
		const todoHeading = `## ${keyword}s`;

		const content = editor.getValue();
		const lines = content.split('\n');

		let todos: string[] = [];
		let modifiedContent: string[] = [];
		let inTodoSection = false;
		let hasTodoSection = false;

		lines.forEach(line => {

			if (patternToMatch.test(line)) {
				todos.push(line);
			} else if (line.trim() === todoHeading.trim()){
				inTodoSection = true;
				hasTodoSection = true;
				modifiedContent.push(line);
			} else {

				if (inTodoSection && line.trim() === "") {

				} else if (inTodoSection) {
					inTodoSection = false;
				}

				modifiedContent.push(line);
			}
		});

		if (todos.length > 0) {
			if (!hasTodoSection) {
				modifiedContent.push(todoHeading);
			}

			modifiedContent.push(...todos);
			editor.setValue(modifiedContent.join('\n'));
		}
	}

	async extractWithCustomTags(editor: Editor): Promise<void> {
		const content = editor.getValue();
		const lines = content.split('\n');

		const enabledTags = this.settings.customTags.filter(tag => tag.enabled);

		// Build a map of tag categories: tag name -> list of lines
		const taggedLines: Map<string, string[]> = new Map();
		const completedLines: string[] = [];
		const modifiedContent: string[] = [];
		const existingSections = new Set<string>();

		// Track which section headings we're inside
		let currentSection: string | null = null;

		lines.forEach(line => {
			const trimmedLine = line.trim();

			// Check if this line is a markdown heading (starts with #)
			const isHeading = /^#+\s/.test(trimmedLine);

			// Check if line is in an existing consolidated section
			const sectionMatch = trimmedLine.match(/^##\s+(\w+)s$/);
			if (sectionMatch) {
				currentSection = sectionMatch[1];
				existingSections.add(currentSection);
				modifiedContent.push(line);
				return;
			}

			// If we're in a consolidated section, skip empty lines
			if (currentSection && trimmedLine === "") {
				return;
			}

			// If we're in a consolidated section and hit non-empty content, exit section
			if (currentSection && trimmedLine !== "") {
				currentSection = null;
			}

			// Check if line contains any enabled tags
			let foundTag: CustomTag | null = null;
			let isCompleted = false;

			for (const tag of enabledTags) {
				// Build pattern for both active and completed forms
				// Matches: "TODO:", "- TODO:", "- [ ] TODO:", "- [x] TODO:", "## TODO:", etc.
				const activePattern = new RegExp(`^(#+\\s+|-\\s*(\\[\\s*\\])?\\s*)?${tag.name}\\s*:?`, 'i');
				const completedPattern = new RegExp(`^(#+\\s+|-\\s*(\\[x\\])?\\s*)?${tag.completedForm}\\s*:?`, 'i');

				if (activePattern.test(trimmedLine)) {
					foundTag = tag;
					isCompleted = false;
					break;
				} else if (completedPattern.test(trimmedLine)) {
					foundTag = tag;
					isCompleted = true;
					break;
				}
			}

			if (foundTag) {
				// If this is a heading and preserveHeadings is enabled, keep it in place
				if (isHeading && this.settings.preserveHeadings) {
					modifiedContent.push(line);
				} else {
					// Consolidate this line
					if (isCompleted && this.settings.showCompletedItems) {
						completedLines.push(line);
					} else if (!isCompleted) {
						if (!taggedLines.has(foundTag.name)) {
							taggedLines.set(foundTag.name, []);
						}
						taggedLines.get(foundTag.name)!.push(line);
					}
				}
			} else {
				modifiedContent.push(line);
			}
		});

		// Add consolidated sections at the end
		if (taggedLines.size > 0 || completedLines.length > 0) {
			// Add a blank line before sections if content doesn't end with one
			if (modifiedContent.length > 0 && modifiedContent[modifiedContent.length - 1].trim() !== "") {
				modifiedContent.push("");
			}

			// Add sections for each tag type
			taggedLines.forEach((items, tagName) => {
				if (items.length > 0) {
					modifiedContent.push(`## ${tagName}s`);
					modifiedContent.push(...items);
				}
			});

			// Add completed section
			if (completedLines.length > 0 && this.settings.showCompletedItems) {
				modifiedContent.push("## Completed");
				modifiedContent.push(...completedLines);
			}
		}

		editor.setValue(modifiedContent.join('\n'));
	}

	async onload() {
		await this.loadSettings();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'todo-wrangler',
			name: 'Wrangle Todos',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.extractTodosFromCurrentNote(editor, view);
			}
		});

		// Command to mark tag as done on current line
		this.addCommand({
			id: 'mark-tag-as-done',
			name: 'Mark Tag as Done',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.markTagAsDone(editor);
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TodoCaptureSettingTab(this.app, this));
	}

	markTagAsDone(editor: Editor): void {
		if (!this.settings.enableCustomTags) {
			console.warn('Custom tags are not enabled');
			return;
		}

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const enabledTags = this.settings.customTags.filter(tag => tag.enabled);

		// Check if current line contains a tag
		for (const tag of enabledTags) {
			const pattern = new RegExp(`^(#+\\s+|-\\s*(\\[\\s*\\])?\\s*)?${tag.name}\\s*:?`, 'i');

			if (pattern.test(line.trim())) {
				// Replace tag with completed form
				// Handle checkbox if present
				let newLine = line.replace(
					new RegExp(`(#+\\s+|-\\s*)(\\[\\s*\\]\\s*)?${tag.name}`, 'i'),
					(match, prefix, checkbox) => {
						if (checkbox) {
							// Replace [ ] with [x]
							return `${prefix}[x] ${tag.completedForm}`;
						}
						return `${prefix}${tag.completedForm}`;
					}
				);

				editor.setLine(cursor.line, newLine);
				return;
			}
		}

		console.log('No recognized tag found on current line');
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TagEditModal extends Modal {
	tag: CustomTag;
	onSubmit: (tag: CustomTag) => void;

	constructor(app: App, tag: CustomTag, onSubmit: (tag: CustomTag) => void) {
		super(app);
		this.tag = { ...tag }; // Create a copy to avoid modifying original until submit
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const {contentEl} = this;

		contentEl.createEl('h2', {text: 'Edit Tag'});

		new Setting(contentEl)
			.setName('Tag Name')
			.setDesc('The tag to detect (e.g., TODO, FIXME)')
			.addText(text => text
				.setPlaceholder('TODO')
				.setValue(this.tag.name)
				.onChange((value) => {
					this.tag.name = value.toUpperCase();
				}));

		new Setting(contentEl)
			.setName('Completed Form')
			.setDesc('What the tag becomes when marked as done (e.g., DONE, FIXED)')
			.addText(text => text
				.setPlaceholder('DONE')
				.setValue(this.tag.completedForm)
				.onChange((value) => {
					this.tag.completedForm = value.toUpperCase();
				}));

		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('Cancel')
				.onClick(() => {
					this.close();
				}))
			.addButton(button => button
				.setButtonText('Save')
				.setCta()
				.onClick(() => {
					if (this.tag.name && this.tag.completedForm) {
						this.onSubmit(this.tag);
						this.close();
					}
				}));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class TodoCaptureSettingTab extends PluginSettingTab {
	plugin: TodoCapture;

	constructor(app: App, plugin: TodoCapture) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'TODO Wrangler Settings'});

		// Legacy keyword setting (for backward compatibility)
		new Setting(containerEl)
			.setName('Keyword')
			.setDesc('Specify the keyword you want to extract (e.g., TODO, DONE, etc.)')
			.addText(text => text
				.setPlaceholder('Enter a keyword to wrangle')
				.setValue(this.plugin.settings.keyword)
				.onChange(async (value) => {
					this.plugin.settings.keyword = value;
					await this.plugin.saveSettings();
				}));

		// Enable custom tags
		new Setting(containerEl)
			.setName('Enable Custom Tags')
			.setDesc('Enable support for multiple custom tags with done marking')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCustomTags)
				.onChange(async (value) => {
					this.plugin.settings.enableCustomTags = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide custom tag settings
				}));

		if (this.plugin.settings.enableCustomTags) {
			containerEl.createEl('h3', {text: 'Custom Tag Configuration'});

			// Preserve headings setting
			new Setting(containerEl)
				.setName('Preserve Headings')
				.setDesc('Keep tags in headings at their original location (don\'t move to consolidated section)')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.preserveHeadings)
					.onChange(async (value) => {
						this.plugin.settings.preserveHeadings = value;
						await this.plugin.saveSettings();
					}));

			// Show completed items setting
			new Setting(containerEl)
				.setName('Show Completed Items')
				.setDesc('Display completed items in consolidated sections')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showCompletedItems)
					.onChange(async (value) => {
						this.plugin.settings.showCompletedItems = value;
						await this.plugin.saveSettings();
					}));

			// Custom tags list
			containerEl.createEl('h4', {text: 'Tags'});

			this.plugin.settings.customTags.forEach((tag, index) => {
				const setting = new Setting(containerEl)
					.setName(`${tag.name} → ${tag.completedForm}`)
					.addToggle(toggle => toggle
						.setValue(tag.enabled)
						.onChange(async (value) => {
							this.plugin.settings.customTags[index].enabled = value;
							await this.plugin.saveSettings();
						}))
					.addButton(button => button
						.setButtonText('Edit')
						.onClick(() => {
							this.showTagEditModal(index);
						}))
					.addButton(button => button
						.setButtonText('Delete')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.customTags.splice(index, 1);
							await this.plugin.saveSettings();
							this.display(); // Refresh
						}));
			});

			// Add new tag button
			new Setting(containerEl)
				.addButton(button => button
					.setButtonText('+ Add New Tag')
					.setCta()
					.onClick(() => {
						this.showTagEditModal(-1); // -1 indicates new tag
					}));
		}
	}

	showTagEditModal(index: number) {
		const isNew = index === -1;
		const tag = isNew ? { name: '', completedForm: '', enabled: true } : this.plugin.settings.customTags[index];

		const modal = new TagEditModal(this.app, tag, async (updatedTag) => {
			if (isNew) {
				this.plugin.settings.customTags.push(updatedTag);
			} else {
				this.plugin.settings.customTags[index] = updatedTag;
			}
			await this.plugin.saveSettings();
			this.display(); // Refresh
		});
		modal.open();
	}
}
