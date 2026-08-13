import { contextBridge, ipcRenderer } from 'electron';
import type { AppRuntimeState, MacroDefinition, MacroRuntimeEvent, MacroStep, PluginManifest, SalesOSApi, WorkspaceState } from '../shared/types';

const api: SalesOSApi = {
  catalog: () => ipcRenderer.invoke('catalog:list') as Promise<PluginManifest[]>,
  state: () => ipcRenderer.invoke('workspace:get') as Promise<WorkspaceState>,
  install: (pluginId) => ipcRenderer.invoke('workspace:install', pluginId) as Promise<WorkspaceState>,
  uninstall: (pluginId) => ipcRenderer.invoke('workspace:uninstall', pluginId) as Promise<WorkspaceState>,
  toggleFavorite: (pluginId) => ipcRenderer.invoke('workspace:favorite', pluginId) as Promise<WorkspaceState>,
  toggleEnabled: (pluginId) => ipcRenderer.invoke('workspace:enabled', pluginId) as Promise<WorkspaceState>,
  addCustomPlugin: (plugin) => ipcRenderer.invoke('catalog:add', plugin) as Promise<PluginManifest[]>,
  exportConfig: () => ipcRenderer.invoke('workspace:export') as Promise<string | null>,
  importConfig: () => ipcRenderer.invoke('workspace:import') as Promise<WorkspaceState | null>,
  openApp: (pluginId) => ipcRenderer.invoke('app:open', pluginId) as Promise<void>,
  hideApp: () => ipcRenderer.invoke('app:hide') as Promise<void>,
  closeApp: (pluginId) => ipcRenderer.invoke('app:close', pluginId) as Promise<void>,
  newTab: (pluginId) => ipcRenderer.invoke('app:new-tab', pluginId) as Promise<void>,
  activateTab: (pluginId, tabId) => ipcRenderer.invoke('app:activate-tab', pluginId, tabId) as Promise<void>,
  closeTab: (pluginId, tabId) => ipcRenderer.invoke('app:close-tab', pluginId, tabId) as Promise<void>,
  navigate: (action) => ipcRenderer.invoke('app:navigate', action) as Promise<void>,
  listMacros: () => ipcRenderer.invoke('macro:list') as Promise<MacroDefinition[]>,
  saveMacro: (macro) => ipcRenderer.invoke('macro:save', macro) as Promise<MacroDefinition[]>,
  deleteMacro: (macroId) => ipcRenderer.invoke('macro:delete', macroId) as Promise<MacroDefinition[]>,
  startMacroRecording: (pluginId) => ipcRenderer.invoke('macro:record-start', pluginId) as Promise<void>,
  stopMacroRecording: () => ipcRenderer.invoke('macro:record-stop') as Promise<MacroStep[]>,
  runMacro: (macroId) => ipcRenderer.invoke('macro:run', macroId) as Promise<void>,
  cancelMacro: () => ipcRenderer.invoke('macro:cancel') as Promise<void>,
  onAppState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppRuntimeState) => callback(state);
    ipcRenderer.on('app:state', listener);
    return () => ipcRenderer.removeListener('app:state', listener);
  },
  onMacroEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, runtimeEvent: MacroRuntimeEvent) => callback(runtimeEvent);
    ipcRenderer.on('macro:event', listener);
    return () => ipcRenderer.removeListener('macro:event', listener);
  },
};

contextBridge.exposeInMainWorld('salesOS', api);
