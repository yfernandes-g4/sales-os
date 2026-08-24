import { ArrowRight, BarChart3, Headphones, ShieldCheck } from 'lucide-react';
import type { SimulatedUser, UserRole } from '../../shared/types';

const roleIcon = (role: UserRole) => role === 'administrator' ? <ShieldCheck /> : role === 'sdr' ? <Headphones /> : <BarChart3 />;
const roleDescription: Record<UserRole, string> = {
  administrator: 'Acesso completo ao catálogo, configurações e painel administrativo.',
  sdr: 'CRM e Plataforma Comercial para prospecção e gestão dos leads.',
  coordinator: 'Indicadores, produtividade e ferramentas de enablement.',
};

export default function LoginScreen({ users, onLogin }: { users: SimulatedUser[]; onLogin: (userId: string) => Promise<void> }) {
  return <main className="login-screen">
    <section className="login-brand"><div className="login-logo">S</div><div><span>G4 SALES</span><strong>Sales OS</strong></div></section>
    <section className="login-content"><div className="login-heading"><span className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</span><h1>Escolha como deseja acessar</h1><p>Cada cargo recebe um workspace configurado com os aplicativos necessários para sua operação.</p></div>
      <div className="role-login-grid">{users.map((user) => <button className={`role-login-card ${user.role}`} key={user.id} onClick={() => void onLogin(user.id)}>
        <div className="role-icon">{roleIcon(user.role)}</div><div className="role-user"><span className="user-avatar">{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
        <div><span className="role-label">{user.roleLabel}</span><p>{roleDescription[user.role]}</p></div><div className="role-enter">Entrar como {user.roleLabel}<ArrowRight /></div>
      </button>)}</div>
      <div className="login-security"><ShieldCheck /> Login simulado para validação do controle de acesso. Nenhuma senha é necessária.</div>
    </section>
  </main>;
}
