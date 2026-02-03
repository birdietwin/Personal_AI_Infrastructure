#!/usr/bin/env bun
// Enriches backfilled session files with data from JSONL transcripts
// Reads ~/.claude/history/sessions/2026-*/ for source: backfill files
// Parses matching JSONL transcripts to extract tools, files, commands

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TRANSCRIPT_DIR = join(homedir(), '.claude', 'projects', '-Users-kimes-Projects');
const SESSIONS_DIR = join(homedir(), '.claude', 'history', 'sessions');
const MAX_FILES = 20;
const MAX_COMMANDS = 20;

interface ParsedFrontmatter {
  capture_type: string;
  timestamp: string;
  session_id: string;
  executor: string;
  source: string;
}

interface TranscriptAnalysis {
  toolsUsed: string[];
  filesModified: string[];
  commandsExecuted: string[];
  firstUserMessage: string;
  focus: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return fm as unknown as ParsedFrontmatter;
}

function extractFirstUserMessage(lines: string[]): string {
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'user') {
        const msg = obj.message;
        const content = msg?.content;
        if (typeof content === 'string') return content.slice(0, 500);
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
              // Strip system-reminder tags
              const cleaned = block.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
              if (cleaned.length > 0) return cleaned.slice(0, 500);
            }
          }
        }
      }
    } catch {}
  }
  return '';
}

function determineSessionFocus(filesChanged: string[], commandsExecuted: string[]): string {
  const filePatterns = filesChanged.map(f => f.toLowerCase());

  if (filePatterns.some(f => f.includes('/blog/') || f.includes('/posts/'))) return 'blog-work';
  if (filePatterns.some(f => f.includes('/hooks/'))) return 'hook-development';
  if (filePatterns.some(f => f.includes('/skills/'))) return 'skill-updates';
  if (filePatterns.some(f => f.includes('/agents/'))) return 'agent-work';
  if (commandsExecuted.some(cmd => cmd.includes('test'))) return 'testing-session';
  if (commandsExecuted.some(cmd => cmd.includes('git commit'))) return 'git-operations';
  if (commandsExecuted.some(cmd => cmd.includes('deploy'))) return 'deployment';

  if (filesChanged.length > 0) {
    const mainFile = filesChanged[0].split('/').pop()?.replace(/\.(md|ts|js)$/, '');
    if (mainFile) return `${mainFile}-work`;
  }

  return 'development-session';
}

function analyzeTranscript(transcriptPath: string): TranscriptAnalysis {
  const content = readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const toolsUsed = new Set<string>();
  const filesModified = new Set<string>();
  const commandsExecuted: string[] = [];

  const firstUserMessage = extractFirstUserMessage(lines);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant') continue;

      const blocks = obj.message?.content;
      if (!Array.isArray(blocks)) continue;

      for (const block of blocks) {
        if (block?.type !== 'tool_use') continue;

        const toolName = block.name;
        if (!toolName) continue;
        toolsUsed.add(toolName);

        const input = block.input || {};

        if ((toolName === 'Edit' || toolName === 'Write') && input.file_path) {
          filesModified.add(input.file_path);
        }

        if (toolName === 'Bash' && input.command) {
          commandsExecuted.push(input.command);
        }
      }
    } catch {}
  }

  const filesArr = [...filesModified].slice(0, MAX_FILES);
  const cmdsArr = commandsExecuted.slice(0, MAX_COMMANDS);

  return {
    toolsUsed: [...toolsUsed],
    filesModified: filesArr,
    commandsExecuted: cmdsArr,
    firstUserMessage,
    focus: determineSessionFocus(filesArr, cmdsArr),
  };
}

function buildEnrichedDoc(fm: ParsedFrontmatter, analysis: TranscriptAnalysis): string {
  const { toolsUsed, filesModified, commandsExecuted, firstUserMessage, focus } = analysis;

  const toolsList = toolsUsed.length > 0
    ? toolsUsed.map(t => `- ${t}`).join('\n')
    : '- None recorded';

  const filesList = filesModified.length > 0
    ? filesModified.map(f => `- \`${f}\``).join('\n')
    : '- None recorded';

  const cmdsBlock = commandsExecuted.length > 0
    ? '```bash\n' + commandsExecuted.join('\n') + '\n```'
    : 'None recorded';

  const summaryText = firstUserMessage || focus;

  return `---
capture_type: SESSION
timestamp: ${fm.timestamp}
session_id: ${fm.session_id}
executor: ${fm.executor}
source: backfill-enriched
---

# Session: ${focus}

**Session ID:** ${fm.session_id}
**Ended:** ${fm.timestamp}

---

## Summary

${summaryText}

---

## Tools Used

${toolsList}

---

## Files Modified

${filesList}

---

## Commands Executed

${cmdsBlock}

---

*Session summary enriched by PAI History System from transcript*
`;
}

function main() {
  // Find all year-month directories
  const ymDirs = readdirSync(SESSIONS_DIR)
    .filter(d => /^2026-\d{2}$/.test(d))
    .map(d => join(SESSIONS_DIR, d));

  let enriched = 0;
  let skipped = 0;
  let noTranscript = 0;

  for (const dir of ymDirs) {
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(content);

      if (!fm || fm.source !== 'backfill') continue;

      const transcriptPath = join(TRANSCRIPT_DIR, `${fm.session_id}.jsonl`);
      if (!existsSync(transcriptPath)) {
        noTranscript++;
        continue;
      }

      try {
        const analysis = analyzeTranscript(transcriptPath);
        const enrichedDoc = buildEnrichedDoc(fm, analysis);
        writeFileSync(filePath, enrichedDoc);
        enriched++;
        console.log(`  enriched: ${file}`);
      } catch (err) {
        console.error(`  error processing ${file}:`, err);
        skipped++;
      }
    }
  }

  console.log(`\nDone. Enriched: ${enriched}, No transcript: ${noTranscript}, Errors: ${skipped}`);
}

main();
