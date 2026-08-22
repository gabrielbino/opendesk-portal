import { describe, expect, it } from "vitest";
import {
  arquivoCasaLista,
  avaliarAlertaAgregado,
  avaliarGeracao,
  avaliarPrazo,
  calcularStatusGeracao,
  calcularStatusPainel,
  classificarExtensao,
  formatarDuracaoMin,
  msgAgregadoListas,
  msgAgregadoPedidos,
  normalizarExtensao,
  parseArquivo,
  type ResumoConfig,
} from "@shared/monitorArquivos";
import type { Agenda } from "@shared/agenda";

const RESUMO_VAZIO: ResumoConfig = {
  atrasadoMaisAntigo: null,
  qtdPendentes: 0,
  qtdAtrasados: 0,
  ultimaCaiuEm: null,
  ultimaLidaEm: null,
};

// Agenda "sempre ativa" para isolar a lógica de status da agenda.
const AGENDA_24_7: Agenda = { diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: 0, horaFim: 24 };

describe("parseArquivo / normalizarExtensao / classificarExtensao", () => {
  it("separa base e extensão pelo último ponto", () => {
    expect(parseArquivo("PEDIDO123.ped")).toEqual({ base: "PEDIDO123", ext: ".ped" });
    expect(parseArquivo("PEDIDO123._RM")).toEqual({ base: "PEDIDO123", ext: "._rm" });
    expect(parseArquivo("SEMEXT")).toEqual({ base: "SEMEXT", ext: "" });
  });

  it("mesmo nome-base pareia pendente e lido", () => {
    expect(parseArquivo("PEDIDO123.ped").base).toBe(parseArquivo("PEDIDO123._RM").base);
  });

  it("normaliza extensão para minúscula com ponto", () => {
    expect(normalizarExtensao("PED")).toBe(".ped");
    expect(normalizarExtensao(".PNN")).toBe(".pnn");
  });

  it("classifica pendente x lida x outra (case-insensitive)", () => {
    const pend = [".txt", ".ped", ".PNN"];
    expect(classificarExtensao(".PED", pend, "._RM")).toBe("pendente");
    expect(classificarExtensao("._rm", pend, "._RM")).toBe("lida");
    expect(classificarExtensao(".xml", pend, "._RM")).toBe("outra");
  });
});

describe("formatarDuracaoMin", () => {
  it("formata min, horas e horas cheias", () => {
    expect(formatarDuracaoMin(22)).toBe("22min");
    expect(formatarDuracaoMin(67)).toBe("1h07");
    expect(formatarDuracaoMin(120)).toBe("2h");
  });
  it("passa para dias acima de 24h", () => {
    expect(formatarDuracaoMin(25 * 60)).toBe("1d 1h");
    expect(formatarDuracaoMin(48 * 60)).toBe("2d");
    expect(formatarDuracaoMin(116 * 60 + 25)).toBe("4d 20h");
  });
});

describe("avaliarPrazo", () => {
  const cfg = { slaLeituraMin: 30, realertaMin: 30 };
  const t0 = new Date("2026-07-06T12:00:00Z");

  it("pendente vira atrasado só após o SLA", () => {
    const caiuEm = new Date(t0.getTime() - 29 * 60000);
    expect(avaliarPrazo({ estado: "pendente", caiuEm, ultimoAlertaEm: null }, cfg, t0).virarAtrasado).toBe(
      false,
    );
    const caiuEm2 = new Date(t0.getTime() - 31 * 60000);
    expect(avaliarPrazo({ estado: "pendente", caiuEm: caiuEm2, ultimoAlertaEm: null }, cfg, t0).virarAtrasado).toBe(
      true,
    );
  });

  it("atrasado re-alerta só após realertaMin desde o último alerta", () => {
    const caiuEm = new Date(t0.getTime() - 90 * 60000);
    const recente = new Date(t0.getTime() - 10 * 60000);
    expect(avaliarPrazo({ estado: "atrasado", caiuEm, ultimoAlertaEm: recente }, cfg, t0).reAlertar).toBe(false);
    const antigo = new Date(t0.getTime() - 31 * 60000);
    expect(avaliarPrazo({ estado: "atrasado", caiuEm, ultimoAlertaEm: antigo }, cfg, t0).reAlertar).toBe(true);
  });

  it("lido não faz nada", () => {
    expect(avaliarPrazo({ estado: "lido", caiuEm: t0, ultimoAlertaEm: null }, cfg, t0)).toEqual({
      virarAtrasado: false,
      reAlertar: false,
    });
  });
});

describe("calcularStatusPainel", () => {
  const agora = new Date("2026-07-06T12:00:00Z");

  it("inativo quando o coletor está offline", () => {
    const s = calcularStatusPainel({ agenda: AGENDA_24_7, gapSemPedidoMin: 60, resumo: RESUMO_VAZIO, coletorOnline: false, agora });
    expect(s.cor).toBe("inativo");
    expect(s.detalhe).toMatch(/offline/i);
  });

  it("inativo fora da janela mesmo com coletor online", () => {
    const agenda: Agenda = { diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: 0, horaFim: 1 }; // 00-01 SP
    const s = calcularStatusPainel({ agenda, gapSemPedidoMin: 60, resumo: RESUMO_VAZIO, coletorOnline: true, agora });
    expect(s.cor).toBe("inativo");
  });

  it("vermelho quando há atrasado, com âncora para contador vivo", () => {
    const caiuEm = new Date(agora.getTime() - 22 * 60000).toISOString();
    const s = calcularStatusPainel({
      agenda: AGENDA_24_7,
      gapSemPedidoMin: 60,
      resumo: { ...RESUMO_VAZIO, atrasadoMaisAntigo: { nomeBase: "PED1", caiuEm }, qtdAtrasados: 1 },
      coletorOnline: true,
      agora,
    });
    expect(s.cor).toBe("vermelho");
    expect(s.ancoraEm).toBe(caiuEm);
    expect(s.detalhe).toMatch(/sem leitura/);
  });

  it("azul quando passou pedido HOJE mas saiu do verde (gap estourou)", () => {
    const ultimaCaiuEm = new Date(agora.getTime() - 90 * 60000).toISOString(); // mesmo dia SP
    const s = calcularStatusPainel({
      agenda: AGENDA_24_7,
      gapSemPedidoMin: 60,
      resumo: { ...RESUMO_VAZIO, ultimaCaiuEm },
      coletorOnline: true,
      agora,
    });
    expect(s.cor).toBe("azul");
    expect(s.ancoraEm).toBe(ultimaCaiuEm);
  });

  it("amarelo quando NÃO passou pedido hoje (último foi em dia anterior)", () => {
    const ultimaCaiuEm = new Date(agora.getTime() - 30 * 60 * 60000).toISOString(); // ~ontem
    const s = calcularStatusPainel({
      agenda: AGENDA_24_7,
      gapSemPedidoMin: 60,
      resumo: { ...RESUMO_VAZIO, ultimaCaiuEm },
      coletorOnline: true,
      agora,
    });
    expect(s.cor).toBe("amarelo");
  });

  it("verde quando pedidos caem e são lidos no prazo", () => {
    const ultimaCaiuEm = new Date(agora.getTime() - 10 * 60000).toISOString();
    const ultimaLidaEm = new Date(agora.getTime() - 5 * 60000).toISOString();
    const s = calcularStatusPainel({
      agenda: AGENDA_24_7,
      gapSemPedidoMin: 60,
      resumo: { ...RESUMO_VAZIO, ultimaCaiuEm, ultimaLidaEm },
      coletorOnline: true,
      agora,
    });
    expect(s.cor).toBe("verde");
    expect(s.detalhe).toMatch(/Último lido/);
  });
});

describe("avaliarAlertaAgregado (1 mensagem por integração)", () => {
  const agora = new Date("2026-07-06T13:00:00Z");
  const base = { realertaMin: 30, podeAlertar: true, agora };

  it("primeiro travado → alerta e começa a alertar", () => {
    const r = avaliarAlertaAgregado({ alertandoDesde: null, ultimoEnvioEm: null }, { ...base, qtdTravado: 3 });
    expect(r.enviar).toBe("alerta");
    expect(r.alertandoDesde).toEqual(agora);
  });

  it("já alertando, dentro do intervalo → não reenvia", () => {
    const recente = new Date(agora.getTime() - 10 * 60000);
    const r = avaliarAlertaAgregado({ alertandoDesde: recente, ultimoEnvioEm: recente }, { ...base, qtdTravado: 5 });
    expect(r.enviar).toBeNull();
  });

  it("já alertando, passou o intervalo → re-alerta", () => {
    const antigo = new Date(agora.getTime() - 31 * 60000);
    const r = avaliarAlertaAgregado({ alertandoDesde: antigo, ultimoEnvioEm: antigo }, { ...base, qtdTravado: 5 });
    expect(r.enviar).toBe("realerta");
    expect(r.ultimoEnvioEm).toEqual(agora);
  });

  it("zerou os travados enquanto alertava → resolvido e limpa o estado", () => {
    const antigo = new Date(agora.getTime() - 31 * 60000);
    const r = avaliarAlertaAgregado({ alertandoDesde: antigo, ultimoEnvioEm: antigo }, { ...base, qtdTravado: 0 });
    expect(r.enviar).toBe("resolvido");
    expect(r.alertandoDesde).toBeNull();
  });

  it("fora da janela não inicia alerta novo (só resolve)", () => {
    const r = avaliarAlertaAgregado({ alertandoDesde: null, ultimoEnvioEm: null }, { ...base, qtdTravado: 3, podeAlertar: false });
    expect(r.enviar).toBeNull();
  });
});

describe("mensagens agregadas de WhatsApp", () => {
  const agora = new Date("2026-07-06T17:03:00Z"); // 14:03 SP
  it("pedidos: contagem genérica (sem nome) + mais antigo", () => {
    const caiu = new Date(agora.getTime() - 47 * 60000);
    const m = msgAgregadoPedidos("Clamed - SC", 3, caiu, agora, "alerta");
    expect(m).toContain("3 pedidos");
    expect(m).toContain("47min");
    expect(m).not.toMatch(/\d{5}_\d/); // não cita código de pedido
  });
  it("pedidos: resolvido", () => {
    expect(msgAgregadoPedidos("Clamed - SC", 0, null, agora, "resolvido")).toContain("lidos");
  });
  it("listas: contagem + rótulos", () => {
    const m = msgAgregadoListas("Rede X", 2, ["Preços", "Estoque"], "alerta");
    expect(m).toContain("2 lista");
    expect(m).toContain("Preços");
    expect(m).toContain("Estoque");
  });
});

describe("arquivoCasaLista (identificação)", () => {
  it("modo 'nome' casa o nome exato (case-insensitive)", () => {
    const l = { modoIdentificacao: "nome", nomeArquivo: "Precos.csv", extensoes: [] };
    expect(arquivoCasaLista("precos.csv", l)).toBe(true);
    expect(arquivoCasaLista("estoque.csv", l)).toBe(false);
  });
  it("modo 'nome' sem nome definido não casa nada", () => {
    expect(arquivoCasaLista("qualquer.csv", { modoIdentificacao: "nome", nomeArquivo: "", extensoes: [] })).toBe(false);
  });
  it("modo 'extensao' casa qualquer arquivo da extensão", () => {
    const l = { modoIdentificacao: "extensao", nomeArquivo: null, extensoes: [".csv", ".zip"] };
    expect(arquivoCasaLista("lote1.zip", l)).toBe(true);
    expect(arquivoCasaLista("dados.csv", l)).toBe(true);
    expect(arquivoCasaLista("leiame.txt", l)).toBe(false);
  });
});

describe("calcularStatusGeracao (projeta estadoDia)", () => {
  // agora = 10:00 SP (UTC-3, sem DST). Alvo default 08:00; hoje = 2026-07-06.
  const agora = new Date("2026-07-06T13:00:00Z");
  const HOJE = "2026-07-06";
  const base = {
    agenda: AGENDA_24_7,
    horaAlvo: 8,
    minutoAlvo: 0,
    estadoDia: "aguardando" as const,
    diaRef: HOJE as string | null,
    qtdEsperada: 1,
    qtdGeradaHoje: 0,
    ultimaGeracaoEm: null as Date | null,
    alertadoEm: null as Date | null,
    coletorOnline: true,
    agora,
  };

  it("inativo quando o coletor está offline", () => {
    expect(calcularStatusGeracao({ ...base, coletorOnline: false }).cor).toBe("inativo");
  });

  it("verde quando estadoDia=gerado e a contagem de hoje atinge a esperada", () => {
    const geradoEm = new Date(agora.getTime() - 2 * 60 * 60000);
    const s = calcularStatusGeracao({ ...base, estadoDia: "gerado", qtdGeradaHoje: 1, ultimaGeracaoEm: geradoEm });
    expect(s.cor).toBe("verde");
    expect(s.detalhe).toMatch(/Gerada/);
  });

  it("azul (aguardando até) quando dentro da janela e agora < alvo", () => {
    const s = calcularStatusGeracao({ ...base, horaAlvo: 12 });
    expect(s.cor).toBe("azul");
    expect(s.detalhe).toMatch(/Aguardando geração até/);
  });

  it("azul (próximo ciclo) quando passou do alvo mas o cérebro não marcou atrasada", () => {
    const s = calcularStatusGeracao({ ...base, horaAlvo: 8, estadoDia: "aguardando" });
    expect(s.cor).toBe("azul");
    expect(s.detalhe).toMatch(/próximo ciclo/);
  });

  it("vermelho quando estadoDia=atrasado, persistindo (âncora no alertadoEm)", () => {
    const alertadoEm = new Date(agora.getTime() - 90 * 60000);
    const s = calcularStatusGeracao({ ...base, estadoDia: "atrasado", alertadoEm });
    expect(s.cor).toBe("vermelho");
    expect(s.ancoraEm).toBe(alertadoEm.toISOString());
  });

  it("vermelho persiste mesmo em dia NÃO marcado", () => {
    const semDias = { diasSemana: [], horaInicio: 0, horaFim: 24 };
    const s = calcularStatusGeracao({ ...base, agenda: semDias, estadoDia: "atrasado", alertadoEm: agora });
    expect(s.cor).toBe("vermelho");
  });

  it("inativo quando o dia não está marcado (e não travada)", () => {
    const semDias = { diasSemana: [], horaInicio: 0, horaFim: 24 };
    expect(calcularStatusGeracao({ ...base, agenda: semDias }).cor).toBe("inativo");
  });

  it("contagem parcial aparece no detalhe (2/3)", () => {
    const s = calcularStatusGeracao({ ...base, estadoDia: "atrasado", alertadoEm: agora, qtdEsperada: 3, qtdGeradaHoje: 2 });
    expect(s.detalhe).toContain("(2/3)");
  });
});

describe("avaliarGeracao (ciclo diário + janela)", () => {
  const agora = new Date("2026-07-06T13:00:00Z");
  const deadlinePassado = new Date(agora.getTime() - 60 * 60000);
  const deadlineFuturo = new Date(agora.getTime() + 60 * 60000);
  const ctxBase = { agora, elegivelHoje: true, diaMonitorado: true, realertaMin: 60 };

  it("gerado resolve quando estava atrasada", () => {
    const r = avaliarGeracao({ estado: "atrasado", ultimoAlertaEm: agora }, { ...ctxBase, geradoHoje: true, deadline: deadlinePassado });
    expect(r).toMatchObject({ novoEstado: "gerado", resolver: true, alertar: false });
  });

  it("gerado sem estar atrasada não reenvia resolvido", () => {
    const r = avaliarGeracao({ estado: "aguardando", ultimoAlertaEm: null }, { ...ctxBase, geradoHoje: true, deadline: deadlinePassado });
    expect(r).toMatchObject({ novoEstado: "gerado", resolver: false });
  });

  it("antes do limite fica aguardando (sem alerta)", () => {
    const r = avaliarGeracao({ estado: "aguardando", ultimoAlertaEm: null }, { ...ctxBase, geradoHoje: false, deadline: deadlineFuturo });
    expect(r).toMatchObject({ novoEstado: "aguardando", alertar: false });
  });

  it("passou do limite, elegível e dia marcado → alerta (vermelho)", () => {
    const r = avaliarGeracao({ estado: "aguardando", ultimoAlertaEm: null }, { ...ctxBase, geradoHoje: false, deadline: deadlinePassado });
    expect(r).toMatchObject({ novoEstado: "atrasado", alertar: true });
  });

  it("cadastro tardio (não elegível hoje) NÃO vira vermelho — espera o próximo ciclo", () => {
    const r = avaliarGeracao({ estado: "aguardando", ultimoAlertaEm: null }, { ...ctxBase, geradoHoje: false, deadline: deadlinePassado, elegivelHoje: false });
    expect(r).toMatchObject({ novoEstado: "aguardando", alertar: false });
  });

  it("dia não monitorado mantém o vermelho sem re-alertar", () => {
    const r = avaliarGeracao({ estado: "atrasado", ultimoAlertaEm: null }, { ...ctxBase, geradoHoje: false, deadline: deadlinePassado, diaMonitorado: false });
    expect(r).toMatchObject({ novoEstado: "atrasado", alertar: false, reAlertar: false });
  });

  it("já atrasada re-alerta só após realertaMin", () => {
    const recente = new Date(agora.getTime() - 10 * 60000);
    const rNao = avaliarGeracao({ estado: "atrasado", ultimoAlertaEm: recente }, { ...ctxBase, geradoHoje: false, deadline: deadlinePassado, realertaMin: 30 });
    expect(rNao.reAlertar).toBe(false);
    const antigo = new Date(agora.getTime() - 31 * 60000);
    const rSim = avaliarGeracao({ estado: "atrasado", ultimoAlertaEm: antigo }, { ...ctxBase, geradoHoje: false, deadline: deadlinePassado, realertaMin: 30 });
    expect(rSim.reAlertar).toBe(true);
  });
});

