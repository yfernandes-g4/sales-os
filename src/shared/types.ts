export type PluginCategory = 'Produtividade' | 'CRM' | 'Comunicação' | 'Dados' | 'Interno';

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  startUrl: string;
  icon?: string;
  category: PluginCategory;
  permissions: Array<'navigation' | 'notifications' | 'media' | 'downloads'>;
  enabled: boolean;
  accent?: string;
}

export interface AppTab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
}

export interface OpenApp {
  pluginId: string;
  title: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  activeTabId: string;
  tabs: AppTab[];
}

export interface PersistedTab {
  id: string;
  url: string;
}

export interface PersistedAppTabs {
  activeTabId: string | null;
  tabs: PersistedTab[];
}

export interface AppRuntimeState {
  activeApp: OpenApp | null;
  openPluginIds: string[];
}

export interface WorkspaceState {
  installedPluginIds: string[];
  favoritePluginIds: string[];
  recentPluginIds: string[];
  openPluginIds: string[];
  lastActivePluginId: string | null;
  appTabs: Record<string, PersistedAppTabs>;
  disabledPluginIds: string[];
  customPlugins: PluginManifest[];
}

export interface SalesOSApi {
  catalog: () => Promise<PluginManifest[]>;
  state: () => Promise<WorkspaceState>;
  install: (pluginId: string) => Promise<WorkspaceState>;
  uninstall: (pluginId: string) => Promise<WorkspaceState>;
  toggleFavorite: (pluginId: string) => Promise<WorkspaceState>;
  toggleEnabled: (pluginId: string) => Promise<WorkspaceState>;
  addCustomPlugin: (plugin: PluginManifest) => Promise<PluginManifest[]>;
  exportConfig: () => Promise<string | null>;
  importConfig: () => Promise<WorkspaceState | null>;
  openApp: (pluginId: string) => Promise<void>;
  hideApp: () => Promise<void>;
  closeApp: (pluginId: string) => Promise<void>;
  newTab: (pluginId: string) => Promise<void>;
  activateTab: (pluginId: string, tabId: string) => Promise<void>;
  closeTab: (pluginId: string, tabId: string) => Promise<void>;
  navigate: (action: 'back' | 'forward' | 'reload' | 'home') => Promise<void>;
  onAppState: (callback: (state: AppRuntimeState) => void) => () => void;
}
