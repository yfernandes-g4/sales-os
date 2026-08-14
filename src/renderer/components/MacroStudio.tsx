import { useEffect, useMemo, useState } from 'react';
import { Circle, Database, GripVertical, Play, Plus, Save, Timer, Trash2, WandSparkles, X } from 'lucide-react';
import type { MacroDefinition, MacroInputValues, MacroRunResult, MacroStep, PluginManifest } from '../../shared/types';

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
const contractDefaults = () => ({
  executionType: 'actions' as const,
  inputs: [],
  output: { type: 'summary' as const, title: 'Resultado da macro' },
  successCriteria: { requireAllSteps: true, requireOutput: false, minimumProcessed: 0, maximumFailures: 0 },
});

export default function MacroStudio({ catalog, installedPluginIds, recordedSteps, onConsumeRecording, onStartRecording, onRunState, notify }: Props) {
  const [macros, setMacros] = useState<MacroDefinition[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState('');
  const [editing, setEditing] = useState<MacroDefinition | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<MacroDefinition | null>(null);
  const [runResult, setRunResult] = useState<MacroRunResult | null>(null);

  const installed = useMemo(() => catalog.filter((plugin) => installedPluginIds.includes(plugin.id)), [catalog, installedPluginIds]);
  const refresh = async () => setMacros(await window.salesOS.listMacros());

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!recordedSteps) return;
    const now = new Date().toISOString();
    setEditing({ id: newId(), name: 'Nova macro', description: '', pluginId: selectedPluginId, ...contractDefaults(), createdAt: now, updatedAt: now, steps: recordedSteps });
    onConsumeRecording();
  }, [recordedSteps, selectedPluginId, onConsumeRecording]);

  const start = async () => {
    const pluginId = selectedPluginId || installed[0]?.id;
    if (!pluginId) return notify('Instale um aplicativo antes de gravar.');
    setSelectedPluginId(pluginId);
    await onStartRecording(pluginId);
  };

  const run = async (macro: MacroDefinition, values: MacroInputValues) => {
    setPendingRun(null); setRunningId(macro.id); onRunState(true);
    try { const result = await window.salesOS.runMacro(macro.id, values); setRunResult(result); notify(result.message); }
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
    setEditing({ id: newId(), name: 'Nova macro', description: '', pluginId: selectedPluginId || installed[0]?.id || '', ...contractDefaults(), createdAt: now, updatedAt: now, steps: [] });
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
          <div className="macro-meta"><span><Timer /> {macro.steps.length} etapas</span><span><Database /> {macro.output?.type ?? 'summary'}</span><span>Atualizada {new Date(macro.updatedAt).toLocaleDateString('pt-BR')}</span></div>
          <div className="macro-actions"><button className="button primary" disabled={runningId !== null} onClick={() => setPendingRun(macro)}><Play size={15} fill="currentColor" /> {runningId === macro.id ? 'Executando...' : 'Executar'}</button><button className="button secondary" onClick={() => setEditing(macro)}>Editar</button><button className="icon-button danger" onClick={() => void remove(macro.id)}><Trash2 size={16} /></button></div>
        </article>;
      })}
    </div>}
    {editing && <MacroEditor macro={editing} plugins={installed} onClose={() => setEditing(null)} onSave={save} />}
    {pendingRun && <RunMacroModal macro={pendingRun} onClose={() => setPendingRun(null)} onRun={(values) => run(pendingRun, values)} />}
    {runResult && <MacroResultModal result={runResult} macro={macros.find((item) => item.id === runResult.macroId)} onClose={() => setRunResult(null)} />}
  </>;
}

function MacroEditor({ macro, plugins, onClose, onSave }: { macro: MacroDefinition; plugins: PluginManifest[]; onClose: () => void; onSave: (macro: MacroDefinition) => Promise<void> }) {
  const [draft, setDraft] = useState(structuredClone(macro));
  const updateStep = (id: string, patch: Partial<MacroStep>) => setDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === id ? { ...step, ...patch } : step) }));
  const removeStep = (id: string) => setDraft((current) => ({ ...current, steps: current.steps.filter((step) => step.id !== id) }));
  const addWait = () => setDraft((current) => ({ ...current, steps: [...current.steps, { id: newId(), type: 'wait', label: 'Aguardar 1 segundo', durationMs: 1000 }] }));
  const addExtract = () => setDraft((current) => ({ ...current, steps: [...current.steps, { id: newId(), type: 'extract', label: 'Extrair dado', selector: '', outputKey: `dado_${current.steps.length + 1}`, attribute: 'text', multiple: false }] }));
  const addInput = () => setDraft((current) => ({ ...current, inputs: [...current.inputs, { id: newId(), key: `parametro_${current.inputs.length + 1}`, label: 'Novo parâmetro', type: 'text', required: false, defaultValue: '' }] }));
  const updateInput = (id: string, patch: Partial<MacroDefinition['inputs'][number]>) => setDraft((current) => ({ ...current, inputs: current.inputs.map((input) => input.id === id ? { ...input, ...patch } : input) }));

  return <div className="modal-backdrop"><div className="macro-editor">
    <div className="modal-head"><div><span className="eyebrow">EDITOR DE AUTOMAÇÃO</span><h2>{draft.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="macro-form-row"><label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Aplicativo<select value={draft.pluginId} onChange={(event) => setDraft({ ...draft, pluginId: event.target.value })}>{plugins.map((plugin) => <option key={plugin.id} value={plugin.id}>{plugin.name}</option>)}</select></label></div>
    <label className="macro-description">Descrição<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="O que esta macro realiza?" /></label>
    <div className="contract-grid">
      <section className="contract-panel"><div className="contract-title"><strong>Tipo de execução</strong><span>O que esta macro pretende fazer</span></div><select value={draft.executionType} onChange={(event) => setDraft({ ...draft, executionType: event.target.value as MacroDefinition['executionType'] })}><option value="actions">Executar ações</option><option value="collect">Coletar dados</option><option value="hybrid">Coletar e executar</option></select></section>
      <section className="contract-panel"><div className="contract-title"><strong>Saída esperada</strong><span>Como apresentar o resultado</span></div><select value={draft.output.type} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, type: event.target.value as MacroDefinition['output']['type'] } })}><option value="none">Nenhuma saída</option><option value="summary">Resumo</option><option value="json">JSON estruturado</option><option value="table">Tabela</option><option value="tabs">Abas abertas</option></select><input value={draft.output.title} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, title: event.target.value } })} placeholder="Título do resultado" /></section>
    </div>
    <section className="contract-section"><div className="steps-header"><div><strong>Entradas</strong><span>Use variáveis como {'{{input.status}}'} nas etapas</span></div><button className="button secondary" onClick={addInput}><Plus size={15} /> Adicionar entrada</button></div>{draft.inputs.length === 0 ? <div className="contract-empty">Esta macro não solicita parâmetros.</div> : <div className="inputs-list">{draft.inputs.map((input) => <div className="input-contract-row" key={input.id}><input value={input.label} onChange={(event) => updateInput(input.id, { label: event.target.value })} placeholder="Rótulo" /><input value={input.key} onChange={(event) => updateInput(input.id, { key: event.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} placeholder="chave" /><select value={input.type} onChange={(event) => updateInput(input.id, { type: event.target.value as typeof input.type })}><option value="text">Texto</option><option value="number">Número</option><option value="boolean">Sim/Não</option></select><label className="inline-check"><input type="checkbox" checked={input.required} onChange={(event) => updateInput(input.id, { required: event.target.checked })} /> Obrigatório</label><button className="icon-button danger" onClick={() => setDraft((current) => ({ ...current, inputs: current.inputs.filter((item) => item.id !== input.id) }))}><Trash2 size={15} /></button></div>)}</div>}</section>
    <section className="criteria-panel"><strong>Critérios de sucesso</strong><label className="inline-check"><input type="checkbox" checked={draft.successCriteria.requireAllSteps} onChange={(event) => setDraft({ ...draft, successCriteria: { ...draft.successCriteria, requireAllSteps: event.target.checked } })} /> Todas as etapas devem funcionar</label><label className="inline-check"><input type="checkbox" checked={draft.successCriteria.requireOutput} onChange={(event) => setDraft({ ...draft, successCriteria: { ...draft.successCriteria, requireOutput: event.target.checked } })} /> Exigir pelo menos uma saída</label><label>Mínimo processado<input type="number" min="0" value={draft.successCriteria.minimumProcessed} onChange={(event) => setDraft({ ...draft, successCriteria: { ...draft.successCriteria, minimumProcessed: Number(event.target.value) } })} /></label><label>Máximo de falhas<input type="number" min="0" value={draft.successCriteria.maximumFailures} onChange={(event) => setDraft({ ...draft, successCriteria: { ...draft.successCriteria, maximumFailures: Number(event.target.value) } })} /></label></section>
    <div className="steps-header"><div><strong>Etapas</strong><span>{draft.steps.length} ações</span></div><div className="step-add-actions"><button className="button secondary" onClick={addExtract}><Database size={15} /> Extrair dado</button><button className="button secondary" onClick={addWait}><Plus size={15} /> Adicionar espera</button></div></div>
    <div className="steps-list">{draft.steps.length === 0 && <div className="steps-empty">Grave interações ou adicione uma espera para começar.</div>}{draft.steps.map((step, index) => <div className="step-row" key={step.id}>
      <GripVertical className="drag-handle" size={17} /><span className="step-index">{index + 1}</span><span className={`step-type ${step.type}`}>{step.type}</span>
      <div className="step-fields"><input value={step.label} onChange={(event) => updateStep(step.id, { label: event.target.value })} />
        {step.type === 'wait' ? <input type="number" min="0" max="30000" value={step.durationMs ?? 1000} onChange={(event) => updateStep(step.id, { durationMs: Number(event.target.value) })} /> : step.type === 'navigate' ? <input value={step.url ?? ''} onChange={(event) => updateStep(step.id, { url: event.target.value })} /> : <input value={step.selector ?? ''} onChange={(event) => updateStep(step.id, { selector: event.target.value })} />}
        {step.type === 'extract' && <><input value={step.outputKey ?? ''} onChange={(event) => updateStep(step.id, { outputKey: event.target.value })} placeholder="Chave da saída" /><select value={step.attribute ?? 'text'} onChange={(event) => updateStep(step.id, { attribute: event.target.value })}><option value="text">Texto</option><option value="value">Valor</option><option value="href">Link</option></select><label className="inline-check"><input type="checkbox" checked={Boolean(step.multiple)} onChange={(event) => updateStep(step.id, { multiple: event.target.checked })} /> Lista</label></>}
      </div><button className="icon-button danger" onClick={() => removeStep(step.id)}><Trash2 size={15} /></button>
    </div>)}</div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!draft.pluginId || !draft.name.trim()} onClick={() => void onSave(draft)}><Save size={16} /> Salvar macro</button></div>
  </div></div>;
}


function RunMacroModal({ macro, onClose, onRun }: { macro: MacroDefinition; onClose: () => void; onRun: (values: MacroInputValues) => Promise<void> }) {
  const [values, setValues] = useState<MacroInputValues>(Object.fromEntries(macro.inputs.map((input) => [input.key, input.defaultValue ?? (input.type === 'boolean' ? false : '')])));
  const [running, setRunning] = useState(false);
  const valid = macro.inputs.every((input) => !input.required || values[input.key] !== '' && values[input.key] !== undefined);
  const execute = async () => { setRunning(true); try { await onRun(values); } finally { setRunning(false); } };
  return <div className="modal-backdrop"><div className="run-modal"><div className="modal-head"><div><span className="eyebrow">EXECUTAR MACRO</span><h2>{macro.name}</h2><p>{macro.description}</p></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="execution-contract-summary"><span>{macro.executionType === 'actions' ? 'Executar ações' : macro.executionType === 'collect' ? 'Coletar dados' : 'Coletar e executar'}</span><span>Saída: {macro.output.type}</span><span>{macro.steps.length} etapas</span></div>{macro.inputs.length === 0 ? <div className="contract-empty">Nenhuma entrada necessária. A macro está pronta para executar.</div> : <div className="run-inputs">{macro.inputs.map((input) => <label key={input.id}>{input.label}{input.required && <b>*</b>}{input.type === 'boolean' ? <select value={String(values[input.key])} onChange={(event) => setValues({ ...values, [input.key]: event.target.value === 'true' })}><option value="false">Não</option><option value="true">Sim</option></select> : <input type={input.type === 'number' ? 'number' : 'text'} value={String(values[input.key] ?? '')} onChange={(event) => setValues({ ...values, [input.key]: input.type === 'number' ? Number(event.target.value) : event.target.value })} />}</label>)}</div>}<div className="run-safety"><strong>Critérios</strong><span>{macro.successCriteria.requireAllSteps ? 'Todas as etapas obrigatórias' : `Até ${macro.successCriteria.maximumFailures} falhas`}</span><span>Mínimo processado: {macro.successCriteria.minimumProcessed}</span>{macro.successCriteria.requireOutput && <span>Saída obrigatória</span>}</div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={!valid || running} onClick={() => void execute()}><Play size={16} fill="currentColor" /> {running ? 'Executando...' : 'Executar agora'}</button></div></div></div>;
}

function MacroResultModal({ result, macro, onClose }: { result: MacroRunResult; macro?: MacroDefinition; onClose: () => void }) {
  const outputEntries = Object.entries(result.outputs);
  return <div className="modal-backdrop"><div className="result-modal"><div className="modal-head"><div><span className="eyebrow">RESULTADO DA EXECUÇÃO</span><h2>{macro?.output.title || macro?.name || 'Resultado da macro'}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className={`result-status ${result.status}`}><strong>{result.status === 'success' ? 'Execução concluída' : result.status === 'partial' ? 'Concluída parcialmente' : result.status === 'cancelled' ? 'Execução cancelada' : 'Execução com falha'}</strong><p>{result.message}</p></div><div className="result-metrics"><div><strong>{result.processed}</strong><span>Processadas</span></div><div><strong>{result.failed}</strong><span>Falhas</span></div><div><strong>{outputEntries.length}</strong><span>Saídas</span></div></div>{outputEntries.length > 0 ? <div className="result-output"><div className="steps-header"><div><strong>Dados retornados</strong><span>Disponíveis para uso em outras macros</span></div></div>{macro?.output.type === 'table' && outputEntries.some(([, value]) => Array.isArray(value)) ? <div className="result-table">{outputEntries.map(([key, value]) => <div key={key}><strong>{key}</strong><span>{Array.isArray(value) ? value.join(', ') : String(value)}</span></div>)}</div> : <pre>{JSON.stringify(result.outputs, null, 2)}</pre>}</div> : <div className="contract-empty">Esta execução não produziu dados estruturados.</div>}<div className="modal-actions"><button className="button primary" onClick={onClose}>Concluir</button></div></div></div>;
}
