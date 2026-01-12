# Raycast Automation Investigation

**Date:** 2026-01-09 (Updated: 2026-01-12)
**Status:** Complete - BYOK storage location identified, automation approach documented

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
