import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Camera, Check, Lock, Phone, Trash2, User, UserCircle } from "lucide-react";

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import PanelHeader from "@/components/PanelHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tab = "dados" | "seguranca" | "contato";

/** Iniciais (até 2) para o fallback do avatar. */
function iniciais(nome?: string | null): string {
  if (!nome) return "U";
  return (
    nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "U"
  );
}

/** Lê um arquivo de imagem e devolve um data URI quadrado pequeno (cover-crop), leve o bastante p/ o banco. */
async function fileToAvatarDataUrl(file: File, size = 160): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-5";

export default function Perfil() {
  const { user, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("dados");

  const atualizar = trpc.perfil.atualizar.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await refresh();
      toast.success("Perfil atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Dados ──
  const [nome, setNome] = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState<string | null | undefined>((user as { avatarUrl?: string | null } | null)?.avatarUrl);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch {
      toast.error("Não foi possível processar a imagem.");
    }
  };

  const salvarDados = () => {
    if (!nome.trim()) {
      toast.error("Informe seu nome.");
      return;
    }
    atualizar.mutate({ name: nome.trim(), avatarUrl: avatar ?? null });
  };

  // ── Contato ──
  const [whatsapp, setWhatsapp] = useState((user as { whatsapp?: string | null } | null)?.whatsapp ?? "");
  const salvarContato = () => atualizar.mutate({ whatsapp: whatsapp.trim() || null });

  // ── Segurança ──
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const alterarSenha = trpc.perfil.alterarSenha.useMutation({
    onSuccess: () => {
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmaSenha("");
      toast.success("Senha alterada.");
    },
    onError: (e) => toast.error(e.message),
  });
  const senhaErro =
    novaSenha.length > 0 && novaSenha.length < 6
      ? "A nova senha precisa de ao menos 6 caracteres."
      : confirmaSenha.length > 0 && novaSenha !== confirmaSenha
        ? "A confirmação não confere."
        : null;
  const submeterSenha = () => {
    if (!senhaAtual || !novaSenha || senhaErro || novaSenha !== confirmaSenha) {
      if (!senhaAtual) toast.error("Informe a senha atual.");
      return;
    }
    alterarSenha.mutate({ currentPassword: senhaAtual, newPassword: novaSenha });
  };

  const nome0 = user?.name ?? "Usuário";
  const papel = user?.role === "admin" ? "Administrador" : "Usuário";

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => setLocation("/dashboard")}
          backLabel="Portal"
          icon={UserCircle}
          title="Meu perfil"
          subtitle={user?.email ?? undefined}
          color="indigo"
          tabs={[
            { value: "dados", label: "Dados", icon: <User size={14} /> },
            { value: "seguranca", label: "Segurança", icon: <Lock size={14} /> },
            { value: "contato", label: "Contato", icon: <Phone size={14} /> },
          ]}
          activeTab={tab}
          onTabChange={(v) => setTab(v as Tab)}
          tabsClassName="sm:max-w-md"
        />

        <div className="max-w-2xl space-y-4">
          {tab === "dados" && (
            <div className={CARD}>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <Avatar className="h-20 w-20">
                  {avatar && <AvatarImage src={avatar} alt={nome0} />}
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-lg font-semibold text-white">
                    {iniciais(nome0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Camera className="mr-1.5 h-4 w-4" /> Alterar foto
                  </Button>
                  {avatar && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAvatar(null)}>
                      <Trash2 className="mr-1.5 h-4 w-4" /> Remover
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="perfil-nome">Nome</Label>
                  <Input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={255} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="perfil-email">E-mail</Label>
                  <Input id="perfil-email" value={user?.email ?? ""} disabled readOnly />
                  <p className="text-xs text-muted-foreground">O e-mail é sua identidade de acesso e não pode ser alterado aqui.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Perfil de acesso</Label>
                  <p className="text-sm text-foreground">{papel}</p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button onClick={salvarDados} disabled={atualizar.isPending}>
                  <Check className="mr-1.5 h-4 w-4" /> {atualizar.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}

          {tab === "seguranca" && (
            <div className={CARD}>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="senha-atual">Senha atual</Label>
                  <Input id="senha-atual" type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha-nova">Nova senha</Label>
                  <Input id="senha-nova" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha-conf">Confirmar nova senha</Label>
                  <Input id="senha-conf" type="password" autoComplete="new-password" value={confirmaSenha} onChange={(e) => setConfirmaSenha(e.target.value)} />
                </div>
                {senhaErro && <p className="text-sm text-destructive">{senhaErro}</p>}
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={submeterSenha} disabled={alterarSenha.isPending || !!senhaErro || !senhaAtual || !novaSenha || !confirmaSenha}>
                  <Lock className="mr-1.5 h-4 w-4" /> {alterarSenha.isPending ? "Alterando..." : "Alterar senha"}
                </Button>
              </div>
            </div>
          )}

          {tab === "contato" && (
            <div className={CARD}>
              <div className="space-y-1.5">
                <Label htmlFor="perfil-whatsapp">WhatsApp corporativo (opcional)</Label>
                <Input
                  id="perfil-whatsapp"
                  inputMode="tel"
                  placeholder="Ex.: +55 48 99999-9999"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  Fica salvo na lista de contatos do portal (usada por alertas e disparos). Guardamos só os dígitos.
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={salvarContato} disabled={atualizar.isPending}>
                  <Check className="mr-1.5 h-4 w-4" /> {atualizar.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
