import {
  MarkdownView,
  Notice,
  Plugin,
  WorkspaceLeaf,
  TFile, App
} from 'obsidian';

import * as path from 'path';


interface StickyAudioSettings {
  tags: string[];
  stickyPosition: 'top' | 'bottom';
  checkWhenFileModified: boolean;
}

const DEFAULT_SETTINGS: StickyAudioSettings = {
  tags: ['sticky-audio'],
  stickyPosition: 'bottom',
  checkWhenFileModified: false,
}

class AudioSource {
  uri: string;

  resolve(app: App, note: TFile): string | undefined {
    if (this.uri.startsWith('http://') || this.uri.startsWith('https://')) {
      return this.uri;

    } else if (this.uri.startsWith('app://')) {
      return this.uri;

    } else if (this.uri.startsWith('/')) {
      return this.uri;

    } else if (this.uri.startsWith('./') || this.uri.startsWith('../') || !this.uri.includes('://')) {

      function resolvePath(src: string, file: TFile): string {
        const currentDir = file.parent?.path || '';
        return path.resolve(currentDir, src);
      }

      const resolvedPath = resolvePath(this.uri, note);
      const normalizedPath = resolvedPath.replace(/^\//, '');

      // Now, try to find the file in the vault to get its resource path
      const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
      if (abstractFile && abstractFile instanceof TFile) {
        let resourcePath = app.vault.getResourcePath(abstractFile);
        return resourcePath; // This gives a path the <audio> element can use
      }
      return undefined;
    }

    interface StickyAudioPlayer {
      // Unique identifier for the player
      playerId: string;

      // The audio URI
      source: string;

      // The file to which the player belongs to
      file: string;

      insertInto(view: MarkdownView): void;
    }

    class StickyAudioPlayer implements StickyAudioPlayer {
      playerId: string;
      source: string;
      file: string;

      constructor(playerId: string, source: string, file: string) {
        this.playerId = playerId;
        this.source = source;
        this.file = file;
      }

      insertInto(view: MarkdownView): void {
        const audioElement = this.getOrCreateAudioElement(view.app);
        if (audioElement) {
          audioElement.src = this.source;
        }
      }

      getView(app: App): MarkdownView | null {
        const leaves = app.workspace.getLeavesOfType('markdown');

        // find leaf by file
        const leaf = leaves.find(leaf => {
          const view = leaf.view as MarkdownView;
          return view && view.file && view.file.path === this.file;
        });

        return null;
      }

      getOrCreateAudioElement(app: App): HTMLAudioElement | null {
        const container = this.getOrCreateContainer(app);
        if (container) {

          // Get existing audio element if it exists
          const existingAudioElement = container.querySelector(`audio[data-player-id="${this.playerId}"]`) as HTMLAudioElement;
          if (existingAudioElement) {
            return existingAudioElement;
          }

          const newAudioElement = document.createElement('audio');
          newAudioElement.src = this.source;
          newAudioElement.controls = true;
          newAudioElement.classList.add('sticky-audio-player');
          newAudioElement.style.width = '100%';
          newAudioElement.dataset.playerId = this.playerId;
          container.appendChild(newAudioElement);
          return newAudioElement;
        }
        return null;
      }

      getOrCreateContainer(app: App): HTMLElement | null {
        const view = this.getView(app);
        if (view) {
          const containerEl = view.containerEl;
          let wrapper = containerEl.querySelector('.sticky-audio-wrapper') as HTMLElement;
          if (wrapper) {
            return wrapper;
          }

          const newWrapper = document.createElement('div');
          newWrapper.classList.add('sticky-audio-wrapper');
          newWrapper.style.position = 'sticky';
          newWrapper.style.bottom = '0';
          newWrapper.style.width = '100%';
          newWrapper.style.backgroundColor = 'var(--background-primary)';
          newWrapper.style.zIndex = '100';
          newWrapper.style.padding = '5px';
          newWrapper.style.boxSizing = 'border-box';
          containerEl.appendChild(newWrapper);
          return newWrapper;
        }
        return null;
      }

      removeFromView(app: App) {
        const view = this.getView(app);
        if (view) {
          const container = this.getOrCreateContainer(app);
          if (container) {
            const audioElement = container.querySelector(`audio[data-player-id="${this.playerId}"]`) as HTMLAudioElement;
            if (audioElement) {
              audioElement.remove();
            }
            // Remove the container if it is empty
            if (container.children.length === 0) {
              container.remove();
            }
          }
        }
      }
    }

    interface StickyAudioPlayerRegistry {
      register(player: StickyAudioPlayer): StickyAudioPlayer;

      unregister(playerId: string): StickyAudioPlayer | undefined;

      get(playerId: string): StickyAudioPlayer | undefined;

      list(): StickyAudioPlayer[];

      listByFile(file: string | undefined): StickyAudioPlayer[];
    }

    class StickyAudioPlayerRegistry {

      private map: Map<string, StickyAudioPlayer> = new Map();

      // Registers a new audio player
      // If a player with the same ID exists, an error is thrown
      register(player: StickyAudioPlayer): StickyAudioPlayer {
        if (this.map.has(player.playerId)) {
          // TODO check if this is good practice, maybe it is better to ignore it
          throw new Error(`Player with ID ${player.playerId} already exists.`);
        }
        this.map.set(player.playerId, player);
        return player;
      }

      // Unregisters a player and returns it if found
      unregister(playerId: string): StickyAudioPlayer | undefined {
        const player = this.map.get(playerId);
        if (player) {
          this.map.delete(playerId);
          return player;
        }
        return undefined;
      }

      // Retrieves a player by its player ID
      get(playerId: string): StickyAudioPlayer | undefined {
        return this.map.get(playerId);
      }

      // Lists all players
      list(): StickyAudioPlayer[] {
        return Array.from(this.map.values());
      }

      // Lists players in a file
      listByFile(file: string | undefined): StickyAudioPlayer[] {
        if (!file) {
          return [];
        }
        return Array.from(this.map.values()).filter(player => player.file === file);
      }

    }

    class StickyAudioPlayerManager {
      private registry: StickyAudioPlayerRegistry;

      constructor() {
        this.registry = new StickyAudioPlayerRegistry();
      }

      removeAllPlayers(app: App) {
        this.registry.list().forEach(player => {
          player.removeFromView(app);
          this.registry.unregister(player.playerId);
        });
      }

      insertStickyAudioPlayer(src: string, view: MarkdownView) {

        let file = view.file?.path;

        if (!file) {
          return;
        }

        const player = this.getPlayer(src, file);
        player.source = src;
        player.insertInto(view);
      }

      // TODO support multiple players in one file
      getPlayer(src: string, file: string): StickyAudioPlayer {
        let player = this.registry.listByFile(file)
          .first();

        if (player) {
          return player;
        }

        const newPlayer = new StickyAudioPlayer(`sticky-audio-${Date.now()}`, src, file);
        this.registry.register(newPlayer);
        return newPlayer;
      }
    }

    export default class StickyAudio extends Plugin {
      settings: StickyAudioSettings;
      manager: StickyAudioPlayerManager;

      async onload() {
        await this.loadSettings();

        this.app.workspace.on('file-open', this.handleFile);
        this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange);

        this.settings.checkWhenFileModified && this.app.vault.on('modify', this.handleFile);
      }

      onunload() {
        this.manager.removeAllPlayers(this.app);
        this.app.workspace.off('file-open', this.handleFile);
        this.app.workspace.off('active-leaf-change', this.handleActiveLeafChange);
        this.app.workspace.off('modify', this.handleFile);
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
        }
      };

      handleFile = async (file: any) => {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;

        activeLeaf?.view?.await
        this.processMarkdownFrontmatter(activeLeaf?.view as MarkdownView);
      };

      async processMarkdownFrontmatter(markdownView: MarkdownView) {
        if (!markdownView) {
          return;
        }

        const file = markdownView.file;
        if (!file) {
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
            const resolvedSrc = await this.resolveAudioSource(stickyAudioSrc, file);
            if (resolvedSrc) {
              this.insertStickyAudioPlayer(resolvedSrc, markdownView);
            } else {
              this.removeStickyAudioPlayer(markdownView);
            }
          } else {
            this.removeStickyAudioPlayer(markdownView);
          }
        } else {
          this.removeStickyAudioPlayer(markdownView);
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
            return path.resolve(currentDir, src);
          }

          const resolvedPath = resolvePath(src, note);
          const normalizedPath = resolvedPath.replace(/^\//, '');

          console.log(`Resolved path: ${resolvedPath}`);

          // Now, try to find the file in the vault to get its resource path
          const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
          if (abstractFile && abstractFile instanceof TFile) {
            let resourcePath = this.app.vault.getResourcePath(abstractFile);
            return resourcePath; // This gives a path the <audio> element can use
          } else {
            new Notice(`Sticky Audio: File not found: ${resolvedPath}`);
            return null;
          }
        }
        return null;
      }

      insertStickyAudioPlayer(src: string, view: MarkdownView) {
        this.removeStickyAudioPlayer(view); // Remove any existing player

        const containerEl = view.containerEl;

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

        const position = this.settings.stickyPosition === 'top' ? 'top' : 'bottom';

        const style = document.createElement('style');
        style.innerHTML = `
            .sticky-audio-wrapper {
                position: sticky;
                ${position}: 0;
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
        if (view.file.path) {

        }
      }

      removeStickyAudioPlayer(view: MarkdownView) {
        const containerEl = view.containerEl;

        const existingWrapper = containerEl.querySelector('.sticky-audio-wrapper');
        if (existingWrapper) {
          existingWrapper.remove();
        }
        const existingStyle = containerEl.querySelector('style'); // Consider a more specific selector if other styles are present
        if (existingStyle) {
          // Basic check to avoid removing all styles
          if (existingStyle.innerHTML.includes('.sticky-audio-wrapper')) {
            existingStyle.remove();
          }
        }
        this.activeAudioElement = null;
      }
    }
