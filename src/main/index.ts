import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { AccessSession, PersistedAppTabs, PluginManifest, RolePolicy, SimulatedUser, UserRole, WorkspaceState } from '../shared/types';
import { AppViewManager } from './appViewManager';
import { loadCatalog, WorkspaceStore } from './store';

let mainWindow: BrowserWindow | null = null;
let viewManager: AppViewManager | null = null;
let store: WorkspaceStore;
let activeSession: AccessSession | null = null;
let restoringRuntime = false;

const SIMULATED_USERS: SimulatedUser[] = [
  { id: 'user-admin', name: 'Yago Fernandes', email: 'yago.admin@g4.com', role: 'administrator', roleLabel: 'Administrador', initials: 'YF' },
  { id: 'user-sdr', name: 'Ana SDR', email: 'ana.sdr@g4.com', role: 'sdr', roleLabel: 'SDR', initials: 'AS' },
  { id: 'user-coordinator', name: 'Carlos Coordenador', email: 'carlos.coordenador@g4.com', role: 'coordinator', roleLabel: 'Coordenador', initials: 'CC' },
];
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

function requireSession(): AccessSession {
  if (!activeSession) throw new Error('Faça login para continuar.');
  return activeSession;
}

function policyFor(role: UserRole, state = store.get()): RolePolicy {
  return state.rolePolicies[role];
}

function allowedCatalog(): PluginManifest[] {
  const session = requireSession();
  const allowed = new Set(policyFor(session.user.role).visiblePluginIds);
  return catalog().filter((plugin) => allowed.has(plugin.id));
}

function scopedState(state = store.get()): WorkspaceState {
  if (!activeSession) return { ...state, installedPluginIds: [] };
  const role = activeSession.user.role;
  const policy = policyFor(role, state);
  const installed = unique([...(state.installedByRole[role] ?? []), ...policy.defaultInstalledPluginIds])
    .filter((id) => policy.visiblePluginIds.includes(id));
  return { ...state, installedPluginIds: installed };
}

function updateRoleInstalled(role: UserRole, installedPluginIds: string[]): WorkspaceState {
  return mutate((state) => ({ ...state, installedByRole: { ...state.installedByRole, [role]: unique(installedPluginIds) } }));
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

function registerIpc(): void {
  ipcMain.handle('auth:users', () => SIMULATED_USERS);
  ipcMain.handle('auth:session', () => activeSession);
  ipcMain.handle('auth:login', (_event, userId: string) => {
    const user = SIMULATED_USERS.find((item) => item.id === userId);
    if (!user) throw new Error('Usuário inválido.');
    viewManager?.closeAll();
    activeSession = { user, signedInAt: new Date().toISOString() };
    const state = store.get();
    const policy = policyFor(user.role, state);
    updateRoleInstalled(user.role, unique([...(state.installedByRole[user.role] ?? []), ...policy.defaultInstalledPluginIds]));
    return activeSession;
  });
  ipcMain.handle('auth:logout', () => { viewManager?.closeAll(); activeSession = null; });
  ipcMain.handle('access:policies', () => {
    const session = requireSession();
    if (session.user.role !== 'administrator') throw new Error('Acesso restrito ao administrador.');
    return Object.values(store.get().rolePolicies);
  });
  ipcMain.handle('access:update-policy', (_event, input: RolePolicy) => {
    const session = requireSession();
    if (session.user.role !== 'administrator') throw new Error('Acesso restrito ao administrador.');
    const validIds = new Set(catalog().map((plugin) => plugin.id));
    const policy: RolePolicy = {
      ...input,
      visiblePluginIds: unique(input.visiblePluginIds).filter((id) => validIds.has(id)),
      defaultInstalledPluginIds: unique(input.defaultInstalledPluginIds).filter((id) => validIds.has(id) && input.visiblePluginIds.includes(id)),
    };
    mutate((state) => ({ ...state, rolePolicies: { ...state.rolePolicies, [policy.role]: policy } }));
    return Object.values(store.get().rolePolicies);
  });
  ipcMain.handle('catalog:list', () => activeSession ? allowedCatalog() : []);
  ipcMain.handle('workspace:get', () => scopedState());
  ipcMain.handle('workspace:install', (_event, pluginId: string) => {
    const session = requireSession();
    const state = scopedState();
    if (!policyFor(session.user.role).visiblePluginIds.includes(pluginId)) throw new Error('Aplicativo não autorizado para este cargo.');
    updateRoleInstalled(session.user.role, unique([...state.installedPluginIds, pluginId]));
    mutate((current) => ({ ...current, disabledPluginIds: current.disabledPluginIds.filter((id) => id !== pluginId) }));
    return scopedState();
  });
  ipcMain.handle('workspace:uninstall', (_event, pluginId: string) => {
    const session = requireSession();
    viewManager?.close(pluginId);
    const activePluginId = viewManager?.getActivePluginId() ?? null;
    const state = scopedState();
    updateRoleInstalled(session.user.role, state.installedPluginIds.filter((id) => id !== pluginId));
    mutate((current) => ({
      ...current,
      favoritePluginIds: current.favoritePluginIds.filter((id) => id !== pluginId),
      openPluginIds: current.openPluginIds.filter((id) => id !== pluginId),
      lastActivePluginId: current.lastActivePluginId === pluginId ? activePluginId : current.lastActivePluginId,
      appTabs: Object.fromEntries(Object.entries(current.appTabs).filter(([id]) => id !== pluginId)),
    }));
    return scopedState();
  });
  ipcMain.handle('workspace:favorite', (_event, pluginId: string) => {
    requireSession();
    mutate((state) => ({
      ...state,
      favoritePluginIds: state.favoritePluginIds.includes(pluginId)
        ? state.favoritePluginIds.filter((id) => id !== pluginId)
        : unique([...state.favoritePluginIds, pluginId]),
    }));
    return scopedState();
  });
  ipcMain.handle('workspace:enabled', (_event, pluginId: string) => {
    const session = requireSession();
    if (session.user.role !== 'administrator') throw new Error('Acesso restrito ao administrador.');
    const current = store.get();
    const disabling = !current.disabledPluginIds.includes(pluginId);
    if (disabling) viewManager?.close(pluginId);
    mutate((state) => ({
      ...state,
      disabledPluginIds: disabling
        ? unique([...state.disabledPluginIds, pluginId])
        : state.disabledPluginIds.filter((id) => id !== pluginId),
      openPluginIds: disabling ? state.openPluginIds.filter((id) => id !== pluginId) : state.openPluginIds,
      lastActivePluginId: disabling && state.lastActivePluginId === pluginId ? viewManager?.getActivePluginId() ?? null : state.lastActivePluginId,
      appTabs: disabling ? Object.fromEntries(Object.entries(state.appTabs).filter(([id]) => id !== pluginId)) : state.appTabs,
    }));
    return scopedState();
  });
  ipcMain.handle('catalog:add', (_event, input: PluginManifest) => {
    const session = requireSession();
    if (session.user.role !== 'administrator') throw new Error('Acesso restrito ao administrador.');
    const plugin = ensurePlugin(input);
    mutate((state) => {
      const adminPolicy = state.rolePolicies.administrator;
      return {
        ...state,
        customPlugins: [...state.customPlugins, plugin],
        rolePolicies: { ...state.rolePolicies, administrator: { ...adminPolicy, visiblePluginIds: unique([...adminPolicy.visiblePluginIds, plugin.id]) } },
        installedByRole: { ...state.installedByRole, administrator: unique([...state.installedByRole.administrator, plugin.id]) },
      };
    });
    return allowedCatalog();
  });
  ipcMain.handle('workspace:export', () => { if (requireSession().user.role !== 'administrator') throw new Error('Acesso restrito.'); return store.exportConfig(); });
  ipcMain.handle('workspace:import', () => { if (requireSession().user.role !== 'administrator') throw new Error('Acesso restrito.'); return store.importConfig(); });
  ipcMain.handle('app:open', async (_event, pluginId: string) => {
    requireSession();
    const state = scopedState();
    const plugin = allowedCatalog().find((item) => item.id === pluginId);
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
    viewManager = null;
    mainWindow = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  viewManager.hide();
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
