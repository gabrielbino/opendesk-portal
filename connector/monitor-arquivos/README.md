# Coletor de arquivos — Monitor de Integrações (OpenDesk)

Agente "burro" da **Fase 3** do submódulo *Monitor de Integrações* (módulo Indicadores) do portal OpenDesk.
Roda na **VM Ubuntu `srvappapi`** (rede interna), varre as pastas monitoradas e publica o snapshot no
portal. **Não decide nada** — toda a regra (cor/SLA/alerta WhatsApp) vive no cérebro do portal.

- Contrato + arquitetura: [`docs/monitor-arquivos-handoff.md`](../../docs/monitor-arquivos-handoff.md)
- Guia desta fase (mount do 202, contrato, algoritmo, verificação): [`docs/monitor-arquivos-fase3-coletor.md`](../../docs/monitor-arquivos-fase3-coletor.md)
- **Como operar** (mount, deploy manual, systemd, logs, atualização): [`OPERACAO.md`](OPERACAO.md)

## Resumo rápido

```bash
cp .env.example .env      # preencha PORTAL_URL e MONITOR_AGENTE_TOKEN
npm install               # só a dep 'dotenv' (fetch é nativo no Node 18+)
node index.mjs            # teste em foreground

sudo bash scripts/install-service.sh   # instala/atualiza o serviço systemd
journalctl -u coletor-arquivos -f      # logs ao vivo
```

O operador cadastra os **caminhos** (extensões, intervalos, agenda, destinos) **pelo painel** do portal
— o coletor só recebe a lista no heartbeat. O caminho digitado é usado **como o coletor o enxerga**
(ex.: `/mnt/ftp202/pedidos`), sem tradução de UNC.
