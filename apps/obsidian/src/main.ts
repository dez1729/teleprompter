import {
  type App,
  type Editor,
  type MarkdownFileInfo,
  type MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
} from 'obsidian'
import { DEFAULT_SERVER_URL, PushError, pushFor, sendPush, type Http, type PushKind } from './push.ts'

interface Settings {
  serverUrl: string
}

const ACTIONS: Record<PushKind, { command: string; menu: string; done: string }> = {
  replace: {
    command: 'Replace the Script with the selection or note',
    menu: 'Replace the Teleprompter Script',
    done: 'Replaced the Teleprompter Script.',
  },
  append: {
    command: 'Add the selection or note to the Script',
    menu: 'Add to the Teleprompter Script',
    done: 'Added to the Teleprompter Script.',
  },
}

const obsidianHttp: Http = async (request) => {
  const response = await requestUrl({ ...request, throw: false })
  return { status: response.status, text: response.text }
}

export default class TeleprompterPlugin extends Plugin {
  settings: Settings = { serverUrl: DEFAULT_SERVER_URL }

  override async onload() {
    this.settings = { ...this.settings, ...((await this.loadData()) as Partial<Settings> | null) }

    for (const kind of ['replace', 'append'] as const) {
      this.addCommand({
        id: `${kind}-script`,
        name: ACTIONS[kind].command,
        editorCallback: (editor, context) => this.push(kind, editor, context),
      })
    }

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, context) => {
        for (const kind of ['replace', 'append'] as const) {
          menu.addItem((item) =>
            item
              .setTitle(ACTIONS[kind].menu)
              .setIcon('presentation')
              .onClick(() => this.push(kind, editor, context)),
          )
        }
      }),
    )

    this.addSettingTab(new TeleprompterSettingTab(this.app, this))
  }

  async push(kind: PushKind, editor: Editor, context: MarkdownView | MarkdownFileInfo) {
    const note = { basename: context.file?.basename ?? 'Obsidian', text: editor.getValue() }
    const request = pushFor(kind, editor.getSelection(), note)
    if (!request) {
      new Notice('Nothing to send: the note is empty.')
      return
    }
    try {
      await sendPush(request, this.settings.serverUrl, obsidianHttp)
      new Notice(ACTIONS[kind].done)
    } catch (error) {
      new Notice(error instanceof PushError ? error.message : `Could not send to the Teleprompter: ${String(error)}`)
    }
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}

class TeleprompterSettingTab extends PluginSettingTab {
  private readonly plugin: TeleprompterPlugin

  constructor(app: App, plugin: TeleprompterPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display() {
    this.containerEl.empty()
    new Setting(this.containerEl)
      .setName('Server address')
      .setDesc(`Where "tp serve" is running. The default is ${DEFAULT_SERVER_URL}.`)
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SERVER_URL)
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim() || DEFAULT_SERVER_URL
            await this.plugin.saveSettings()
          }),
      )
  }
}
