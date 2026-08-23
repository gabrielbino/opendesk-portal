# Deploy sempre-online (grátis) — Oracle Cloud + Docker + Caddy

Objetivo: uma URL de demo **24/7** (mesmo com seu PC desligado), de graça, com HTTPS.
A stack sobe pelo `docker compose`; só o **portal** fica exposto, atrás do **Caddy**
(certificado Let's Encrypt automático). MySQL e query-api ficam internos.

```
internet ─▶ Caddy (80/443, HTTPS) ─▶ portal:3000 ─┬─▶ db (MySQL, interno)
                                                   └─▶ query-api:4000 (interno) ─▶ demo_erp
```

## Por que Oracle Cloud "Always Free"
É uma VM **sempre ligada e gratuita de verdade** (cobrança nunca acontece no tier Always Free;
o cartão é só para verificação). O shape **Ampere A1 (ARM)** dá até 4 vCPU / 24 GB grátis — sobra
para buildar e rodar a stack. Todas as imagens usadas (node, mysql, caddy) têm versão ARM.

> Alternativas: **Fly.io** (Docker nativo, faixa pequena) ou **Render** (dorme após 15 min; banco só Postgres).

---

## 1. Criar a VM
1. Crie a conta em **cloud.oracle.com** (região perto de você).
2. **Compute → Instances → Create**:
   - Image: **Ubuntu 22.04**
   - Shape: **VM.Standard.A1.Flex** (ARM) — ex.: 2 OCPU / 8 GB (dentro do Always Free).
   - Salve a **chave SSH** (download da private key).
3. Anote o **IP público** da instância.

## 2. Abrir as portas (2 lugares — a pegadinha clássica)
**(a) Na nuvem:** VCN → Security List (ou NSG) da subnet → **Ingress Rules** → libere TCP **80** e **443**
(origem `0.0.0.0/0`). A 22 (SSH) já costuma vir aberta.

**(b) No Ubuntu (Oracle bloqueia por padrão via iptables):**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Domínio grátis (aponta para o IP da VM)
Let's Encrypt precisa de um **domínio** (não emite para IP puro). Opções gratuitas:
- **DuckDNS** (recomendado): crie `algo.duckdns.org` e coloque o **IP público da VM** no campo de IP.
- **sslip.io** (sem cadastro): use `<IP-com-hifens>.sslip.io` (ex.: `129-159-1-2.sslip.io`).

## 4. Instalar Docker na VM
```bash
ssh -i suachave.key ubuntu@SEU_IP
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit    # saia e reconecte para o grupo valer
```

## 5. Levar o código para a VM
O repo é **privado** → o `git clone` na VM precisa de credencial. Jeito limpo (**Deploy Key**):
```bash
ssh-keygen -t ed25519 -C "opendesk-vm" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub    # copie
```
No GitHub: repo **opendesk-portal → Settings → Deploy keys → Add** (cole a chave, read-only). Depois:
```bash
git clone git@github.com:gabrielbino/opendesk-portal.git
cd opendesk-portal
```

## 6. Configurar o `.env` de produção
Na raiz do projeto, crie `.env` (o git ignora):
```bash
cat > .env <<'EOF'
SITE_ADDRESS=opendesk.duckdns.org
SITE_URL=https://opendesk.duckdns.org
JWT_SECRET=troque-por-um-segredo-longo-e-aleatorio
EOF
```

## 7. Subir a stack
```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```
O primeiro `up` builda o portal, cria os bancos (bootstrap automático) e o Caddy emite o certificado.
Acompanhe:
```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs -f caddy portal
```

## 8. Acessar e proteger
- Abra **https://SEU-DOMINIO** → login `admin@opendesk.local` / `admin123`.
- **Troque a senha do admin** (Administração → Usuários) — é um demo público.
- **Não** suba os agentes (WhatsApp/coletor) no demo público.
- MySQL e query-api já ficam internos (o override não publica as portas).

## Manutenção
```bash
# atualizar após um git push
git pull && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
# parar / logs / status
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml down
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml ps
```

## Solução de problemas
| Sintoma | Causa provável |
|---|---|
| Caddy não emite certificado | Portas 80/443 fechadas (passo 2a **e** 2b) ou domínio não aponta pro IP (passo 3). |
| Site abre em HTTP mas login não fixa | Cookie atrás de proxy — confirme que o Caddy manda `X-Forwarded-Proto` (padrão) e que o portal confia no proxy. |
| Build falha por memória | Use um shape com mais RAM (A1 com 6–8 GB) — o micro AMD (1 GB) é apertado para o build do Vite. |
| `docker: permission denied` | Faltou reconectar após o `usermod -aG docker` (passo 4). |
