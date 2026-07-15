import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class SecretVault {
  constructor({ dataDir, encrypt, decrypt, initial = {} }) {
    this.file = path.join(dataDir, 'secrets.enc');
    this.encrypt = encrypt;
    this.decrypt = decrypt;
    this.values = { ...initial };
  }

  async init() {
    if (!this.decrypt) return this;
    try {
      const encrypted = await readFile(this.file);
      this.values = JSON.parse(this.decrypt(encrypted));
    } catch {
      this.values = { ...this.values };
    }
    return this;
  }

  has(name) {
    return Boolean(this.values[name]);
  }

  get(name) {
    return this.values[name] || '';
  }

  async set(name, value) {
    const clean = String(value || '').trim();
    if (clean) this.values[name] = clean;
    else delete this.values[name];
    if (!this.encrypt) return;
    const encrypted = this.encrypt(JSON.stringify(this.values));
    await writeFile(this.file, encrypted, { mode: 0o600 });
  }
}
