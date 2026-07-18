const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dude', {
  setInteractive: (interactive) => ipcRenderer.send('overlay:set-interactive', Boolean(interactive)),
  setPanelOpen: (open) => ipcRenderer.send('overlay:set-panel-open', Boolean(open)),
  systemSnapshot: () => ipcRenderer.invoke('system:snapshot'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  runAction: (action) => ipcRenderer.invoke('action:run', action),
  decide: (context) => ipcRenderer.invoke('ai:decide', context),
  accessibility: (prompt = false) => ipcRenderer.invoke('permissions:accessibility', prompt),
  notify: (payload) => ipcRenderer.invoke('notify', payload),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('launch-at-login', Boolean(enabled)),
  platform: process.platform
});
