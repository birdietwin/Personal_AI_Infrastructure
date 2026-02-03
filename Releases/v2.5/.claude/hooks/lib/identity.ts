/**
 * Central Identity Loader
 * Single source of truth for DA (Digital Assistant) and Principal identity
 *
 * Reads from settings.json - the programmatic way, not markdown parsing.
 * All hooks and tools should import from here.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME!;
const SETTINGS_PATH = join(HOME, '.claude/settings.json');

// Default identity (fallback if settings.json doesn't have identity section)
const DEFAULT_IDENTITY = {
  name: 'PAI',
  fullName: 'Personal AI',
  displayName: 'PAI',
  voiceId: '',
  color: '#3B82F6',
};

const DEFAULT_PRINCIPAL = {
  name: 'User',
  pronunciation: '',
  timezone: 'UTC',
};

export interface VoiceProsody {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
}

export interface VoicePersonality {
  baseVoice: string;
  enthusiasm: number;
  energy: number;
  expressiveness: number;
  resilience: number;
  composure: number;
  optimism: number;
  warmth: number;
  formality: number;
  directness: number;
  precision: number;
  curiosity: number;
  playfulness: number;
}

export interface VoiceServerConfig {
  enabled: boolean;
  serverUrl: string;
}

export interface Identity {
  name: string;
  fullName: string;
  displayName: string;
  role?: string;
  voiceId: string;
  color: string;
  voice?: VoiceProsody;
  personality?: VoicePersonality;
}

export interface Principal {
  name: string;
  pronunciation: string;
  timezone: string;
  socialHandles?: Record<string, string>;
}

export interface Settings {
  identity?: Partial<Identity>;
  daidentity?: Partial<Identity>; // backward compat (pre-v2.5)
  voice?: Partial<VoiceServerConfig>;
  principal?: Partial<Principal>;
  env?: Record<string, string>;
  [key: string]: unknown;
}

let cachedSettings: Settings | null = null;

/**
 * Load settings.json (cached)
 */
function loadSettings(): Settings {
  if (cachedSettings) return cachedSettings;

  try {
    if (!existsSync(SETTINGS_PATH)) {
      cachedSettings = {};
      return cachedSettings;
    }

    const content = readFileSync(SETTINGS_PATH, 'utf-8');
    cachedSettings = JSON.parse(content);
    return cachedSettings!;
  } catch {
    cachedSettings = {};
    return cachedSettings;
  }
}

/**
 * Get DA (Digital Assistant) identity from settings.json
 * Checks `identity` first (v2.5+), falls back to `daidentity` (pre-v2.5)
 */
export function getIdentity(): Identity {
  const settings = loadSettings();

  // Prefer settings.identity (v2.5+), fall back to settings.daidentity (pre-v2.5)
  const identitySection = settings.identity || settings.daidentity || {};
  const envDA = settings.env?.DA;

  return {
    name: identitySection.name || envDA || DEFAULT_IDENTITY.name,
    fullName: identitySection.fullName || identitySection.name || envDA || DEFAULT_IDENTITY.fullName,
    displayName: identitySection.displayName || identitySection.name || envDA || DEFAULT_IDENTITY.displayName,
    role: identitySection.role,
    voiceId: identitySection.voiceId || DEFAULT_IDENTITY.voiceId,
    color: identitySection.color || DEFAULT_IDENTITY.color,
    voice: (identitySection as any).voice as VoiceProsody | undefined,
    personality: (identitySection as any).personality as VoicePersonality | undefined,
  };
}

/**
 * Get Principal (human owner) identity from settings.json
 */
export function getPrincipal(): Principal {
  const settings = loadSettings();

  // Prefer settings.principal, fall back to env.PRINCIPAL for backward compat
  const principal = settings.principal || {};
  const envPrincipal = settings.env?.PRINCIPAL;

  return {
    name: principal.name || envPrincipal || DEFAULT_PRINCIPAL.name,
    pronunciation: principal.pronunciation || DEFAULT_PRINCIPAL.pronunciation,
    timezone: principal.timezone || DEFAULT_PRINCIPAL.timezone,
    socialHandles: (principal as any).socialHandles,
  };
}

/**
 * Get voice server configuration
 */
export function getVoiceServerConfig(): VoiceServerConfig {
  const settings = loadSettings();
  const voice = settings.voice || {};

  return {
    enabled: voice.enabled ?? false,
    serverUrl: voice.serverUrl || 'http://localhost:8888',
  };
}

/**
 * Clear cache (useful for testing or when settings.json changes)
 */
export function clearCache(): void {
  cachedSettings = null;
}

/**
 * Get just the DA name (convenience function)
 */
export function getDAName(): string {
  return getIdentity().name;
}

/**
 * Get just the Principal name (convenience function)
 */
export function getPrincipalName(): string {
  return getPrincipal().name;
}

/**
 * Get just the voice ID (convenience function)
 */
export function getVoiceId(): string {
  return getIdentity().voiceId;
}

/**
 * Get the full settings object (for advanced use)
 */
export function getSettings(): Settings {
  return loadSettings();
}

/**
 * Get the default identity (for documentation/testing)
 */
export function getDefaultIdentity(): Identity {
  return { ...DEFAULT_IDENTITY };
}

/**
 * Get the default principal (for documentation/testing)
 */
export function getDefaultPrincipal(): Principal {
  return { ...DEFAULT_PRINCIPAL };
}

/**
 * Get voice prosody settings (convenience function) - legacy ElevenLabs
 */
export function getVoiceProsody(): VoiceProsody | undefined {
  return getIdentity().voice;
}

/**
 * Get voice personality settings (convenience function) - Qwen3-TTS
 */
export function getVoicePersonality(): VoicePersonality | undefined {
  return getIdentity().personality;
}
