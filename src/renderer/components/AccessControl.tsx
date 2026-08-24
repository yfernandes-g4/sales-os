import { useEffect, useState } from 'react';
import { Check, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import type { PluginManifest, RolePolicy, UserRole } from '../../shared/types';

export default function AccessControl({ catalog, notify }: { catalog: PluginManifest[]; notify: (message: string) => void }) {
  const [policies, setPolicies] = useState<RolePolicy[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>('sdr');
  const [draft, setDraft] = useState<RolePolicy | null>(null);
  useEffect(() => { void window.salesOS.rolePolicies().then((items) => { setPolicies(items); setDraft(items.find((item) => item.role === 'sdr') ?? items[0]); }); }, []);

  const choose = (role: UserRole) => { setSelectedRole(role); setDraft(structuredClone(policies.find((item) => item.role === role) ?? null)); };
  const toggleVisible = (pluginId: string) => setDraft((current) => {
    if (!current) return current;
    const visible = current.visiblePluginIds.includes(pluginId)
      ? current.visiblePluginIds.filter((id) => id !== pluginId)
      : [...current.visiblePluginIds, pluginId];
    return { ...current, visiblePluginIds: visible, defaultInstalledPluginIds: current.defaultInstalledPluginIds.filter((id) => visible.includes(id)) };
  });
  const toggleDefault = (pluginId: string) => setDraft((current) => {
    if (!current?.visiblePluginIds.includes(pluginId)) return current;
    return { ...current, defaultInstalledPluginIds: current.defaultInstalledPluginIds.includes(pluginId) ? current.defaultInstalledPluginIds.filter((id) => id !== pluginId) : [...current.defaultInstalledPluginIds, pluginId] };
  });
  const save = async () => { if (!draft) return; const next = await window.salesOS.updateRolePolicy(draft); setPolicies(next); setDraft(next.find((item) => item.role === selectedRole) ?? null); notify(`Acesso de ${draft.label} atualizado.`); };

  return <section className="access-control">
    <div className="access-header"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Aplicativos por cargo</h2><p>Defina quais ferramentas cada perfil pode visualizar e quais já serão instaladas.</p></div><div className="access-shield"><ShieldCheck /></div></div>
    <div className="role-policy-tabs">{policies.map((policy) => <button key={policy.role} className={selectedRole === policy.role ? 'active' : ''} onClick={() => choose(policy.role)}><span>{policy.label}</span><small>{policy.visiblePluginIds.length} aplicativos</small></button>)}</div>
    {draft && <><div className="policy-summary"><LockKeyhole /><div><strong>{draft.label}</strong><p>{draft.description}</p></div><span>{draft.defaultInstalledPluginIds.length} pré-instalados</span></div>
      <div className="policy-table"><div className="policy-row policy-head"><span>Aplicativo</span><span>Categoria</span><span>Disponível</span><span>Pré-instalado</span></div>{catalog.map((plugin) => {
        const visible = draft.visiblePluginIds.includes(plugin.id); const installed = draft.defaultInstalledPluginIds.includes(plugin.id);
        return <div className={`policy-row ${visible ? '' : 'muted'}`} key={plugin.id}><span className="policy-app"><i style={{ background: plugin.accent ?? '#842E20' }}>{plugin.name.slice(0, 2).toUpperCase()}</i><strong>{plugin.name}</strong></span><span>{plugin.category}</span><span><button className={`policy-toggle ${visible ? 'on' : ''}`} onClick={() => toggleVisible(plugin.id)}><i></i>{visible ? 'Sim' : 'Não'}</button></span><span><button className={`default-check ${installed ? 'on' : ''}`} disabled={!visible} onClick={() => toggleDefault(plugin.id)}>{installed && <Check />} {installed ? 'Instalado' : 'Opcional'}</button></span></div>;
      })}</div><div className="policy-save"><span>Alterações serão aplicadas no próximo login daquele cargo.</span><button className="button primary" onClick={() => void save()}><Save /> Salvar política</button></div>
    </>}
  </section>;
}
