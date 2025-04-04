import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	FrontMatterCache,
	TFile
} from 'obsidian';

import * as path from 'path';


interface StickyAudioSettings {
	tags: string[];
	stickyPosition: 'top' | 'bottom';
}

const DEFAULT_SETTINGS: StickyAudioSettings = {
	tags: ['sticky-audio'],
	stickyPosition: 'bottom',
}

export default class StickyAudio extends Plugin {
	settings: StickyAudioSettings;
	activeAudioElement: HTMLAudioElement | null = null;

	async onload() {
		await this.loadSettings();

		this.app.workspace.on('file-open', this.handleFileOpen);
		this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange);
	}

	onunload() {
		this.removeStickyAudioPlayer();
		this.app.workspace.off('file-open', this.handleFileOpen);
		this.app.workspace.off('active-leaf-change', this.handleActiveLeafChange);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	handleActiveLeafChange = async (leaf: WorkspaceLeaf | null) => {
		if (leaf?.view instanceof MarkdownView) {
			await this.processMarkdownFrontmatter(leaf.view);
		} else {
			this.removeStickyAudioPlayer();
		}
	};

	handleFileOpen = async (file: any) => {
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
		await this.processMarkdownFrontmatter(activeLeaf?.view as MarkdownView);
	};

	async processMarkdownFrontmatter(markdownView: MarkdownView) {
		if (!markdownView) {
			this.removeStickyAudioPlayer();
			return;
		}

		const file = markdownView.file;
		if (!file) {
			this.removeStickyAudioPlayer();
			return;
		}

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

		if (frontmatter) {
			let stickyAudioSrc: string | undefined;
			for (const tag of this.settings.tags) {
				const value = frontmatter[tag];
				if (value) {
					stickyAudioSrc = value;
					break;
				}
			}

			if (stickyAudioSrc) {
				console.log(`Found sticky audio tag: ${stickyAudioSrc}`);
				console.log(`File: ${file.path}`);
				const resolvedSrc = await this.resolveAudioSource(stickyAudioSrc, file);
				console.log(`Resolved audio source: ${resolvedSrc}`);
				if (resolvedSrc) {
					this.insertStickyAudioPlayer(resolvedSrc, markdownView.containerEl);
				} else {
					this.removeStickyAudioPlayer();
				}
			} else {
				this.removeStickyAudioPlayer();
			}
		} else {
			this.removeStickyAudioPlayer();
		}
	}

	async resolveAudioSource(src: string, note: TFile): Promise<string | null> {
		if (src.startsWith('http://') || src.startsWith('https://')) {
			return src;
		} else if (src.startsWith('app://')) {
			return src; // If you intend to link to another Obsidian resource (less likely for audio)
		} else if (src.startsWith('/')) {
			return src; // Absolute path (less common in Obsidian)
		} else if (src.startsWith('./') || src.startsWith('../') || !src.includes('://')) {

      function resolvePath(src: string, file: TFile): string {
        const currentDir = file.parent?.path || '';
        console.log(`Current directory: ${currentDir}`);
        return path.resolve(currentDir, src);
      }

      const resolvedPath = resolvePath(src, note);
      const normalizedPath = resolvedPath.replace(/^\//, '');

      console.log(`Resolved path: ${resolvedPath}`);
      console.log(`normalizedPath: ${normalizedPath}`);

      // Now, try to find the file in the vault to get its resource path
			const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
			console.log(`Resolved path: ${resolvedPath}`);
			console.log(`Abstract file: ${abstractFile}`);
			if (abstractFile && abstractFile instanceof TFile) {
				let resourcePath = this.app.vault.getResourcePath(abstractFile);
				console.log(`Resource path: ${resourcePath}`);
				return resourcePath; // This gives a path the <audio> element can use
			} else {
				new Notice(`Audio file not found: ${resolvedPath}`);
				return null;
			}
		}
		return null;
	}




	insertStickyAudioPlayer(src: string, containerEl: HTMLElement) {
		this.removeStickyAudioPlayer(); // Remove any existing player

		this.activeAudioElement = document.createElement('audio');
		this.activeAudioElement.controls = true;
		this.activeAudioElement.src = src;
		this.activeAudioElement.classList.add('sticky-audio-player'); // Add a class for styling

		const wrapper = document.createElement('div');
		wrapper.classList.add('sticky-audio-wrapper');
		wrapper.appendChild(this.activeAudioElement);

		if (this.settings.stickyPosition === 'top') {
			containerEl.prepend(wrapper);
		} else {
			containerEl.appendChild(wrapper);
		}

		// Basic CSS to make it sticky (you might need more sophisticated styling)
		const style = document.createElement('style');
		style.innerHTML = `
            .sticky-audio-wrapper {
                position: sticky;
                ${this.settings.stickyPosition}: 0;
                width: 100%;
                background-color: var(--background-primary); /* Use Obsidian theme variable */
                z-index: 100; /* Ensure it's on top */
                padding: 5px;
                box-sizing: border-box;
            }
            .sticky-audio-player {
                width: 100%;
            }
        `;
		containerEl.appendChild(style);
	}

	removeStickyAudioPlayer() {
		const existingWrapper = document.querySelector('.sticky-audio-wrapper');
		if (existingWrapper) {
			existingWrapper.remove();
		}
		const existingStyle = document.querySelector('style'); // Consider a more specific selector if other styles are present
		if (existingStyle) {
			// Basic check to avoid removing all styles
			if (existingStyle.innerHTML.includes('.sticky-audio-wrapper')) {
				existingStyle.remove();
			}
		}
		this.activeAudioElement = null;
	}
}
