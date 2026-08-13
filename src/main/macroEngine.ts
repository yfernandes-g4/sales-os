import { randomUUID } from 'node:crypto';
import type { BrowserWindow, WebContents } from 'electron';
import type { MacroDefinition, MacroRuntimeEvent, MacroStep } from '../shared/types';
import { AppViewManager } from './appViewManager';

const RECORDING_PREFIX = '__SALES_OS_MACRO__';

type DebuggerConsoleParams = { args?: Array<{ value?: unknown }> };

export class MacroEngine {
  private recordingPluginId: string | null = null;
  private recordedSteps: MacroStep[] = [];
  private recordingContents: WebContents | null = null;
  private cancelled = false;

  constructor(private readonly window: BrowserWindow, private readonly views: AppViewManager) {}

  async startRecording(pluginId: string): Promise<void> {
    if (this.recordingPluginId) await this.stopRecording();
    const contents = this.views.getActiveWebContents();
    if (!contents || this.views.getActivePluginId() !== pluginId) throw new Error('Abra o aplicativo antes de iniciar a gravação.');
    this.recordingPluginId = pluginId;
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
    this.recordedSteps = [];
    this.emit({ type: 'recording-stopped', pluginId, message: `${steps.length} etapas gravadas` });
    return steps;
  }

  async run(macro: MacroDefinition): Promise<void> {
    const contents = this.views.getActiveWebContents();
    if (!contents || this.views.getActivePluginId() !== macro.pluginId) throw new Error('Não foi possível ativar o aplicativo da macro.');
    this.cancelled = false;
    this.emit({ type: 'run-started', macroId: macro.id, pluginId: macro.pluginId });
    try {
      for (let index = 0; index < macro.steps.length; index += 1) {
        if (this.cancelled) {
          this.emit({ type: 'run-cancelled', macroId: macro.id, stepIndex: index });
          return;
        }
        const step = macro.steps[index];
        this.emit({ type: 'run-step', macroId: macro.id, step, stepIndex: index });
        await this.executeStep(contents, step);
      }
      this.emit({ type: 'run-completed', macroId: macro.id, message: 'Macro concluída' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida';
      this.emit({ type: 'run-failed', macroId: macro.id, message });
      throw error;
    }
  }

  cancel(): void { this.cancelled = true; }

  private readonly handleDebuggerMessage = (_event: Electron.Event, method: string, params: DebuggerConsoleParams): void => {
    if (method !== 'Runtime.consoleAPICalled') return;
    const message = params.args?.map((arg) => typeof arg.value === 'string' ? arg.value : '').join(' ') ?? '';
    if (!message.startsWith(RECORDING_PREFIX)) return;
    try {
      const data = JSON.parse(message.slice(RECORDING_PREFIX.length)) as Omit<MacroStep, 'id'>;
      const step = this.step(data);
      const previous = this.recordedSteps.at(-1);
      if (step.type === 'input' && previous?.type === 'input' && previous.selector === step.selector) this.recordedSteps[this.recordedSteps.length - 1] = step;
      else this.recordedSteps.push(step);
      this.emit({ type: 'recording-step', pluginId: this.recordingPluginId ?? undefined, step });
    } catch { /* Ignore page console noise. */ }
  };

  private async executeStep(contents: WebContents, step: MacroStep): Promise<void> {
    if (step.type === 'wait') {
      await this.delay(Math.max(0, Math.min(step.durationMs ?? 500, 30_000)));
      return;
    }
    if (step.type === 'navigate' && step.url) {
      await contents.loadURL(step.url);
      await this.delay(700);
      return;
    }
    if (!step.selector) throw new Error(`A etapa “${step.label}” não possui seletor.`);
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
  }

  private recorderScript(): string {
    return `(() => {
      window.__salesOSMacroRecorder?.stop?.();
      const PREFIX = ${JSON.stringify(RECORDING_PREFIX)};
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
      const send = (payload) => console.info(PREFIX + JSON.stringify(payload));
      const onClick = (event) => {
        const el = event.target?.closest?.('button,a,[role=button],input[type=button],input[type=submit]');
        if (!el) return;
        send({ type:'click', label:'Clicar em ' + label(el), selector:selector(el) });
      };
      const onChange = (event) => {
        const el = event.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || sensitive(el)) return;
        send({ type:'input', label:'Preencher ' + label(el), selector:selector(el), value:el.value });
      };
      document.addEventListener('click', onClick, true);
      document.addEventListener('change', onChange, true);
      window.__salesOSMacroRecorder = { stop() { document.removeEventListener('click', onClick, true); document.removeEventListener('change', onChange, true); delete window.__salesOSMacroRecorder; } };
      return true;
    })()`;
  }

  private step(input: Omit<MacroStep, 'id'>): MacroStep { return { ...input, id: randomUUID() }; }
  private emit(event: MacroRuntimeEvent): void { if (!this.window.isDestroyed()) this.window.webContents.send('macro:event', event); }
  private delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
}
