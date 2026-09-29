// SimRoom main process: owns the window, room.json, and the assets protocol.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const { RoomStore } = require('./store');

const argv = process.argv.slice(1);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

// Everything the user owns lives in %APPDATA%\<productName>\ (productName comes from package.json).
const dataDir = option('data-dir') || process.env.SIMROOM_DATA || path.join(app.getPath('appData'), app.getName());
// Keep Chromium's cache out of the user's room folder.
app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-runtime`));

const store = new RoomStore(dataDir);
const windowed = flag('windowed') || process.env.SIMROOM_WINDOWED === '1';
let mainWindow = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// simroom://assets/<file> serves user images from the assets/ folder.
protocol.registerSchemesAsPrivileged([
  { scheme: 'simroom', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerAssetProtocol() {
  protocol.handle('simroom', (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = url.host === 'assets' ? store.assetPath(relative) : null;
    if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const loaded = store.load();
  const fullscreen = !windowed && (!loaded.ok || loaded.room.startup.fullscreen);
  mainWindow = new BrowserWindow({
    title: app.getName(),
    width: 1600,
    height: 900,
    fullscreen,
    frame: !fullscreen,
    autoHideMenuBar: true,
    backgroundColor: '#0f2a1d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // The home screen never navigates away or opens stray windows.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function sendRoom() {
  if (mainWindow) mainWindow.webContents.send('room:changed', store.load());
}

// Hand-edits to room.json apply live.
function watchRoomFile() {
  let timer = null;
  try {
    fs.watch(dataDir, (_event, filename) => {
      if (filename && filename !== 'room.json') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (store.changedOnDisk()) sendRoom();
      }, 350);
    });
  } catch (err) {
    console.error('Could not watch room folder:', err);
  }
}

ipcMain.handle('room:load', () => store.load());

ipcMain.handle('room:save', (_event, room) => {
  try {
    return { ok: true, room: store.save(room) };
  } catch (err) {
    return { ok: false, error: { title: 'Could not save room.json', details: err.details || [err.message] } };
  }
});

ipcMain.handle('room:reset-to-sample', () => {
  store.resetToSample();
  return store.load();
});

ipcMain.handle('app:info', () => ({
  productName: app.getName(),
  version: app.getVersion(),
  dataDir,
  roomFile: store.roomFile,
}));

ipcMain.handle('room:action', async (_event, name) => {
  switch (name) {
    case 'exit':
      app.quit();
      return { ok: true };
    case 'open-room-folder':
      await shell.openPath(dataDir);
      return { ok: true };
    case 'windows-settings':
      await shell.openExternal('ms-settings:');
      return { ok: true };
    case 'reload':
      sendRoom();
      return { ok: true };
    default:
      return { ok: false, reason: 'not-yet' };
  }
});

app.whenReady().then(() => {
  store.ensure();
  registerAssetProtocol();
  createWindow();
  watchRoomFile();
});

app.on('window-all-closed', () => app.quit());
