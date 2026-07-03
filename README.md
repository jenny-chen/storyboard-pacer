# Storyboard Pacer

[![Release](https://img.shields.io/github/v/release/jenny-chen/storyboard-pacer?sort=semver)](https://github.com/jenny-chen/storyboard-pacer/releases/latest)
[![Build macOS app](https://github.com/jenny-chen/storyboard-pacer/actions/workflows/build-macos.yml/badge.svg)](https://github.com/jenny-chen/storyboard-pacer/actions/workflows/build-macos.yml)

Time a Photoshop storyboard by clicking through your frames at the speed you want
them to play, then export a timeline that **Premiere Pro imports with every frame
already trimmed to its recorded duration** — no manual timeline trimming.

A small desktop app (macOS) built with [Tauri](https://tauri.app). 

![Storyboard Pacer — recording view](docs/screenshot.png)

## Download

**[⬇︎ Download the latest release](https://github.com/jenny-chen/storyboard-pacer/releases/latest)** — grab the `.dmg` under **Assets**, open it, and drag the app to Applications.

> **First launch:** because the app isn't code-signed with an Apple Developer ID,
> macOS Gatekeeper will warn you the first time. Right-click the app →
> **Open** → **Open**. (Or run `xattr -dr com.apple.quarantine "Storyboard Pacer.app"`.)

The download is a **universal** build — it runs on both Apple Silicon and Intel Macs.

## What it does

1. **Load frames** — choose the folder of storyboard frames you exported from
   Photoshop (`File → Export → Layers to Files`, numbered so they sort in order).
   Frames are natural-sorted (so `2` comes before `10`) and can be drag-reordered.
2. **Record pacing** — press <kbd>Space</kbd> / arrow keys through the frames at
   the speed you want them to play. The app times how long you hold each one.
3. **Review** — a table of per-frame durations, running timecode, and totals;
   fine-tune any number.
4. **Export** — save an FCP7/xmeml `.xml`. In Premiere Pro, `File → Import` it to
   get a sequence named **Storyboard Animatic** with each frame already trimmed.

**Why:** Premiere's native still-image import gives every frame the *same* fixed
duration. This produces per-frame timing that Premiere accepts via its supported
XML import path. Exporting only ever writes the new `.xml` — your original frames
are never modified.

### Keyboard

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> / <kbd>→</kbd> / <kbd>↓</kbd> | Next frame (start / advance / finish) |
| <kbd>Backspace</kbd> / <kbd>←</kbd> / <kbd>↑</kbd> | Back one frame |

## License

MIT — see [LICENSE](LICENSE).
