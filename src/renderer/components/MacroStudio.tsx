import { useEffect, useMemo, useState } from 'react';
import { Circle, GripVertical, Play, Plus, Save, Timer, Trash2, WandSparkles, X } from 'lucide-react';
import type { MacroDefinition, MacroStep, PluginManifest } from '../../shared/types';

type Props = {
  catalog: PluginManifest[];
  installedPluginIds: string[];
  recordedSteps: MacroStep[] | null;
  onConsumeRecording: () => void;
  onStartRecording: (pluginId: string) => Promise<void>;
  onRunState: (running: boolean) => void;
  notify: (message: string) => void;
};

const newId = () => crypto.randomUUID();

export default function MacroStudio({ catalog, installedPluginIds, recordedSteps, onConsumeRecording, onStartRecording, onRunState, notify }: Props) {
  const [macros, setMacros] = useState<MacroDefinition[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState('');
  const [editing, setEditing] = useState<MacroDefinition | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const installed = useMemo(() => catalog.filter((plugin) => installedPluginIds.includes(plugin.id)), [catalog, installedPluginIds]);
  const refresh = async () => setMacros(await window.salesOS.listMacros());

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!recordedSteps) return;
    const now = new Date().toISOString();
    setEditing({ id: newId(), name: 'Nova macro', description: '', pluginId: selectedPluginId, createdAt: now, updatedAt: now, steps: recordedSteps });
    onConsumeRecording();
  }, [recordedSteps, selectedPluginId, onConsumeRecording]);

  const start = async () => {
    const pluginId = selectedPluginId || installed[0]?.id;
    if (!pluginId) return notify('Instale um aplicativo antes de gravar.');
    setSelectedPluginId(pluginId);
    await onStartRecording(pluginId);
  };

  const run = async (macro: MacroDefinition) => {
    setRunningId(macro.id); onRunState(true);
    try { await window.salesOS.runMacro(macro.id); notify(`Macro “${macro.name}” concluída.`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Falha ao executar macro.'); }
    finally { setRunningId(null); onRunState(false); }
  };

  const save = async (macro: MacroDefinition) => {
    setMacros(await window.salesOS.saveMacro(macro)); setEditing(null); notify('Macro salva.');
  };

  const remove = async (macroId: string) => {
    setMacros(await window.salesOS.deleteMacro(macroId)); notify('Macro removida.');
  };

  const createManual = () => {
    const now = new Date().toISOString();
    setEditing({ id: newId(), name: 'Nova macro', description: '', pluginId: selectedPluginId || installed[0]?.id || '', createdAt: now, updatedAt: now, steps: [] });
  };

  return <>
    <section className="page-heading macro-heading">
      <div><span className="eyebrow">AUTOMAÇÃO OPERACIONAL</span><h1>Macro Studio</h1><p>Grave interações, ajuste as etapas e reproduza tarefas repetitivas.</p></div>
      <div className="heading-icon"><WandSparkles /></div>
    </section>

    <div className="macro-recorder-card">
      <div><strong>Gravar uma nova automação</strong><p>Abra um aplicativo e registre cliques e preenchimentos. Senhas e tokens não são capturados.</p></div>
      <select value={selectedPluginId} onChange={(event) => setSelectedPluginId(event.target.value)}>
        <option value="">Selecione o aplicativo</option>
        {installed.map((plugin) => <option key={plugin.id} value={plugin.id}>{plugin.name}</option>)}
      </select>
      <button className="button record-button" onClick={() => void start()}><Circle size={16} fill="currentColor" /> Gravar macro</button>
      <button className="button secondary" onClick={createManual}><Plus size={16} /> Criar manualmente</button>
    </div>

    <div className="section-title macro-list-title"><div><h2>Minhas macros</h2><p>{macros.length} automações salvas neste dispositivo.</p></div></div>
    {macros.length === 0 ? <div className="macro-empty"><WandSparkles /><h3>Nenhuma macro criada</h3><p>Grave sua primeira rotina em um dos aplicativos instalados.</p></div> : <div className="macro-grid">
      {macros.map((macro) => {
        const plugin = catalog.find((item) => item.id === macro.pluginId);
        return <article className="macro-card" key={macro.id}>
          <div className="macro-card-top"><div className="macro-symbol"><WandSparkles /></div><span className="status-pill enabled">{plugin?.name ?? 'Aplicativo'}</span></div>
          <div><h3>{macro.name}</h3><p>{macro.description || 'Sem descrição.'}</p></div>
          <div className="macro-meta"><span><Timer /> {macro.steps.length} etapas</span><span>Atualizada {new Date(macro.updatedAt).toLocaleDateString('pt-BR')}</span></div>
          <div className="macro-actions"><button className="button primary" disabled={runningId !== null} onClick={() => void run(macro)}><Play size={15} fill="currentColor" /> {runningId === macro.id ? 'Executando...' : 'Executar'}</button><button className="button secondary" onClick={() => setEditing(macro)}>Editar</button><button className="icon-button danger" onClick={() => void remove(macro.id)}><Trash2 size={16} /></button></div>
        </article>;
      })}
    </div>}
    {editing && <MacroEditor macro={editing} plugins={installed} onClose={() => setEditing(null)} onSave={save} />}
  </>;
}

function MacroEditor({ macro, plugins, onClose, onSave }: { macro: MacroDefinition; plugins: PluginManifest[]; onClose: () => void; onSave: (macro: MacroDefinition) => Promise<void> }) {
  const [draft, setDraft] = useState(structuredClone(macro));
  const updateStep = (id: string, patch: Partial<MacroStep>) => setDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === id ? { ...step, ...patch } : step) }));
  const removeStep = (id: string) => setDraft((current) => ({ ...current, steps: current.steps.filter((step) => step.id !== id) }));
  const addWait = () => setDraft((current) => ({ ...current, steps: [...current.steps, { id: newId(), type: 'wait', label: 'Aguardar 1 segundo', durationMs: 1000 }] }));

  return <div className="modal-backdrop"><div className="macro-editor">
    <div className="modal-head"><div><span className="eyebrow">EDITOR DE AUTOMAÇÃO</span><h2>{draft.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="macro-form-row"><label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Aplicativo<select value={draft.pluginId} onChange={(event) => setDraft({ ...draft, pluginId: event.target.value })}>{plugins.map((plugin) => <option key={plugin.id} value={plugin.id}>{plugin.name}</option>)}</select></label></div>
    <label className="macro-description">Descrição<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="O que esta macro realiza?" /></label>
    <div className="steps-header"><div><strong>Etapas</strong><span>{draft.steps.length} ações</span></div><button className="button secondary" onClick={addWait}><Plus size={15} /> Adicionar espera</button></div>
    <div className="steps-list">{draft.steps.length === 0 && <div className="steps-empty">Grave interações ou adicione uma espera para começar.</div>}{draft.steps.map((step, index) => <div className="step-row" key={step.id}>
      <GripVertical className="drag-handle" size={17} /><span className="step-index">{index + 1}</span><span className={`step-type ${step.type}`}>{step.type}</span>
      <div className="step-fields"><input value={step.label} onChange={(event) => updateStep(step.id, { label: event.target.value })} />
        {step.type === 'wait' ? <input type="number" min="0" max="30000" value={step.durationMs ?? 1000} onChange={(event) => updateStep(step.id, { durationMs: Number(event.target.value) })} /> : step.type === 'navigate' ? <input value={step.url ?? ''} onChange={(event) => updateStep(step.id, { url: event.target.value })} /> : <input value={step.selector ?? ''} onChange={(event) => updateStep(step.id, { selector: event.target.value })} />}
      </div><button className="icon-button danger" onClick={() => removeStep(step.id)}><Trash2 size={15} /></button>
    </div>)}</div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!draft.pluginId || !draft.name.trim()} onClick={() => void onSave(draft)}><Save size={16} /> Salvar macro</button></div>
  </div></div>;
}
