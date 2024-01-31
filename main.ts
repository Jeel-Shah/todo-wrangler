import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface TodoCaptureSettings {
	keyword: string;
}

const DEFAULT_SETTINGS: TodoCaptureSettings = {
	keyword: 'TODO'
}

export default class TodoCapture extends Plugin {
	settings: TodoCaptureSettings;

	async extractTodosFromCurrentNote(editor: Editor, view: MarkdownView): Promise<void> {
		const keyword = this.settings.keyword || 'TODO';

		// Here, we account for bulleted lines and lines with checkboxes
		const patternToMatch = new RegExp('^-?\\s*(\\[\\s?(|)x?\\])?\\s*' + keyword);
		const todoHeading = `## ${keyword}s`;

		if (!editor) {
			console.error('Editor is not defined');
			return;
		}

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


		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TodoCaptureSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
	}
}
