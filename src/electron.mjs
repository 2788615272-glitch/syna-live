import { app, BrowserWindow, Menu, safeStorage, shell, dialog, session } from 'electron';
import path from 'node:path';
import { startLocalServer } from './server/local-server.mjs';
import { SecretVault } from './runtime/secret-vault.mjs';

let window;
let companionWindow;
let localServer;

async function showCompanion() {
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.show();
    companionWindow.focus();
    return;
  }
  companionWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 380,
    minHeight: 560,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    title: 'Syna Desktop Companion',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  companionWindow.setAlwaysOnTop(true, 'floating');
  companionWindow.on('closed', () => { companionWindow = null; });
  companionWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${localServer.port}/`)) event.preventDefault();
  });
  await companionWindow.loadURL(localServer.companionUrl);
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();

app.on('second-instance', () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const localPage = details.requestingUrl?.startsWith('http://127.0.0.1:');
    callback(Boolean(localPage && permission === 'media'));
  });
  const dataDir = app.getPath('userData');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密不可用，无法安全保存 API Key');
  const vault = await new SecretVault({
    dataDir,
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value)
  }).init();
  localServer = await startLocalServer({
    dataDir,
    vault,
    onCompanionCommand: async (command) => {
      if (command === 'show') await showCompanion();
      if (command === 'hide') companionWindow?.hide();
    }
  });
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
