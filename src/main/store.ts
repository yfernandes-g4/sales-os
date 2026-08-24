import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
import type { PluginManifest, WorkspaceState } from '../shared/types';

const defaults: WorkspaceState = {
  installedPluginIds: ['gmail', 'calendar', 'notion'],
  favoritePluginIds: ['gmail', 'calendar'],
  recentPluginIds: [],
  openPluginIds: [],
  lastActivePluginId: null,
  appTabs: {},
  disabledPluginIds: [],
  customPlugins: [],
  rolePolicies: {
    administrator: {
      role: 'administrator', label: 'Administrador', description: 'Acesso total aos aplicativos e ao painel de controle.',
      visiblePluginIds: ['gmail', 'calendar', 'notion', 'hubspot', 'salesforce', 'looker', 'plataforma-comercial', 'performance-comercial', 'enablement-comercial'],
      defaultInstalledPluginIds: ['gmail', 'calendar', 'notion', 'hubspot', 'salesforce', 'looker', 'plataforma-comercial', 'performance-comercial', 'enablement-comercial'],
    },
    sdr: {
      role: 'sdr', label: 'SDR', description: 'Ferramentas essenciais para prospecção e gestão de leads.',
      visiblePluginIds: ['hubspot', 'salesforce', 'plataforma-comercial'],
      defaultInstalledPluginIds: ['hubspot', 'plataforma-comercial'],
    },
    coordinator: {
      role: 'coordinator', label: 'Coordenador', description: 'Produtividade, indicadores e enablement da operação.',
      visiblePluginIds: ['gmail', 'calendar', 'notion', 'looker', 'performance-comercial', 'enablement-comercial'],
      defaultInstalledPluginIds: ['gmail', 'calendar', 'performance-comercial'],
    },
  },
  installedByRole: {
    administrator: ['gmail', 'calendar', 'notion', 'hubspot', 'salesforce', 'looker', 'plataforma-comercial', 'performance-comercial', 'enablement-comercial'],
    sdr: ['hubspot', 'plataforma-comercial'],
    coordinator: ['gmail', 'calendar', 'performance-comercial'],
  },
};

export class WorkspaceStore {
  private filePath = path.join(app.getPath('userData'), 'workspace.json');

  get(): WorkspaceState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<WorkspaceState>;
      return { ...defaults, ...parsed };
    } catch {
      return structuredClone(defaults);
    }
  }

  set(next: WorkspaceState): WorkspaceState {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  update(mutator: (state: WorkspaceState) => WorkspaceState): WorkspaceState {
    return this.set(mutator(this.get()));
  }

  async exportConfig(): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Exportar configuração do Sales OS',
      defaultPath: 'sales-os-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, JSON.stringify(this.get(), null, 2), 'utf8');
    return result.filePath;
  }

  async importConfig(): Promise<WorkspaceState | null> {
    const result = await dialog.showOpenDialog({
      title: 'Importar configuração do Sales OS',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')) as WorkspaceState;
    if (!Array.isArray(imported.installedPluginIds) || !Array.isArray(imported.customPlugins)) {
      throw new Error('Arquivo de configuração inválido.');
    }
    return this.set({ ...defaults, ...imported });
  }
}

export function loadCatalog(customPlugins: PluginManifest[]): PluginManifest[] {
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'plugins.json'),
    path.join(app.getAppPath(), 'dist', 'resources', 'plugins.json'),
  ];
  const catalogPath = candidates.find((candidate) => fs.existsSync(candidate));
  const builtIn = catalogPath
    ? (JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as PluginManifest[])
    : [];
  return [...builtIn, ...customPlugins];
}
