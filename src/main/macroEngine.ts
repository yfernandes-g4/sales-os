import { randomUUID } from 'node:crypto';
import type { BrowserWindow, WebContents } from 'electron';
import type { MacroDefinition, MacroInputValues, MacroRunResult, MacroRuntimeEvent, MacroStep } from '../shared/types';
import { AppViewManager } from './appViewManager';

const RECORDING_PREFIX = '__SALES_OS_MACRO__';

type DebuggerConsoleParams = { args?: Array<{ value?: unknown }> };

export class MacroEngine {
  private recordingPluginId: string | null = null;
  private recordedSteps: MacroStep[] = [];
  private recordingContents: WebContents | null = null;
  private recordingPaused = false;
  private extractionArmed = false;
  private cancelled = false;

  constructor(private readonly window: BrowserWindow, private readonly views: AppViewManager) {}

  async startRecording(pluginId: string): Promise<void> {
    if (this.recordingPluginId) await this.stopRecording();
    const contents = this.views.getActiveWebContents();
    if (!contents || this.views.getActivePluginId() !== pluginId) throw new Error('Abra o aplicativo antes de iniciar a gravação.');
    this.recordingPluginId = pluginId;
    this.recordingPaused = false;
    this.extractionArmed = false;
    this.recordedSteps = [];
    this.recordingContents = contents;
    const url = contents.getURL();
    if (/^https?:/i.test(url)) this.recordedSteps.push(this.step({ type: 'navigate', label: `Abrir ${new URL(url).hostname}`, url }));
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
    contents.debugger.on('message', this.handleDebuggerMessage);
    await contents.debugger.sendCommand('Runtime.enable');
    await contents.executeJavaScript(this.recorderScript(), true);
    this.emit({ type: 'recording-started', pluginId });
  }

  async pauseRecording(): Promise<void> {
    if (!this.recordingContents || !this.recordingPluginId) throw new Error('Nenhuma gravação ativa.');
    this.recordingPaused = true;
    this.extractionArmed = false;
    await this.recordingContents.executeJavaScript('window.__salesOSMacroRecorder?.pause?.()', true);
    this.emit({ type: 'recording-paused', pluginId: this.recordingPluginId });
  }

  async resumeRecording(): Promise<void> {
    if (!this.recordingContents || !this.recordingPluginId) throw new Error('Nenhuma gravação ativa.');
    this.recordingPaused = false;
    await this.recordingContents.executeJavaScript('window.__salesOSMacroRecorder?.resume?.()', true);
    this.emit({ type: 'recording-resumed', pluginId: this.recordingPluginId });
  }

  async armExtraction(): Promise<void> {
    if (!this.recordingContents || !this.recordingPluginId) throw new Error('Nenhuma gravação ativa.');
    if (this.recordingPaused) await this.resumeRecording();
    this.extractionArmed = true;
    await this.recordingContents.executeJavaScript('window.__salesOSMacroRecorder?.armExtract?.()', true);
    this.emit({ type: 'recording-extract-armed', pluginId: this.recordingPluginId, message: 'Clique no dado que deseja capturar.' });
  }

  async stopRecording(): Promise<MacroStep[]> {
    if (this.recordingContents && !this.recordingContents.isDestroyed()) {
      this.recordingContents.debugger.removeListener('message', this.handleDebuggerMessage);
      await this.recordingContents.executeJavaScript('window.__salesOSMacroRecorder?.stop?.()', true).catch(() => undefined);
      if (this.recordingContents.debugger.isAttached()) this.recordingContents.debugger.detach();
    }
    const steps = [...this.recordedSteps];
    const pluginId = this.recordingPluginId ?? undefined;
    this.recordingPluginId = null;
    this.recordingContents = null;
    this.recordingPaused = false;
    this.extractionArmed = false;
    this.recordedSteps = [];
    this.emit({ type: 'recording-stopped', pluginId, message: `${steps.length} etapas gravadas` });
    return steps;
  }

  async run(macro: MacroDefinition, inputs: MacroInputValues = {}): Promise<MacroRunResult> {
    const contents = this.views.getActiveWebContents();
    if (!contents || this.views.getActivePluginId() !== macro.pluginId) throw new Error('Não foi possível ativar o aplicativo da macro.');
    const startedAt = new Date().toISOString();
    const outputs: Record<string, unknown> = {};
    let processed = 0;
    let failed = 0;
    this.cancelled = false;
    this.emit({ type: 'run-started', macroId: macro.id, pluginId: macro.pluginId });

    for (let index = 0; index < macro.steps.length; index += 1) {
      if (this.cancelled) {
        const result = this.result(macro.id, 'cancelled', startedAt, processed, failed, outputs, 'Execução cancelada.');
        this.emit({ type: 'run-cancelled', macroId: macro.id, stepIndex: index, result });
        return result;
      }
      const rawStep = macro.steps[index];
      const step = this.interpolateStep(rawStep, inputs, outputs);
      this.emit({ type: 'run-step', macroId: macro.id, step, stepIndex: index });
      try {
        const extracted = await this.executeStep(contents, step);
        if (extracted && step.outputKey) outputs[step.outputKey] = extracted;
        processed += 1;
      } catch (error) {
        failed += 1;
        if (macro.successCriteria?.requireAllSteps ?? true) {
          const message = error instanceof Error ? error.message : 'Falha desconhecida';
          const result = this.result(macro.id, 'failed', startedAt, processed, failed, outputs, message);
          this.emit({ type: 'run-failed', macroId: macro.id, message, result });
          throw error;
        }
      }
    }

    if (macro.output?.type === 'tabs') outputs.tabs = this.views.getTabsSnapshot()[macro.pluginId]?.tabs ?? [];
    const criteria = macro.successCriteria ?? { requireAllSteps: true, requireOutput: false, minimumProcessed: 0, maximumFailures: 0 };
    const outputCount = Object.keys(outputs).length;
    const success = processed >= criteria.minimumProcessed && failed <= criteria.maximumFailures && (!criteria.requireOutput || outputCount > 0);
    const status: MacroRunResult['status'] = success ? (failed ? 'partial' : 'success') : 'failed';
    const message = success ? `Macro concluída: ${processed} etapas processadas.` : 'A execução não atingiu os critérios de sucesso.';
    const result = this.result(macro.id, status, startedAt, processed, failed, outputs, message);
    this.emit({ type: status === 'failed' ? 'run-failed' : 'run-completed', macroId: macro.id, message, result });
    return result;
  }

  cancel(): void { this.cancelled = true; }

  private readonly handleDebuggerMessage = (_event: Electron.Event, method: string, params: DebuggerConsoleParams): void => {
    if (method !== 'Runtime.consoleAPICalled') return;
    const message = params.args?.map((arg) => typeof arg.value === 'string' ? arg.value : '').join(' ') ?? '';
    if (!message.startsWith(RECORDING_PREFIX)) return;
    try {
      const data = JSON.parse(message.slice(RECORDING_PREFIX.length)) as Omit<MacroStep, 'id'>;
      const step = this.step(data);
      if (step.type === 'extract') this.extractionArmed = false;
      const previous = this.recordedSteps.at(-1);
      if (step.type === 'input' && previous?.type === 'input' && previous.selector === step.selector) this.recordedSteps[this.recordedSteps.length - 1] = step;
      else this.recordedSteps.push(step);
      this.emit({ type: 'recording-step', pluginId: this.recordingPluginId ?? undefined, step });
    } catch { /* Ignore page console noise. */ }
  };

  private async executeStep(contents: WebContents, step: MacroStep): Promise<unknown> {
    if (step.type === 'wait') {
      await this.delay(Math.max(0, Math.min(step.durationMs ?? 500, 30_000)));
      return undefined;
    }
    if (step.type === 'navigate' && step.url) {
      await contents.loadURL(step.url);
      await this.delay(700);
      return undefined;
    }
    if (!step.selector) throw new Error(`A etapa “${step.label}” não possui seletor.`);
    if (step.type === 'extract') {
      const extracted = await contents.executeJavaScript(`(() => {
        const elements = [...document.querySelectorAll(${JSON.stringify(step.selector)})];
        if (!elements.length) return { ok:false, reason:'Nenhum elemento encontrado: ${step.selector.replace(/'/g, "\\'")}' };
        const read = (element) => {
          const attribute = ${JSON.stringify(step.attribute ?? 'text')};
          if (attribute === 'text') return (element.textContent || '').trim();
          if (attribute === 'value') return element.value ?? '';
          if (attribute === 'href') return element.href ?? element.getAttribute('href');
          return element.getAttribute(attribute);
        };
        const values = elements.map(read);
        return { ok:true, value:${Boolean(step.multiple)} ? values : values[0] };
      })()`, true) as { ok: boolean; value?: unknown; reason?: string };
      if (!extracted.ok) throw new Error(extracted.reason ?? `Falha em ${step.label}`);
      return extracted.value;
    }
    const result = await contents.executeJavaScript(`(() => {
      const element = document.querySelector(${JSON.stringify(step.selector)});
      if (!element) return { ok: false, reason: 'Elemento não encontrado: ${step.selector.replace(/'/g, "\\'")}' };
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (${JSON.stringify(step.type)} === 'click') {
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        element.click();
      } else {
        const value = ${JSON.stringify(step.value ?? '')};
        const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter ? setter.call(element, value) : (element.value = value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { ok: true };
    })()`, true) as { ok: boolean; reason?: string };
    if (!result.ok) throw new Error(result.reason ?? `Falha em ${step.label}`);
    await this.delay(step.type === 'click' ? 650 : 150);
    return undefined;
  }

  private recorderScript(): string {
    return `(() => {
      window.__salesOSMacroRecorder?.stop?.();
      const PREFIX = ${JSON.stringify(RECORDING_PREFIX)};
      let paused = false; let extractMode = false; let highlighted = null;
      const sensitive = (el) => el.type === 'password' || /password|passwd|token|secret|otp|one.?time/i.test([el.name, el.id, el.autocomplete, el.getAttribute('aria-label')].filter(Boolean).join(' '));
      const esc = (value) => CSS.escape(String(value));
      const selector = (el) => {
        if (el.id) return '#' + esc(el.id);
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
        if (testId) return '[' + (el.hasAttribute('data-testid') ? 'data-testid' : el.hasAttribute('data-test') ? 'data-test' : 'data-qa') + '=\"' + CSS.escape(testId) + '\"]';
        if (el.name) return el.tagName.toLowerCase() + '[name=\"' + CSS.escape(el.name) + '\"]';
        const parts = []; let node = el;
        while (node && node.nodeType === 1 && node !== document.body && parts.length < 5) {
          let part = node.tagName.toLowerCase();
          const parent = node.parentElement;
          if (parent) {
            const same = [...parent.children].filter(child => child.tagName === node.tagName);
            if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
          }
          parts.unshift(part); node = parent;
        }
        return parts.join(' > ');
      };
      const label = (el) => (el.getAttribute('aria-label') || el.title || el.innerText || el.placeholder || el.name || el.tagName).trim().replace(/\\s+/g,' ').slice(0,80);
      const key = (value) => value.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40) || 'dado';
      const send = (payload) => console.info(PREFIX + JSON.stringify(payload));
      const style = document.createElement('style'); style.id='sales-os-recorder-style'; style.textContent='html.sales-os-extract-mode *{cursor:crosshair!important} [data-sales-os-extract-target]{outline:3px solid #B9915B!important;outline-offset:2px!important;background-color:#B9915B18!important}'; document.documentElement.appendChild(style);
      const clearHighlight = () => { highlighted?.removeAttribute?.('data-sales-os-extract-target'); highlighted=null; };
      const disarm = () => { extractMode=false; clearHighlight(); document.documentElement.classList.remove('sales-os-extract-mode'); };
      const onMove = (event) => { if (!extractMode || paused) return; clearHighlight(); highlighted=event.target; highlighted?.setAttribute?.('data-sales-os-extract-target',''); };
      const onClick = (event) => {
        if (paused) return;
        if (extractMode) {
          event.preventDefault(); event.stopImmediatePropagation();
          const el=event.target; const name=label(el); const attribute=el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? 'value' : el.closest?.('a') ? 'href' : 'text';
          send({ type:'extract', label:'Extrair ' + name, selector:selector(el), outputKey:key(name), attribute, multiple:false }); disarm(); return;
        }
        const el = event.target?.closest?.('button,a,[role=button],input[type=button],input[type=submit]');
        if (!el) return;
        send({ type:'click', label:'Clicar em ' + label(el), selector:selector(el) });
      };
      const onChange = (event) => {
        if (paused || extractMode) return;
        const el = event.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || sensitive(el)) return;
        send({ type:'input', label:'Preencher ' + label(el), selector:selector(el), value:el.value });
      };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('change', onChange, true);
      window.__salesOSMacroRecorder = {
        pause() { paused=true; disarm(); },
        resume() { paused=false; },
        armExtract() { paused=false; extractMode=true; document.documentElement.classList.add('sales-os-extract-mode'); },
        stop() { disarm(); document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); document.removeEventListener('change', onChange, true); style.remove(); delete window.__salesOSMacroRecorder; }
      };
      return true;
    })()`;
  }

  private interpolateStep(step: MacroStep, inputs: MacroInputValues, outputs: Record<string, unknown>): MacroStep {
    const replace = (value?: string) => value?.replace(/\{\{\s*(input|output)\.([\w-]+)\s*\}\}/g, (_match, scope: string, key: string) => {
      const source = scope === 'input' ? inputs : outputs;
      const resolved = source[key];
      return resolved === undefined || resolved === null ? '' : String(resolved);
    });
    return { ...step, label: replace(step.label) ?? step.label, selector: replace(step.selector), value: replace(step.value), url: replace(step.url) };
  }

  private result(macroId: string, status: MacroRunResult['status'], startedAt: string, processed: number, failed: number, outputs: Record<string, unknown>, message: string): MacroRunResult {
    return { macroId, status, startedAt, finishedAt: new Date().toISOString(), processed, failed, outputs, message };
  }

  private step(input: Omit<MacroStep, 'id'>): MacroStep { return { ...input, id: randomUUID() }; }
  private emit(event: MacroRuntimeEvent): void { if (!this.window.isDestroyed()) this.window.webContents.send('macro:event', event); }
  private delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
}
