// The only bridge between the home screen and the main process.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simroom', {
  load: () => ipcRenderer.invoke('room:load'),
  save: (room) => ipcRenderer.invoke('room:save', room),
  resetToSample: () => ipcRenderer.invoke('room:reset-to-sample'),
  onChanged: (fn) => ipcRenderer.on('room:changed', (_event, result) => fn(result)),
  action: (name) => ipcRenderer.invoke('room:action', name),
  info: () => ipcRenderer.invoke('app:info'),
});
