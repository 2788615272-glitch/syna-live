import { app, BrowserWindow, Menu, safeStorage, shell, dialog } from 'electron';
import path from 'node:path';
import { startLocalServer } from './server/local-server.mjs';
import { SecretVault } from './runtime/secret-vault.mjs';

let window;
let localServer;

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();

app.on('second-instance', () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const dataDir = app.getPath('userData');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密不可用，无法安全保存 API Key');
  const vault = await new SecretVault({
    dataDir,
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value)
  }).init();
  localServer = await startLocalServer({ dataDir, vault });
  window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#101114',
    title: 'Syna Live',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${localServer.port}/stage`)) return { action: 'allow' };
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${localServer.port}/`)) event.preventDefault();
  });
  await window.loadURL(localServer.dashboardUrl);
}).catch((error) => {
  dialog.showErrorBox('Syna Live 启动失败', String(error?.message || error));
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => localServer?.close());
