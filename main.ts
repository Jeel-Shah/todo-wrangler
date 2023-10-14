import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

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
		const patternToMatch = new RegExp('^-?\\s*(\\[x?\\])?\\s+' + keyword);

		if (!editor) {
			console.error('Editor is not defined');
			return;
		}

		const content = editor.getValue();
		const lines = content.split('\n');

		let todos: string[] = [];
		let modifiedContent: string[] = [];

		lines.forEach(line => {

			if (patternToMatch.test(line)) {
				todos.push(line);
			} else {
				modifiedContent.push(line);
			}

		});

		if (todos.length > 0) {
			modifiedContent.push(`\n## ${keyword}s \n`, ...todos);
			editor.setValue(modifiedContent.join('\n'));
		}
	}

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Todo Wrangler', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			this.extractTodosFromCurrentNote();
		});


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


// Consider TODO types here that the user can set. For instance TODO or whatever else they can want to wrangle and move to
// a different heading.
class TodoCaptureSettingTab extends PluginSettingTab {
	plugin: TodoCapture;

	constructor(app: App, plugin: TodoCapture) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h2', {text: 'Settings for TODO Wrangler'});

		new Setting(containerEl)
			.setName('Keyword')
			.setDesc('Specify the keyword you want to extract (e.g., TODO, DONE, etc.)')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.keyword)
				.onChange(async (value) => {
					this.plugin.settings.keyword = value;
					await this.plugin.saveSettings();
				}));
	}
}
