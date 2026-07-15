import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig, defaultState } from './defaults.mjs';

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
}

function text(value, fallback = '', max = 4000) {
  return String(value ?? fallback).trim().slice(0, max);
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export class LocalStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.uploadDir = path.join(dataDir, 'uploads');
    this.configFile = path.join(dataDir, 'config.json');
    this.memoryFile = path.join(dataDir, 'memory.json');
    this.state = defaultState();
  }

  async init() {
    await mkdir(this.uploadDir, { recursive: true });
    this.config = this.normalizeConfig(await readJson(this.configFile, defaultConfig()));
    this.memory = await readJson(this.memoryFile, { messages: [] });
    if (!Array.isArray(this.memory.messages)) this.memory = { messages: [] };
    await this.saveConfig(this.config);
    return this;
  }

  normalizeConfig(input = {}) {
    const base = defaultConfig();
    const character = input.character || {};
    const provider = input.provider || {};
    const voice = input.voice || {};
    const stage = input.stage || {};
    const memory = input.memory || {};
    const live = input.live || {};
    return {
      version: 1,
      character: {
        name: text(character.name, base.character.name, 40),
        userName: text(character.userName, base.character.userName, 40),
        relationship: text(character.relationship, base.character.relationship, 120),
        personality: text(character.personality, base.character.personality),
        speakingStyle: text(character.speakingStyle, base.character.speakingStyle),
        boundaries: text(character.boundaries, base.character.boundaries)
      },
      provider: {
        id: text(provider.id, base.provider.id, 40),
        baseUrl: text(provider.baseUrl, base.provider.baseUrl, 500),
        model: text(provider.model, '', 200),
        temperature: number(provider.temperature, base.provider.temperature, 0, 2)
      },
      voice: {
        enabled: voice.enabled !== false,
        language: text(voice.language, base.voice.language, 20),
        rate: number(voice.rate, 1, 0.5, 2),
        pitch: number(voice.pitch, 1, 0.5, 2)
      },
      stage: {
        avatar: text(stage.avatar, base.stage.avatar, 500),
        talkingAvatar: text(stage.talkingAvatar, base.stage.talkingAvatar, 500),
        avatarScale: number(stage.avatarScale, 1, 0.5, 1.8),
        subtitleEnabled: stage.subtitleEnabled !== false
      },
      memory: {
        enabled: memory.enabled !== false,
        maxMessages: Math.round(number(memory.maxMessages, 30, 4, 100)),
        notes: text(memory.notes, '', 8000)
      },
      live: {
        platform: 'bilibili',
        enabled: live.enabled === true,
        roomId: text(live.roomId, '', 30).replace(/\D/g, ''),
        autoReply: live.autoReply === true
      }
    };
  }

  async saveConfig(input) {
    this.config = this.normalizeConfig(input);
    await writeJsonAtomic(this.configFile, this.config);
    return structuredClone(this.config);
  }

  getConfig() {
    return structuredClone(this.config);
  }

  getMessages() {
    return structuredClone(this.memory.messages);
  }

  async appendMessage(message) {
    const item = {
      id: crypto.randomUUID(),
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: text(message.content, '', 12000),
      source: text(message.source, 'chat', 30),
      createdAt: new Date().toISOString()
    };
    this.memory.messages.push(item);
    const keep = this.config.memory.enabled ? this.config.memory.maxMessages : 4;
    this.memory.messages = this.memory.messages.slice(-keep);
    if (this.config.memory.enabled) await writeJsonAtomic(this.memoryFile, this.memory);
    return structuredClone(item);
  }

  async clearMemory() {
    this.memory = { messages: [] };
    await writeJsonAtomic(this.memoryFile, this.memory);
  }

  setStageState(patch) {
    this.state = { ...this.state, ...patch, updatedAt: Date.now() };
    return structuredClone(this.state);
  }

  getStageState() {
    return structuredClone(this.state);
  }

  async hasUpload(filename) {
    try {
      const info = await stat(path.join(this.uploadDir, path.basename(filename)));
      return info.isFile();
    } catch {
      return false;
    }
  }
}
