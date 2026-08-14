import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { MacroDefinition, MacroInputValues, PersistedAppTabs, PluginManifest, WorkspaceState } from '../shared/types';
import { AppViewManager } from './appViewManager';
import { MacroEngine } from './macroEngine';
import { loadCatalog, WorkspaceStore } from './store';

let mainWindow: BrowserWindow | null = null;
let viewManager: AppViewManager | null = null;
let macroEngine: MacroEngine | null = null;
let store: WorkspaceStore;
let restoringRuntime = false;
let runtimePersistTimer: NodeJS.Timeout | null = null;

function persistRuntime(appTabs: Record<string, PersistedAppTabs>, activePluginId: string | null): void {
  if (restoringRuntime) return;
  if (runtimePersistTimer) clearTimeout(runtimePersistTimer);
  runtimePersistTimer = setTimeout(() => {
    mutate((state) => ({
      ...state,
      openPluginIds: Object.keys(appTabs),
      lastActivePluginId: activePluginId,
      appTabs,
    }));
  }, 150);
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function catalog(): PluginManifest[] {
  return loadCatalog(store.get().customPlugins);
}

function ensurePlugin(input: PluginManifest): PluginManifest {
  const url = new URL(input.startUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('A URL precisa usar HTTP ou HTTPS.');
  const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!id || !input.name.trim()) throw new Error('Nome e identificador são obrigatórios.');
  if (catalog().some((plugin) => plugin.id === id)) throw new Error('Já existe um aplicativo com esse identificador.');
  return {
    ...input,
    id,
    name: input.name.trim(),
    description: input.description.trim(),
    startUrl: url.toString(),
    permissions: input.permissions ?? ['navigation'],
    enabled: true,
  };
}

function mutate(fn: (state: WorkspaceState) => WorkspaceState): WorkspaceState {
  return store.update(fn);
}

function normalizeMacro(input: MacroDefinition): MacroDefinition {
  return {
    ...input,
    executionType: input.executionType ?? 'actions',
    inputs: input.inputs ?? [],
    output: input.output ?? { type: 'summary', title: 'Resultado da macro' },
    successCriteria: input.successCriteria ?? { requireAllSteps: true, requireOutput: false, minimumProcessed: 0, maximumFailures: 0 },
  };
}

function registerIpc(): void {
  ipcMain.handle('catalog:list', () => catalog());
  ipcMain.handle('workspace:get', () => store.get());
  ipcMain.handle('workspace:install', (_event, pluginId: string) => mutate((state) => ({
    ...state,
    installedPluginIds: unique([...state.installedPluginIds, pluginId]),
    disabledPluginIds: state.disabledPluginIds.filter((id) => id !== pluginId),
  })));
  ipcMain.handle('workspace:uninstall', (_event, pluginId: string) => {
    viewManager?.close(pluginId);
    const activePluginId = viewManager?.getActivePluginId() ?? null;
    return mutate((state) => ({
      ...state,
      installedPluginIds: state.installedPluginIds.filter((id) => id !== pluginId),
      favoritePluginIds: state.favoritePluginIds.filter((id) => id !== pluginId),
      openPluginIds: state.openPluginIds.filter((id) => id !== pluginId),
      lastActivePluginId: state.lastActivePluginId === pluginId ? activePluginId : state.lastActivePluginId,
      appTabs: Object.fromEntries(Object.entries(state.appTabs).filter(([id]) => id !== pluginId)),
    }));
  });
  ipcMain.handle('workspace:favorite', (_event, pluginId: string) => mutate((state) => ({
    ...state,
    favoritePluginIds: state.favoritePluginIds.includes(pluginId)
      ? state.favoritePluginIds.filter((id) => id !== pluginId)
      : unique([...state.favoritePluginIds, pluginId]),
  })));
  ipcMain.handle('workspace:enabled', (_event, pluginId: string) => {
    const current = store.get();
    const disabling = !current.disabledPluginIds.includes(pluginId);
    if (disabling) viewManager?.close(pluginId);
    return mutate((state) => ({
      ...state,
      disabledPluginIds: disabling
        ? unique([...state.disabledPluginIds, pluginId])
        : state.disabledPluginIds.filter((id) => id !== pluginId),
      openPluginIds: disabling ? state.openPluginIds.filter((id) => id !== pluginId) : state.openPluginIds,
      lastActivePluginId: disabling && state.lastActivePluginId === pluginId ? viewManager?.getActivePluginId() ?? null : state.lastActivePluginId,
      appTabs: disabling ? Object.fromEntries(Object.entries(state.appTabs).filter(([id]) => id !== pluginId)) : state.appTabs,
    }));
  });
  ipcMain.handle('catalog:add', (_event, input: PluginManifest) => {
    const plugin = ensurePlugin(input);
    mutate((state) => ({
      ...state,
      customPlugins: [...state.customPlugins, plugin],
      installedPluginIds: unique([...state.installedPluginIds, plugin.id]),
    }));
    return catalog();
  });
  ipcMain.handle('workspace:export', () => store.exportConfig());
  ipcMain.handle('workspace:import', () => store.importConfig());
  ipcMain.handle('app:open', async (_event, pluginId: string) => {
    const state = store.get();
    const plugin = catalog().find((item) => item.id === pluginId);
    if (!plugin || !state.installedPluginIds.includes(pluginId) || state.disabledPluginIds.includes(pluginId)) {
      throw new Error('Aplicativo indisponível.');
    }
    mutate((current) => ({
      ...current,
      recentPluginIds: [pluginId, ...current.recentPluginIds.filter((id) => id !== pluginId)].slice(0, 8),
      openPluginIds: unique([...current.openPluginIds, pluginId]),
      lastActivePluginId: pluginId,
    }));
    await viewManager?.open(plugin);
  });
  ipcMain.handle('app:hide', () => {
    viewManager?.hide();
    mutate((state) => ({ ...state, lastActivePluginId: null }));
  });
  ipcMain.handle('app:close', (_event, pluginId: string) => {
    viewManager?.close(pluginId);
    const activePluginId = viewManager?.getActivePluginId() ?? null;
    mutate((state) => ({
      ...state,
      openPluginIds: state.openPluginIds.filter((id) => id !== pluginId),
      lastActivePluginId: state.lastActivePluginId === pluginId ? activePluginId : state.lastActivePluginId,
      appTabs: Object.fromEntries(Object.entries(state.appTabs).filter(([id]) => id !== pluginId)),
    }));
  });
  ipcMain.handle('app:new-tab', async (_event, pluginId: string) => viewManager?.createTab(pluginId));
  ipcMain.handle('app:activate-tab', (_event, pluginId: string, tabId: string) => viewManager?.activateTab(pluginId, tabId));
  ipcMain.handle('app:close-tab', (_event, pluginId: string, tabId: string) => viewManager?.closeTab(pluginId, tabId));
  ipcMain.handle('app:navigate', (_event, action: 'back' | 'forward' | 'reload' | 'home') => viewManager?.navigate(action));
  ipcMain.handle('macro:list', () => store.get().macros.map(normalizeMacro));
  ipcMain.handle('macro:save', (_event, input: MacroDefinition) => mutate((state) => {
    const now = new Date().toISOString();
    const existing = state.macros.find((macro) => macro.id === input.id);
    const macro: MacroDefinition = normalizeMacro({
      ...input,
      name: input.name.trim() || 'Macro sem nome',
      description: input.description.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      steps: input.steps.slice(0, 200),
    });
    return { ...state, macros: [...state.macros.filter((item) => item.id !== macro.id), macro] };
  }).macros);
  ipcMain.handle('macro:delete', (_event, macroId: string) => mutate((state) => ({
    ...state, macros: state.macros.filter((macro) => macro.id !== macroId),
  })).macros);
  ipcMain.handle('macro:record-start', async (_event, pluginId: string) => macroEngine?.startRecording(pluginId));
  ipcMain.handle('macro:record-stop', async () => macroEngine?.stopRecording() ?? []);
  ipcMain.handle('macro:run', async (_event, macroId: string, inputs: MacroInputValues = {}) => {
    const stored = store.get().macros.find((item) => item.id === macroId);
    const macro = stored ? normalizeMacro(stored) : undefined;
    if (!macro) throw new Error('Macro não encontrada.');
    const plugin = catalog().find((item) => item.id === macro.pluginId);
    if (!plugin) throw new Error('Aplicativo da macro não encontrado.');
    await viewManager?.open(plugin, store.get().appTabs[plugin.id]);
    return macroEngine?.run(macro, inputs);
  });
  ipcMain.handle('macro:cancel', () => macroEngine?.cancel());
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 680,
    title: 'Sales OS',
    backgroundColor: '#f6f7fb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  viewManager = new AppViewManager(mainWindow, persistRuntime);
  macroEngine = new MacroEngine(mainWindow, viewManager);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', () => {
    const capturePath = process.env.SALES_OS_CAPTURE;
    if (capturePath) {
      setTimeout(async () => {
        const image = await mainWindow?.webContents.capturePage();
        if (image) fs.writeFileSync(capturePath, image.toPNG());
      }, 1500);
    }
  });
  mainWindow.on('closed', () => {
    macroEngine = null;
    viewManager = null;
    mainWindow = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  const saved = store.get();
  const available = catalog().filter((plugin) => saved.openPluginIds.includes(plugin.id)
    && saved.installedPluginIds.includes(plugin.id)
    && !saved.disabledPluginIds.includes(plugin.id));
  restoringRuntime = true;
  for (const plugin of available) await viewManager.open(plugin, saved.appTabs[plugin.id]);
  if (saved.lastActivePluginId && available.some((plugin) => plugin.id === saved.lastActivePluginId)) {
    viewManager.show(saved.lastActivePluginId);
  } else {
    viewManager.hide();
  }
  restoringRuntime = false;
  persistRuntime(viewManager.getTabsSnapshot(), viewManager.getActivePluginId());
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.g4.salesos');
  store = new WorkspaceStore();
  registerIpc();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
