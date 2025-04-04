# Obsidian Sticky Audio

This plugin allows you to attach an audio file to a note in [Obsidian](https://obsidian.md) and play it while you scroll through the note.

> [!NOTE]
> 🚧 Under active development 🚧

![[preview.png]]

## Usage

Add a `sticky-audio` [property](https://help.obsidian.md/properties) to the frontmatter of your note.

```
---
sticky-audio: audio.mp3
---
```

It will look lik

## Why not just use `![[audio.mp3]]`?

The Obsidian Markdown rendering engine tends to only render elements that are visible in the viewport.

This means that if you have a long note,
and you scroll down,
the audio element will be removed from the DOM,
and the audio will stop playing.

This plugin avoids that by attaching the audio element to the body of the document,
and keeping it in the DOM!

## Roadmap

- [x] Add sticky audio element to a note via a property
- [ ] Automatic playback when the note is opened
- [ ] Customizable styling and position
- [ ] Drag-and-drop audio files to make them sticky
- [ ] Make audio elements within a note sticky

That's all I could think of.
Feel free to open an issue or PR if you have any ideas!
