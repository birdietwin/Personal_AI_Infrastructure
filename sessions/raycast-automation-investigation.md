# Raycast Automation Investigation

**Date:** 2026-01-09 (Updated: 2026-01-15)
**Status:** Complete - BYOK, Browser Extension, Screenshots to iCloud, Cloud Sync

## Objective

Investigate approaches to automate Raycast configuration, specifically:
1. General configuration automation
2. 1Password integration for AI API key authentication

## Key Findings

### Configuration Locations

| Location | Purpose |
|----------|---------|
| `~/Library/Preferences/com.raycast.macos.plist` | Main preferences (binary plist) |
| `~/Library/Application Support/com.raycast.macos/` | Encrypted SQLite databases |
| `~/.config/raycast/config.json` | API access token |
| `~/.config/raycast/ai/` | Empty - likely for custom providers |
| `~/.config/raycast/extensions/` | Installed extensions (by UUID) |

### Keychain Entries (service: "Raycast")

**System entries:**
- `database_key` - Database encryption
- `urlcache_key` - URL cache
- `raycast-store_credentials` - Store credentials

**BYOK API Keys (added when configured):**
- `raycast_ai_anthropic_apikey` - Anthropic API key
- `raycast_ai_openai_apikey` - OpenAI API key
- `raycast_ai_google_apikey` - Google AI API key

### BYOK (Bring Your Own Key) Storage - CONFIRMED

- Available since Raycast v1.100.0
- Supports: Anthropic, OpenAI, Google
- **Storage location: macOS Keychain** (service: "Raycast")
- Keys are stored as generic passwords with predictable account names
- Can be read/written via `security` CLI command

### Automation Options (Ranked)

1. **Export/Import JSON** - Unencrypted export for dotfiles
2. **Script Commands** - Bash/Python/Swift automation triggers
3. **Cloud Sync** - Pro feature, automatic
4. **plist manipulation** - `defaults write com.raycast.macos`
5. **Dotmate extension** - Dotfiles sync integration

### 1Password Integration

**Current state:** No native integration, but fully automatable via keychain.

**Automated workflow (WORKING):**

```bash
#!/bin/bash
# sync-raycast-byok.sh - Sync API keys from 1Password to Raycast

# Read keys from 1Password
ANTHROPIC_KEY=$(op read "op://Development/Anthropic API Key/credential")
OPENAI_KEY=$(op read "op://Development/OpenAI API Key/credential")
GOOGLE_KEY=$(op read "op://Development/Google AI API Key/credential")

# Write to Raycast keychain entries
# Note: Use -U to update existing, or add new if not present
if [ -n "$ANTHROPIC_KEY" ]; then
    security add-generic-password -U -s "Raycast" -a "raycast_ai_anthropic_apikey" -w "$ANTHROPIC_KEY"
    echo "✓ Anthropic key synced"
fi

if [ -n "$OPENAI_KEY" ]; then
    security add-generic-password -U -s "Raycast" -a "raycast_ai_openai_apikey" -w "$OPENAI_KEY"
    echo "✓ OpenAI key synced"
fi

if [ -n "$GOOGLE_KEY" ]; then
    security add-generic-password -U -s "Raycast" -a "raycast_ai_google_apikey" -w "$GOOGLE_KEY"
    echo "✓ Google AI key synced"
fi

echo "Done! Restart Raycast to apply changes."
```

**Read existing key:**
```bash
security find-generic-password -s "Raycast" -a "raycast_ai_anthropic_apikey" -w
```

**Delete a key:**
```bash
security delete-generic-password -s "Raycast" -a "raycast_ai_anthropic_apikey"
```

## Completed Investigation

- [x] Configure a test BYOK key in Raycast UI
- [x] Diff keychain/plist/config changes to identify storage
- [x] Document automation approach with 1Password
- [x] Build sync script: `~/.claude/skills/Raycast/Tools/sync-byok.sh`

## Sync Script Usage

```bash
# Dry run (shows what would be done)
~/.claude/skills/Raycast/Tools/sync-byok.sh --dry-run

# Sync all configured providers
~/.claude/skills/Raycast/Tools/sync-byok.sh

# Sync specific provider
~/.claude/skills/Raycast/Tools/sync-byok.sh --provider anthropic

# After sync, restart Raycast
killall Raycast && open -a Raycast
```

## Resources

- [Raycast BYOK Changelog](https://www.raycast.com/changelog/1-100-0)
- [Raycast 1Password Extension](https://www.raycast.com/khasbilegt/1password)
- [Script Commands Repo](https://github.com/raycast/script-commands)
- [Dotmate Extension](https://www.raycast.com/knealking/dotmate)

## Commands Reference

```bash
# Read Raycast plist
defaults read com.raycast.macos

# Export plist to JSON (may fail on binary data)
defaults export com.raycast.macos - | plutil -convert xml1 -o - -

# Check keychain for Raycast entries
security dump-keychain 2>&1 | grep -i raycast -A10

# BYOK Key Management
security find-generic-password -s "Raycast" -a "raycast_ai_anthropic_apikey" -w  # Read
security add-generic-password -U -s "Raycast" -a "raycast_ai_anthropic_apikey" -w "sk-xxx"  # Write/Update
security delete-generic-password -s "Raycast" -a "raycast_ai_anthropic_apikey"  # Delete

# List all Raycast keychain entries
security dump-keychain 2>&1 | grep -B5 'svce.*Raycast' | grep acct
```

## Key Discovery Summary (2026-01-12)

**Method:** Captured baseline keychain state, added BYOK key via Raycast UI, diffed changes.

**Finding:** BYOK keys are stored in macOS Keychain with:
- Service: `Raycast`
- Account names: `raycast_ai_{provider}_apikey` where provider is `anthropic`, `openai`, or `google`

**Implications:**
1. Keys survive Raycast reinstalls (keychain persists)
2. Can be automated via `security` CLI
3. No plist modification needed
4. Raycast likely reads from keychain on startup (restart required after external changes)

---

## Browser Extension & AI Context (2026-01-15)

### Browser Extension Setup

Required for Raycast AI to access webpage content.

**Supported browsers:**
- Safari, Chrome, Arc, Brave, Edge, Vivaldi, Opera
- **Not supported:** Firefox

**Install:** [Raycast Browser Extension](https://www.raycast.com/browser-extension) or search "Raycast Companion" in Chrome Web Store.

### Quick AI vs AI Chat Context

**Issue:** "Continue in Chat" (⌘+J) from Quick AI is **broken** - context does not transfer.

- Quick AI commands with `{browser-tab}` work correctly
- "Continue in Chat" creates new chat but **no conversation history transfers**
- This appears to be a Raycast bug (as of v1.104.1)

**Required setting:** Raycast Settings → AI → "Start New Chat" must NOT be "Never" (otherwise opens old chat instead of new)

**Workaround:** Start directly in AI Chat (⌘+J) with `{browser-tab}` placeholder:
```
Summarize this page and I'll ask follow-ups: {browser-tab}
```
All follow-ups remain in context.

**Custom "Chat About Page" command created but limited:**
- Works for Quick AI one-shot summaries
- Cannot be used for multi-turn conversations due to context transfer bug

### Custom AI Commands with Browser Context

Custom AI Commands do **not** support "Open in AI Chat" as Primary Action - they always run through Quick AI first.

**Created:** "Chat About Page" command
- Prompt: `Analyze this webpage and be ready to answer follow-up questions: {browser-tab}`
- Model: Claude 4.5 Haiku
- Limitation: Due to context transfer bug, can only be used for one-shot summaries

**For multi-turn conversations about webpages:**
Use AI Chat directly (⌘+J → + → type with `{browser-tab}`)

---

## Screenshots to iCloud (2026-01-15)

### Configuration

All machines configured to save screenshots to shared iCloud folder:

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/Screenshots
defaults write com.apple.screencapture location ~/Library/Mobile\ Documents/com~apple~CloudDocs/Screenshots
killall SystemUIServer
```

### Multi-Machine Status

| Machine | User | Screenshot Location | Cloud Sync |
|---------|------|---------------------|------------|
| mac-mini | kimes | iCloud/Screenshots | ✓ Enabled |
| imac-server | kimes | iCloud/Screenshots | ✓ Enabled |
| toms-mbp | kimes | iCloud/Screenshots | ✓ Enabled |
| imac-shed | tomkimes | iCloud/Screenshots | ✓ Enabled |

### Benefits

- Screenshots from any machine sync to all others via iCloud
- Raycast Screenshots extension auto-detects location (reads `com.apple.screencapture location`)
- Searchable across all machines via Raycast

### Raycast Snippet & Quicklink

Created via deeplinks for quick access to screenshot path:

**Snippet:**
- Name: `Screenshots Path`
- Keyword: `sspath`
- Text: `~/Library/Mobile Documents/com~apple~CloudDocs/Screenshots`

**Quicklink:**
- Name: `Screenshots Folder`
- Link: `file:///Users/kimes/Library/Mobile Documents/com~apple~CloudDocs/Screenshots`

**Deeplink commands:**
```bash
# Create snippet
open "raycast://extensions/raycast/snippets/create-snippet?text=%7E%2FLibrary%2FMobile%20Documents%2Fcom%7Eapple%7ECloudDocs%2FScreenshots&name=Screenshots%20Path&keyword=sspath"

# Create quicklink
open "raycast://extensions/raycast/quicklinks/create-quicklink?name=Screenshots%20Folder&link=file%3A%2F%2F%2FUsers%2Fkimes%2FLibrary%2FMobile%2520Documents%2Fcom~apple~CloudDocs%2FScreenshots"
```

---

## Cloud Sync (2026-01-15)

### Overview

- Raycast Pro feature - syncs snippets, quicklinks, extensions across machines
- Snippets/quicklinks stored in encrypted SQLite (`raycast-enc.sqlite`) - **cannot** be scripted via CLI
- Must enable via UI: Raycast Settings → Cloud Sync → Sign in

### Check Cloud Sync Status

```bash
defaults read com.raycast.macos | grep -i "cloudSync_"
# Look for cloudSync_lastSyncDate
```

### Raycast Version Check

```bash
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "/Applications/Raycast.app/Contents/Info.plist"
```

Current version across all machines: **1.104.1**

---

## Browser Bookmarks (2026-01-15)

### Setup

Built-in extension - search "Browser Bookmarks" in Raycast or "Search Browser Bookmarks".

**Select browsers:**
- Press **Enter** when showing "You don't have any bookmarks"
- Or use ⌘+⇧+S (Select Browsers action)

### Supported Browsers

Arc, Chrome, Safari, Brave, Edge, Firefox, Vivaldi, Opera, Sidekick, ChatGPT Atlas, Prisma Access, Dia, Ghost Browser, Helium

### Features

- Search bookmarks by title, domain, or folder
- Works across multiple browser profiles
- Filter by specific browser via dropdown
- Open in browser, copy URL, or delete

### Notes

- Reads directly from browser bookmark files (no consolidation needed)
- Each browser syncs via its own account (Google, iCloud, Arc account, etc.)
- No iCloud folder approach needed - browsers handle their own sync

---

## Clipboard History (2026-01-15)

### Raycast Clipboard History

- **Does NOT sync across devices** - intentional for security (may contain passwords)
- Pro extends retention: 6 months, 1 year, or unlimited (free = 3 months)
- Stored locally in encrypted SQLite database

### Universal Clipboard (macOS)

- Built-in, works across Apple devices on same iCloud
- **Limitations:** No persistence, no history (current item only, expires quickly)

### Future Consideration: Third-Party Clipboard Sync

| App | Sync | Price | Raycast Extension |
|-----|------|-------|-------------------|
| Pastebot | iCloud | $12.99 one-time | [Yes](https://www.raycast.com/erics118/pastebot) |
| Paste | iCloud | $14.99/yr | [Yes](https://www.raycast.com/raycast/paste) |

**Pastebot** recommended: one-time purchase, iCloud sync, filters sensitive content.
