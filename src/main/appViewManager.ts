import { randomUUID } from 'node:crypto';
import { BrowserWindow, clipboard, Menu, type MenuItemConstructorOptions, WebContentsView, session, shell } from 'electron';
import type { AppRuntimeState, AppTab, OpenApp, PersistedAppTabs, PluginManifest } from '../shared/types';

const TOP_BAR = 84;
const SIDE_BAR = 88;

type ManagedTab = { id: string; view: WebContentsView };
type ManagedApp = { plugin: PluginManifest; tabs: Map<string, ManagedTab>; activeTabId: string | null };
type RuntimeChanged = (appTabs: Record<string, PersistedAppTabs>, activePluginId: string | null) => void;

export class AppViewManager {
  private apps = new Map<string, ManagedApp>();
  private activePluginId: string | null = null;

  constructor(private readonly window: BrowserWindow, private readonly onRuntimeChanged?: RuntimeChanged) {
    this.window.on('resize', () => this.resize());
  }

  async open(plugin: PluginManifest, restored?: PersistedAppTabs): Promise<void> {
    const existing = this.apps.get(plugin.id);
    if (existing) {
      this.show(plugin.id);
      return;
    }

    const managed: ManagedApp = { plugin, tabs: new Map(), activeTabId: null };
    this.apps.set(plugin.id, managed);
    const savedTabs = restored?.tabs?.length ? restored.tabs : [{ id: randomUUID(), url: plugin.startUrl }];
    for (const tab of savedTabs) await this.createTab(plugin.id, tab.url, tab.id, false);
    managed.activeTabId = savedTabs.some((tab) => tab.id === restored?.activeTabId)
      ? restored?.activeTabId ?? savedTabs[0].id
      : savedTabs[0].id;
    this.show(plugin.id);
  }

  async createTab(pluginId: string, url?: string, tabId: string = randomUUID(), activate = true): Promise<void> {
    const managed = this.apps.get(pluginId);
    if (!managed) return;
    const partition = `persist:sales-os-${pluginId}`;
    const pluginSession = session.fromPartition(partition, { cache: true });
    pluginSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(managed.plugin.permissions.includes(permission === 'notifications' ? 'notifications' : 'media'));
    });

    const view = new WebContentsView({
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    view.setBackgroundColor('#f6f7fb');
    view.setVisible(false);
    managed.tabs.set(tabId, { id: tabId, view });
    this.window.contentView.addChildView(view);
    this.configureView(managed, tabId, view);
    if (activate || !managed.activeTabId) managed.activeTabId = tabId;
    if (activate) this.show(pluginId);
    await view.webContents.loadURL(url && /^https?:/i.test(url) ? url : managed.plugin.startUrl);
    this.changed();
  }

  show(pluginId: string): void {
    const target = this.apps.get(pluginId);
    if (!target) return;
    this.activePluginId = pluginId;
    for (const [appId, app] of this.apps) {
      for (const [tabId, tab] of app.tabs) {
        tab.view.setVisible(appId === pluginId && tabId === app.activeTabId);
      }
    }
    this.resize();
    this.changed();
  }

  activateTab(pluginId: string, tabId: string): void {
    const managed = this.apps.get(pluginId);
    if (!managed?.tabs.has(tabId)) return;
    managed.activeTabId = tabId;
    this.show(pluginId);
  }

  closeTab(pluginId: string, tabId: string): void {
    const managed = this.apps.get(pluginId);
    const tab = managed?.tabs.get(tabId);
    if (!managed || !tab) return;
    this.window.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    managed.tabs.delete(tabId);
    if (managed.tabs.size === 0) {
      this.close(pluginId);
      return;
    }
    if (managed.activeTabId === tabId) managed.activeTabId = [...managed.tabs.keys()].at(-1) ?? null;
    if (this.activePluginId === pluginId) this.show(pluginId);
    else this.changed();
  }

  hide(): void {
    for (const app of this.apps.values()) for (const tab of app.tabs.values()) tab.view.setVisible(false);
    this.activePluginId = null;
    this.changed();
  }

  close(pluginId: string): void {
    const managed = this.apps.get(pluginId);
    if (!managed) return;
    for (const tab of managed.tabs.values()) {
      this.window.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    }
    this.apps.delete(pluginId);
    if (this.activePluginId === pluginId) {
      this.activePluginId = null;
      const fallback = [...this.apps.keys()].at(-1);
      if (fallback) this.show(fallback);
      else this.changed();
    } else this.changed();
  }

  navigate(action: 'back' | 'forward' | 'reload' | 'home'): void {
    const current = this.getActiveTab();
    if (!current) return;
    const contents = current.tab.view.webContents;
    if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    if (action === 'reload') contents.reload();
    if (action === 'home') void contents.loadURL(current.app.plugin.startUrl);
  }

  getOpenPluginIds(): string[] { return [...this.apps.keys()]; }
  getActivePluginId(): string | null { return this.activePluginId; }

  getTabsSnapshot(): Record<string, PersistedAppTabs> {
    return Object.fromEntries([...this.apps].map(([pluginId, app]) => [pluginId, {
      activeTabId: app.activeTabId,
      tabs: [...app.tabs.values()].map((tab) => ({
        id: tab.id,
        url: /^https?:/i.test(tab.view.webContents.getURL()) ? tab.view.webContents.getURL() : app.plugin.startUrl,
      })),
    }]));
  }

  private configureView(managed: ManagedApp, _tabId: string, view: WebContentsView): void {
    const contents = view.webContents;
    contents.on('context-menu', (_event, params) => {
      const template: MenuItemConstructorOptions[] = [];
      const hasLink = /^https?:/i.test(params.linkURL);
      const hasSelection = Boolean(params.selectionText.trim());

      if (hasLink) {
        template.push(
          { label: 'Abrir link em nova aba', click: () => void this.createTab(managed.plugin.id, params.linkURL) },
          { label: 'Abrir link no navegador externo', click: () => void shell.openExternal(params.linkURL) },
          { label: 'Copiar endereço do link', click: () => clipboard.writeText(params.linkURL) },
          { type: 'separator' },
        );
      }

      if (params.isEditable) {
        template.push(
          { label: 'Desfazer', role: 'undo', enabled: params.editFlags.canUndo },
          { label: 'Refazer', role: 'redo', enabled: params.editFlags.canRedo },
          { type: 'separator' },
          { label: 'Recortar', role: 'cut', enabled: params.editFlags.canCut },
          { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
          { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
          { label: 'Selecionar tudo', role: 'selectAll', enabled: params.editFlags.canSelectAll },
        );
      } else if (hasSelection) {
        template.push({ label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy });
      }

      if (params.mediaType === 'image' && params.srcURL) {
        if (template.length) template.push({ type: 'separator' });
        template.push(
          { label: 'Copiar imagem', click: () => void contents.copyImageAt(params.x, params.y) },
          { label: 'Copiar endereço da imagem', click: () => clipboard.writeText(params.srcURL) },
          { label: 'Abrir imagem em nova aba', click: () => void this.createTab(managed.plugin.id, params.srcURL) },
        );
      }

      if (!params.isEditable && !hasSelection) {
        if (template.length) template.push({ type: 'separator' });
        template.push(
          { label: 'Voltar', click: () => contents.navigationHistory.goBack(), enabled: contents.navigationHistory.canGoBack() },
          { label: 'Avançar', click: () => contents.navigationHistory.goForward(), enabled: contents.navigationHistory.canGoForward() },
          { label: 'Recarregar', click: () => contents.reload() },
          { label: 'Copiar endereço da página', click: () => clipboard.writeText(contents.getURL()), enabled: /^https?:/i.test(contents.getURL()) },
        );
      }

      if (template.length) Menu.buildFromTemplate(template).popup({ window: this.window });
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void this.createTab(managed.plugin.id, url);
      else if (url && url !== 'about:blank') void shell.openExternal(url);
      return { action: 'deny' };
    });
    const update = () => this.changed();
    contents.on('did-start-loading', update);
    contents.on('did-stop-loading', update);
    contents.on('did-navigate', update);
    contents.on('did-navigate-in-page', update);
    contents.on('page-title-updated', update);
    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) void contents.loadURL(`data:text/html,${encodeURIComponent(this.errorPage(managed.plugin.name, description, url))}`);
    });
  }

  private getActiveTab(): { app: ManagedApp; tab: ManagedTab } | null {
    const app = this.activePluginId ? this.apps.get(this.activePluginId) : null;
    const tab = app?.activeTabId ? app.tabs.get(app.activeTabId) : null;
    return app && tab ? { app, tab } : null;
  }

  private resize(): void {
    const current = this.getActiveTab();
    if (!current) return;
    const [width, height] = this.window.getContentSize();
    current.tab.view.setBounds({ x: SIDE_BAR, y: TOP_BAR, width: Math.max(320, width - SIDE_BAR), height: Math.max(240, height - TOP_BAR) });
  }

  private changed(): void {
    this.publish();
    this.onRuntimeChanged?.(this.getTabsSnapshot(), this.activePluginId);
  }

  private publish(): void {
    if (this.window.isDestroyed()) return;
    const current = this.getActiveTab();
    let activeApp: OpenApp | null = null;
    if (current) {
      const contents = current.tab.view.webContents;
      const tabs: AppTab[] = [...current.app.tabs.values()].map((tab) => ({
        id: tab.id,
        title: tab.view.webContents.getTitle() || current.app.plugin.name,
        url: tab.view.webContents.getURL() || current.app.plugin.startUrl,
        loading: tab.view.webContents.isLoading(),
      }));
      activeApp = {
        pluginId: current.app.plugin.id,
        title: contents.getTitle() || current.app.plugin.name,
        url: contents.getURL() || current.app.plugin.startUrl,
        canGoBack: contents.navigationHistory.canGoBack(),
        canGoForward: contents.navigationHistory.canGoForward(),
        loading: contents.isLoading(),
        activeTabId: current.tab.id,
        tabs,
      };
    }
    const state: AppRuntimeState = { activeApp, openPluginIds: this.getOpenPluginIds() };
    this.window.webContents.send('app:state', state);
  }

  private errorPage(name: string, description: string, url: string): string {
    return `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;background:#f6f7fb;color:#172033;display:grid;place-items:center;height:100vh;margin:0}.box{max-width:520px;background:white;padding:40px;border-radius:20px;box-shadow:0 16px 50px #1c2a4418}h1{font-size:22px}p{color:#68738a;line-height:1.6}code{font-size:12px}</style><div class="box"><h1>${name} não carregou</h1><p>${description}</p><code>${url}</code><p>Use o botão de recarregar para tentar novamente.</p></div>`;
  }
}
