import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Blocks, ChevronRight, CircleUserRound, Download, Home,
  LayoutGrid, LoaderCircle, Plus, RefreshCw, Search, Settings, ShieldCheck, Star,
  Store, Upload, WandSparkles, Square, Pause, Play, Crosshair, X,
} from 'lucide-react';
import type { MacroStep, OpenApp, PluginCategory, PluginManifest, WorkspaceState } from '../shared/types';
import MacroStudio from './components/MacroStudio';

type Page = 'home' | 'store' | 'admin' | 'macros';

const emptyState: WorkspaceState = {
  installedPluginIds: [], favoritePluginIds: [], recentPluginIds: [], openPluginIds: [], lastActivePluginId: null,
  appTabs: {}, disabledPluginIds: [], customPlugins: [], macros: [],
};

function AppIcon({ plugin, size = 'normal' }: { plugin: PluginManifest; size?: 'normal' | 'small' }) {
  return (
    <div className={`app-icon ${size}`} style={{ '--accent': plugin.accent ?? '#842E20' } as React.CSSProperties}>
      {plugin.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
    </div>
  );
}

function AppCard({ plugin, installed, favorite, disabled, onOpen, onInstall, onFavorite }: {
  plugin: PluginManifest; installed: boolean; favorite: boolean; disabled: boolean;
  onOpen: () => void; onInstall: () => void; onFavorite: () => void;
}) {
  return (
    <article className={`app-card ${disabled ? 'disabled' : ''}`}>
      <div className="card-head">
        <AppIcon plugin={plugin} />
        {installed && (
          <button className={`icon-button star ${favorite ? 'active' : ''}`} onClick={onFavorite} title="Favoritar">
            <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div>
        <span className="eyebrow">{plugin.category}</span>
        <h3>{plugin.name}</h3>
        <p>{plugin.description}</p>
      </div>
      <button className={installed ? 'button secondary' : 'button primary'} onClick={installed ? onOpen : onInstall} disabled={disabled}>
        {disabled ? 'Desabilitado' : installed ? 'Abrir aplicativo' : 'Adicionar ao workspace'}
        {!disabled && <ChevronRight size={16} />}
      </button>
    </article>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [catalog, setCatalog] = useState<PluginManifest[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyState);
  const [openApp, setOpenApp] = useState<OpenApp | null>(null);
  const [openPluginIds, setOpenPluginIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'Todos' | PluginCategory>('Todos');
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState('');
  const [recordingPluginId, setRecordingPluginId] = useState<string | null>(null);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [extractionArmed, setExtractionArmed] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<MacroStep[] | null>(null);
  const [macroRunning, setMacroRunning] = useState(false);

  const refresh = async () => {
    const [nextCatalog, nextWorkspace] = await Promise.all([window.salesOS.catalog(), window.salesOS.state()]);
    setCatalog(nextCatalog);
    setWorkspace(nextWorkspace);
  };

  useEffect(() => {
    void refresh();
    const removeAppListener = window.salesOS.onAppState((runtime) => {
      setOpenApp(runtime.activeApp);
      setOpenPluginIds(runtime.openPluginIds);
    });
    const removeMacroListener = window.salesOS.onMacroEvent((event) => {
      if (event.type === 'recording-started') { setRecordingPluginId(event.pluginId ?? null); setRecordingPaused(false); setExtractionArmed(false); }
      if (event.type === 'recording-paused') { setRecordingPaused(true); setExtractionArmed(false); }
      if (event.type === 'recording-resumed') setRecordingPaused(false);
      if (event.type === 'recording-extract-armed') { setRecordingPaused(false); setExtractionArmed(true); }
      if (event.type === 'recording-step' && event.step?.type === 'extract') setExtractionArmed(false);
      if (event.type === 'recording-stopped') { setRecordingPluginId(null); setRecordingPaused(false); setExtractionArmed(false); }
      if (event.type === 'run-started') setMacroRunning(true);
      if (['run-completed', 'run-failed', 'run-cancelled'].includes(event.type)) setMacroRunning(false);
    });
    return () => { removeAppListener(); removeMacroListener(); };
  }, []);

  const installed = useMemo(
    () => workspace.installedPluginIds.map((id) => catalog.find((plugin) => plugin.id === id)).filter(Boolean) as PluginManifest[],
    [catalog, workspace.installedPluginIds],
  );
  const favorites = installed.filter((plugin) => workspace.favoritePluginIds.includes(plugin.id));
  const recents = workspace.recentPluginIds.map((id) => catalog.find((plugin) => plugin.id === id)).filter(Boolean) as PluginManifest[];
  const filtered = catalog.filter((plugin) => {
    const query = search.toLowerCase();
    return (category === 'Todos' || plugin.category === category)
      && `${plugin.name} ${plugin.description} ${plugin.category}`.toLowerCase().includes(query);
  });
  const categories = ['Todos', ...new Set(catalog.map((plugin) => plugin.category))] as Array<'Todos' | PluginCategory>;

  const open = async (pluginId: string) => {
    await window.salesOS.openApp(pluginId);
    await refresh();
  };
  const install = async (pluginId: string) => setWorkspace(await window.salesOS.install(pluginId));
  const uninstall = async (pluginId: string) => setWorkspace(await window.salesOS.uninstall(pluginId));
  const favorite = async (pluginId: string) => setWorkspace(await window.salesOS.toggleFavorite(pluginId));
  const enabled = async (pluginId: string) => setWorkspace(await window.salesOS.toggleEnabled(pluginId));
  const hideApp = async () => { await window.salesOS.hideApp(); setOpenApp(null); };
  const closeApp = async (pluginId: string) => { await window.salesOS.closeApp(pluginId); };
  const startMacroRecording = async (pluginId: string) => {
    await open(pluginId);
    await window.salesOS.startMacroRecording(pluginId);
    setRecordingPluginId(pluginId);
    setRecordingPaused(false);
    setExtractionArmed(false);
  };
  const toggleMacroPause = async () => {
    if (recordingPaused) await window.salesOS.resumeMacroRecording();
    else await window.salesOS.pauseMacroRecording();
  };
  const armExtraction = async () => { await window.salesOS.armMacroExtraction(); };
  const stopMacroRecording = async () => {
    const steps = await window.salesOS.stopMacroRecording();
    setRecordingPluginId(null);
    setRecordedSteps(steps);
    await hideApp();
    setPage('macros');
  };

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-mark">S</div>
        <nav>
          <button className={page === 'home' && !openApp ? 'active' : ''} onClick={() => { void hideApp(); setPage('home'); }} title="Início"><Home /></button>
          <button className={page === 'store' && !openApp ? 'active' : ''} onClick={() => { void hideApp(); setPage('store'); }} title="Loja"><Store /></button>
          <button className={page === 'admin' && !openApp ? 'active' : ''} onClick={() => { void hideApp(); setPage('admin'); }} title="Administração"><Settings /></button>
          <button className={page === 'macros' && !openApp ? 'active' : ''} onClick={() => { void hideApp(); setPage('macros'); }} title="Macro Studio"><WandSparkles /></button>
        </nav>
        {openPluginIds.length > 0 && <div className="running-apps">
          <span>ABERTOS</span>
          {openPluginIds.map((pluginId) => {
            const plugin = catalog.find((item) => item.id === pluginId);
            if (!plugin) return null;
            return <div className={`running-app ${openApp?.pluginId === pluginId ? 'active' : ''}`} key={pluginId}>
              <button className="running-main" onClick={() => void open(pluginId)} title={`Voltar para ${plugin.name}`}><AppIcon plugin={plugin} size="small" /></button>
              <button className="running-close" onClick={() => void closeApp(pluginId)} title={`Encerrar ${plugin.name}`}><X size={10} /></button>
            </div>;
          })}
        </div>}
        <div className="sidebar-bottom"><button title="Perfil"><CircleUserRound /></button></div>
      </aside>

      <header className={`topbar ${openApp ? 'app-mode' : ''}`}>
        {openApp ? (
          <>
            <div className="app-tabs-bar">
              <div className="app-tabs-identity">{catalog.find((plugin) => plugin.id === openApp.pluginId)?.name ?? 'Aplicativo'}</div>
              <div className="app-tabs-list">
                {openApp.tabs.map((tab) => <button
                  key={tab.id}
                  className={`app-tab ${tab.id === openApp.activeTabId ? 'active' : ''}`}
                  onClick={() => window.salesOS.activateTab(openApp.pluginId, tab.id)}
                  title={tab.title}
                >
                  {tab.loading && <LoaderCircle size={12} className="spinning" />}
                  <span>{tab.title || 'Nova aba'}</span>
                  <X size={12} onClick={(event) => { event.stopPropagation(); void window.salesOS.closeTab(openApp.pluginId, tab.id); }} />
                </button>)}
                <button className="new-tab" title="Nova aba" onClick={() => window.salesOS.newTab(openApp.pluginId)}><Plus size={15} /></button>
              </div>
            </div>
            <div className="browser-row">
              <div className="browser-controls">
                <button disabled={!openApp.canGoBack} onClick={() => window.salesOS.navigate('back')}><ArrowLeft /></button>
                <button disabled={!openApp.canGoForward} onClick={() => window.salesOS.navigate('forward')}><ArrowRight /></button>
                <button onClick={() => window.salesOS.navigate('reload')} className={openApp.loading ? 'spinning' : ''}><RefreshCw /></button>
              </div>
              <div className="address-bar">
                <ShieldCheck size={15} /><span>{openApp.url}</span>
              </div>
              {recordingPluginId && <div className="recorder-toolbar"><span className={`recorder-status ${recordingPaused ? 'paused' : ''}`}><i></i>{recordingPaused ? 'Pausada' : extractionArmed ? 'Selecione um dado' : 'Gravando'}</span><button className="recorder-control" onClick={() => void toggleMacroPause()}>{recordingPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}{recordingPaused ? 'Continuar' : 'Pausar'}</button><button className={`recorder-control extract ${extractionArmed ? 'active' : ''}`} onClick={() => void armExtraction()}><Crosshair size={14} /> Capturar dado</button><button className="recording-stop" onClick={() => void stopMacroRecording()}><Square size={14} fill="currentColor" /> Finalizar</button></div>}
              {macroRunning && <button className="recording-stop" onClick={() => void window.salesOS.cancelMacro()}><Square size={14} fill="currentColor" /> Cancelar macro</button>}
              <button className="close-app" onClick={() => void hideApp()}><LayoutGrid size={18} /> Workspace</button>
            </div>
          </>
        ) : (
          <>
            <div className="brand"><strong>Sales OS</strong><span>Workspace comercial</span></div>
            <div className="top-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar aplicativos, tarefas e recursos" /></div>
            <div className="status"><span></span> Ambiente protegido</div>
          </>
        )}
      </header>

      <main className="content">
        {page === 'home' && (
          <>
            <section className="hero">
              <div><span className="eyebrow">QUINTA-FEIRA · 13 DE AGOSTO</span><h1>Boa tarde, Yago.</h1><p>Seu ambiente comercial está pronto para trabalhar.</p></div>
              <div className="hero-stat"><span>Aplicativos ativos</span><strong>{installed.length - workspace.disabledPluginIds.length}</strong><small>de {catalog.length} disponíveis</small></div>
            </section>

            {favorites.length > 0 && <section><div className="section-title"><div><h2>Favoritos</h2><p>Suas ferramentas mais importantes.</p></div></div><div className="app-grid">{favorites.map((plugin) => <AppCard key={plugin.id} plugin={plugin} installed favorite disabled={workspace.disabledPluginIds.includes(plugin.id)} onOpen={() => void open(plugin.id)} onInstall={() => {}} onFavorite={() => void favorite(plugin.id)} />)}</div></section>}

            <section>
              <div className="section-title"><div><h2>{recents.length ? 'Acessados recentemente' : 'Seu workspace'}</h2><p>{recents.length ? 'Continue de onde parou.' : 'Aplicativos instalados para sua operação.'}</p></div><button className="text-button" onClick={() => setPage('store')}>Ver loja <ChevronRight size={16} /></button></div>
              <div className="quick-grid">{(recents.length ? recents : installed).map((plugin) => <button className="quick-app" key={plugin.id} onClick={() => void open(plugin.id)}><AppIcon plugin={plugin} size="small" /><span><strong>{plugin.name}</strong><small>{plugin.category}</small></span><ChevronRight size={17} /></button>)}</div>
            </section>
          </>
        )}

        {page === 'store' && (
          <>
            <section className="page-heading"><div><span className="eyebrow">CATÁLOGO CORPORATIVO</span><h1>Loja de aplicativos</h1><p>Adicione as ferramentas aprovadas ao seu workspace.</p></div><div className="heading-icon"><Blocks /></div></section>
            <div className="filters">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="app-grid">{filtered.map((plugin) => <AppCard key={plugin.id} plugin={plugin} installed={workspace.installedPluginIds.includes(plugin.id)} favorite={workspace.favoritePluginIds.includes(plugin.id)} disabled={workspace.disabledPluginIds.includes(plugin.id)} onOpen={() => void open(plugin.id)} onInstall={() => void install(plugin.id)} onFavorite={() => void favorite(plugin.id)} />)}</div>
          </>
        )}

        {page === 'macros' && <MacroStudio catalog={catalog} installedPluginIds={workspace.installedPluginIds} recordedSteps={recordedSteps} onConsumeRecording={() => setRecordedSteps(null)} onStartRecording={startMacroRecording} onRunState={setMacroRunning} notify={toast} />}

        {page === 'admin' && (
          <>
            <section className="page-heading"><div><span className="eyebrow">ADMINISTRAÇÃO LOCAL</span><h1>Aplicativos e políticas</h1><p>Gerencie o catálogo disponível neste dispositivo.</p></div><button className="button primary" onClick={() => setShowAdd(true)}><Plus size={17} /> Adicionar aplicativo</button></section>
            <div className="admin-actions"><button onClick={async () => { const file = await window.salesOS.exportConfig(); if (file) toast('Configuração exportada.'); }}><Download /> Exportar configuração</button><button onClick={async () => { const state = await window.salesOS.importConfig(); if (state) { setWorkspace(state); await refresh(); toast('Configuração importada.'); } }}><Upload /> Importar configuração</button></div>
            <div className="admin-table">
              <div className="table-row table-head"><span>Aplicativo</span><span>Categoria</span><span>Permissões</span><span>Status</span><span></span></div>
              {catalog.map((plugin) => {
                const isInstalled = workspace.installedPluginIds.includes(plugin.id);
                const isDisabled = workspace.disabledPluginIds.includes(plugin.id);
                return <div className="table-row" key={plugin.id}><span className="app-name"><AppIcon plugin={plugin} size="small" /><span><strong>{plugin.name}</strong><small>{plugin.startUrl}</small></span></span><span>{plugin.category}</span><span>{plugin.permissions.length} permissões</span><span><button className={`status-pill ${isInstalled && !isDisabled ? 'enabled' : ''}`} onClick={() => isInstalled ? void enabled(plugin.id) : void install(plugin.id)}>{isInstalled ? (isDisabled ? 'Desabilitado' : 'Ativo') : 'Não instalado'}</button></span><span>{isInstalled && <button className="link-danger" onClick={() => void uninstall(plugin.id)}>Remover</button>}</span></div>;
              })}
            </div>
          </>
        )}
      </main>

      {showAdd && <AddAppModal onClose={() => setShowAdd(false)} onSave={async (plugin) => { await window.salesOS.addCustomPlugin(plugin); await refresh(); setShowAdd(false); toast('Aplicativo adicionado ao catálogo.'); }} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function AddAppModal({ onClose, onSave }: { onClose: () => void; onSave: (plugin: PluginManifest) => Promise<void> }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try { await onSave({ id: name, name, startUrl: url, description, category: 'Interno', permissions: ['navigation'], enabled: true, accent: '#842E20' }); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => void submit(event)}><div className="modal-head"><div><span className="eyebrow">NOVO PLUGIN WEB</span><h2>Adicionar aplicativo</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: CRM interno" /></label><label>URL inicial<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://app.empresa.com" /></label><label>Descrição<textarea required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Como este aplicativo ajuda a operação?" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spinning" /> : <Plus />} Adicionar</button></div></form></div>;
}
