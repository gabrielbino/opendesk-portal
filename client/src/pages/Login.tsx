import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Eye, EyeOff, ArrowRight, ArrowLeft, User, Mail, Lock } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

type AuthMode = 'login' | 'register';

export default function Login() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success('Login realizado com sucesso!');
      setLocation('/dashboard');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setMode('login');
      setName('');
      setPassword('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, authLoading, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      loginMutation.mutate({ email, password });
    } else {
      registerMutation.mutate({ name, email, password });
    }
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  if (authLoading) {
    return <LoadingSpinner fullScreen size="lg" text="Carregando..." />;
  }

  return (
    <div className="min-h-screen w-full flex bg-[var(--background)]">

      {/* ── Left Panel: Branding (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-800 via-blue-700 to-blue-600 flex-col justify-between p-10 xl:p-14">
        {/* Decorative shapes */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-white/10" />
          <div className="absolute top-1/3 -right-16 w-64 h-64 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 left-1/4 w-96 h-96 rounded-full bg-white/10" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <img
            src="/logo-opendesk.svg"
            alt="OpenDesk"
            className="h-10 object-contain"
          />
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <h1 className="text-white font-bold leading-tight" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)' }}>
            Gestão de Suporte,<br />
            Desenvolvimento<br />
            e Produtividade
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            Sistema integrado para equipes de TI. Chamados, projetos e ferramentas em um único portal.
          </p>

          <div className="space-y-3 pt-2">
            {[
              'Gestão de Chamados e SLA',
              'Controle de Projetos e Tarefas',
              'Inventário e Gestão de TI',
            ].map(item => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0" />
                <span className="text-white/80 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative">
          <p className="text-white/50 text-xs">
            © {new Date().getFullYear()} OpenDesk — Acesso exclusivo para colaboradores
          </p>
        </div>
      </div>

      {/* ── Right Panel: Form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-10 min-h-screen">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <img
            src="/logo-opendesk.svg"
            alt="OpenDesk"
            className="h-9 object-contain brightness-0"
          />
        </div>

        <div className="w-full max-w-sm sm:max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {/* Header */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">
                  {mode === 'login' ? 'Entrar na conta' : 'Criar conta'}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {mode === 'login'
                    ? 'Insira suas credenciais para acessar o portal'
                    : 'Preencha os dados para solicitar acesso'}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Name (register only) */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Nome completo
                    </label>
                    <div className="relative">
                      <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Seu nome completo"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Senha</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => toast.info('Funcionalidade em desenvolvimento')}
                        className="text-xs text-primary hover:underline"
                      >
                        Esqueceu a senha?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all shadow-sm mt-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? 'Entrar' : 'Criar conta'}
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>

              {/* Register notice */}
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200"
                >
                  <p className="text-blue-700 text-xs text-center leading-relaxed">
                    Após o cadastro, sua conta precisará ser aprovada por um administrador antes de acessar o sistema.
                  </p>
                </motion.div>
              )}

              {/* Mode switch */}
              <div className="mt-6 text-center">
                {mode === 'login' ? (
                  <p className="text-sm text-muted-foreground">
                    Não tem uma conta?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className="text-primary font-medium hover:underline"
                    >
                      Cadastrar-se
                    </button>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                  >
                    <ArrowLeft size={14} />
                    Voltar para login
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Mobile footer */}
        <p className="lg:hidden mt-10 text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} OpenDesk — Acesso exclusivo para colaboradores
        </p>
      </div>
    </div>
  );
}
