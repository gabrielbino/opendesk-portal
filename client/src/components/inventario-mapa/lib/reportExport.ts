import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import type { Area, Equipment, Setor } from "@shared/inventarioMapa";
import { formatDateTime, nowIso } from "./ids";
import { statusLabels } from "../constants";

interface SetorGrupo {
  nome: string;
  itens: Equipment[];
}

interface AreaGrupo {
  nome: string;
  setores: SetorGrupo[];
}

/**
 * Agrupa os dados em Área → Setor → equipamentos, preservando a ordem.
 * Setores sem área e equipamentos sem setor caem em "Sem área" / "Sem setor".
 */
function agrupar(equipments: Equipment[], setores: Setor[], areas: Area[]): AreaGrupo[] {
  const itensPorSetor = new Map<string, Equipment[]>();
  const soltos: Equipment[] = [];
  const setorIds = new Set(setores.map((s) => s.id));

  equipments.forEach((eq) => {
    if (eq.setorId && setorIds.has(eq.setorId)) {
      const l = itensPorSetor.get(eq.setorId) ?? [];
      l.push(eq);
      itensPorSetor.set(eq.setorId, l);
    } else {
      soltos.push(eq);
    }
  });

  const setorGrupo = (s: Setor): SetorGrupo => ({ nome: s.nome, itens: itensPorSetor.get(s.id) ?? [] });

  const grupos: AreaGrupo[] = areas.map((a) => ({
    nome: a.nome,
    setores: setores.filter((s) => s.areaId === a.id).map(setorGrupo),
  }));

  const areaIds = new Set(areas.map((a) => a.id));
  const setoresSemArea = setores.filter((s) => !s.areaId || !areaIds.has(s.areaId)).map(setorGrupo);
  const semArea: SetorGrupo[] = [...setoresSemArea];
  if (soltos.length) semArea.push({ nome: "Sem setor", itens: soltos });
  if (semArea.length) grupos.push({ nome: "Sem área", setores: semArea });

  return grupos;
}

function perifericoResumo(eq: Equipment): string {
  if (!eq.perifericos.length) return "—";
  return eq.perifericos
    .map((p) => {
      const desc = p.descricao ? ` - ${p.descricao}` : "";
      const pat = p.patrimonio ? ` (${p.patrimonio})` : "";
      return `${p.tipo}${desc}${pat}`;
    })
    .join("\n");
}

function slug(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "inventario"
  );
}

function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const COLUNAS = [
  "Nome",
  "Patrimônio",
  "Endereço MAC",
  "Sistema Operacional",
  "Responsável",
  "Departamento",
  "Status",
  "Periféricos",
];

function linhaEquipamento(eq: Equipment): string[] {
  return [
    eq.geral.nome,
    eq.geral.patrimonio,
    eq.geral.mac,
    eq.geral.sistemaOperacional,
    eq.geral.responsavel,
    eq.geral.departamento,
    statusLabels[eq.geral.status],
    perifericoResumo(eq),
  ];
}

/* Excel (.xlsx) */
export function exportExcel(equipments: Equipment[], setores: Setor[], areas: Area[], nome = "inventario") {
  const grupos = agrupar(equipments, setores, areas);

  const equipRows = grupos.flatMap((a) =>
    a.setores.flatMap((s) =>
      s.itens.map((eq) => ({
        Área: a.nome,
        Setor: s.nome,
        Nome: eq.geral.nome,
        Patrimônio: eq.geral.patrimonio,
        "Endereço MAC": eq.geral.mac,
        "Sistema Operacional": eq.geral.sistemaOperacional,
        Responsável: eq.geral.responsavel,
        Departamento: eq.geral.departamento,
        Status: statusLabels[eq.geral.status],
        "Qtd. Periféricos": eq.perifericos.length,
      })),
    ),
  );

  const perifRows = grupos.flatMap((a) =>
    a.setores.flatMap((s) =>
      s.itens.flatMap((eq) =>
        eq.perifericos.map((p) => ({
          Área: a.nome,
          Setor: s.nome,
          Computador: eq.geral.nome,
          Tipo: p.tipo,
          "Descrição / Modelo": p.descricao,
          Patrimônio: p.patrimonio,
        })),
      ),
    ),
  );

  const wb = XLSX.utils.book_new();

  const wsEquip = XLSX.utils.json_to_sheet(equipRows.length ? equipRows : [{ Área: "", Setor: "", Nome: "" }]);
  wsEquip["!cols"] = [
    { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsEquip, "Equipamentos");

  const wsPerif = XLSX.utils.json_to_sheet(
    perifRows.length
      ? perifRows
      : [{ Área: "", Setor: "", Computador: "", Tipo: "", "Descrição / Modelo": "", Patrimônio: "" }],
  );
  wsPerif["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 26 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsPerif, "Periféricos");

  XLSX.writeFile(wb, `${slug(nome)}.xlsx`);
}

/* PDF */
export function exportPdf(equipments: Equipment[], setores: Setor[], areas: Area[], nome = "inventario") {
  const grupos = agrupar(equipments, setores, areas);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("Inventário de Equipamentos por Área e Setor", marginX, 16);
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Gerado em ${formatDateTime(nowIso())}`, marginX, 22);
  doc.text(
    `${equipments.length} equipamento(s) · ${setores.length} setor(es) · ${areas.length} área(s)`,
    pageWidth - marginX,
    22,
    { align: "right" },
  );

  let y = 30;
  const garantirEspaco = (altura: number) => {
    if (y > pageHeight - altura) {
      doc.addPage();
      y = 20;
    }
  };

  grupos.forEach((area) => {
    garantirEspaco(24);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(area.nome.toUpperCase(), marginX, y);
    y += 6;

    area.setores.forEach((setor) => {
      garantirEspaco(24);
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85);
      doc.text(`${setor.nome}  (${setor.itens.length})`, marginX + 2, y);
      y += 2;

      if (setor.itens.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text("Nenhum equipamento neste setor.", marginX + 2, y + 5);
        y += 11;
        return;
      }

      autoTable(doc, {
        startY: y + 2,
        head: [COLUNAS],
        body: setor.itens.map(linhaEquipamento),
        styles: { fontSize: 8, cellPadding: 1.6, valign: "top", textColor: [30, 41, 59] },
        headStyles: { fillColor: [34, 211, 238], textColor: [10, 15, 28], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [244, 247, 250] },
        columnStyles: { 7: { cellWidth: 68 } },
        margin: { left: marginX + 2, right: marginX },
      });

      y = (doc as any).lastAutoTable.finalY + 6;
    });

    y += 3;
  });

  doc.save(`${slug(nome)}.pdf`);
}

/* Word (.docx) */
function docxCell(text: string, opts: { bold?: boolean } = {}) {
  return new TableCell({
    children: [
      new Paragraph({
        children: text
          .split("\n")
          .map((line, i) => new TextRun({ text: line, bold: opts.bold, size: 18, break: i > 0 ? 1 : 0 })),
      }),
    ],
  });
}

export async function exportDocx(equipments: Equipment[], setores: Setor[], areas: Area[], nome = "inventario") {
  const grupos = agrupar(equipments, setores, areas);

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: "Inventário de Equipamentos por Área e Setor", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Gerado em ${formatDateTime(nowIso())} · ${equipments.length} equipamento(s) · ${setores.length} setor(es) · ${areas.length} área(s)`,
          color: "777777",
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  grupos.forEach((area) => {
    children.push(new Paragraph({ text: area.nome, heading: HeadingLevel.HEADING_1 }));

    area.setores.forEach((setor) => {
      children.push(new Paragraph({ text: `${setor.nome} (${setor.itens.length})`, heading: HeadingLevel.HEADING_2 }));

      if (setor.itens.length === 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "Nenhum equipamento neste setor.", italics: true, color: "999999", size: 18 })],
          }),
        );
        return;
      }

      const headerRow = new TableRow({ tableHeader: true, children: COLUNAS.map((c) => docxCell(c, { bold: true })) });
      const rows = setor.itens.map((eq) => new TableRow({ children: linhaEquipamento(eq).map((v) => docxCell(v)) }));

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
            left: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
            right: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
          },
          rows: [headerRow, ...rows],
        }),
      );
      children.push(new Paragraph({ text: "" }));
    });
  });

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  baixarBlob(blob, `${slug(nome)}.docx`);
}
