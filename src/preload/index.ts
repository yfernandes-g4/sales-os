import { contextBridge, ipcRenderer } from 'electron';
import type { AccessSession, AppRuntimeState, PluginManifest, RolePolicy, SalesOSApi, SimulatedUser, WorkspaceState } from '../shared/types';

const api: SalesOSApi = {
  catalog: () => ipcRenderer.invoke('catalog:list') as Promise<PluginManifest[]>,
  state: () => ipcRenderer.invoke('workspace:get') as Promise<WorkspaceState>,
  users: () => ipcRenderer.invoke('auth:users') as Promise<SimulatedUser[]>,
  session: () => ipcRenderer.invoke('auth:session') as Promise<AccessSession | null>,
  login: (userId) => ipcRenderer.invoke('auth:login', userId) as Promise<AccessSession>,
  logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
  rolePolicies: () => ipcRenderer.invoke('access:policies') as Promise<RolePolicy[]>,
  updateRolePolicy: (policy) => ipcRenderer.invoke('access:update-policy', policy) as Promise<RolePolicy[]>,
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
  onAppState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppRuntimeState) => callback(state);
    ipcRenderer.on('app:state', listener);
    return () => ipcRenderer.removeListener('app:state', listener);
  },
};

contextBridge.exposeInMainWorld('salesOS', api);
