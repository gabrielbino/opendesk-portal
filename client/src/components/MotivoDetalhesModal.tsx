import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { TrendingUp, Package, DollarSign, Truck, AlertCircle, Download, BarChart3, Users } from "lucide-react";

interface MotivoDetalhesModalProps {
  isOpen: boolean;
  onClose: () => void;
  motivo: string;
  uploadId?: number;
}

export function MotivoDetalhesModal({ isOpen, onClose, motivo, uploadId }: MotivoDetalhesModalProps) {
  const [selectedMes, setSelectedMes] = useState<string>("all");
  const [selectedAno, setSelectedAno] = useState<string>("all");

  const { data: detalhes, isLoading } = trpc.commercial.getMotivoDetalhes.useQuery(
    {
      motivoRejeicao: motivo,
      uploadId,
      mes: selectedMes && selectedMes !== "all" ? parseInt(selectedMes) : undefined,
      ano: selectedAno && selectedAno !== "all" ? parseInt(selectedAno) : undefined,
    },
    { enabled: isOpen }
  );

  const meses = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const anos = [2024, 2025, 2026];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[90vw] xl:w-[95vw] max-w-6xl max-h-[95vh] overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50 p-0">
        {/* Header Premium */}
        <DialogHeader className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 -mx-6 -mt-6 px-4 sm:px-6 md:px-8 py-6 sm:py-8 rounded-t-lg relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full -ml-16 -mb-16"></div>
          </div>
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm">
              <AlertCircle className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground leading-tight break-words">
                Análise: {motivo}
              </DialogTitle>
              <p className="text-muted-foreground text-sm mt-2 font-medium">Racional detalhado de rejeições por motivo com distribuição geográfica e análise de fornecedores</p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
          {/* Filtros de Data - Seção Premium */}
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-6 border border-blue-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Período de Análise</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">Mês</label>
                <Select value={selectedMes} onValueChange={setSelectedMes}>
                  <SelectTrigger className="bg-white border-blue-200 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue placeholder="Todos os Meses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Meses</SelectItem>
                    {meses.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">Ano</label>
                <Select value={selectedAno} onValueChange={setSelectedAno}>
                  <SelectTrigger className="bg-white border-blue-200 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue placeholder="Todos os Anos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Anos</SelectItem>
                    {anos.map((a) => (
                      <SelectItem key={a} value={a.toString()}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600"></div>
              <p className="text-slate-600 mt-4 font-medium">Carregando análise detalhada...</p>
            </div>
          ) : detalhes ? (
            <div className="space-y-8">
              {/* Métricas Principais - Grid 4 Colunas Premium */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                {/* Total de Rejeições */}
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200 shadow-sm hover:shadow-lg transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-red-700 uppercase tracking-widest">Total Rejeições</span>
                    <div className="p-2 bg-red-200 rounded-lg group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-4 h-4 text-red-600" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-black text-red-700 mb-2 break-words">{formatNumber(detalhes.totalRejeicoes)}</p>
                  <p className="text-xs text-red-600 font-medium">registros de rejeição</p>
                </div>

                {/* Valor Rejeitado */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 border border-amber-200 shadow-sm hover:shadow-lg transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Valor Rejeitado</span>
                    <div className="p-2 bg-amber-200 rounded-lg group-hover:scale-110 transition-transform">
                      <DollarSign className="w-4 h-4 text-amber-600" />
                    </div>
                  </div>
                  <p className="text-xl sm:text-2xl md:text-3xl font-black text-amber-700 mb-2 break-words">R$ {formatCurrency(detalhes.valorTotalRejeitado)}</p>
                  <p className="text-xs text-amber-600 font-medium">em reais</p>
                </div>

                {/* Qtd Solicitada */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200 shadow-sm hover:shadow-lg transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">Qtd Solicitada</span>
                    <div className="p-2 bg-blue-200 rounded-lg group-hover:scale-110 transition-transform">
                      <Package className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-black text-blue-700 mb-2 break-words">{formatNumber(detalhes.qtdTotalSolicitada)}</p>
                  <p className="text-xs text-blue-600 font-medium">unidades solicitadas</p>
                </div>

                {/* Qtd Atendida */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200 shadow-sm hover:shadow-lg transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-green-700 uppercase tracking-widest">Qtd Atendida</span>
                    <div className="p-2 bg-green-200 rounded-lg group-hover:scale-110 transition-transform">
                      <Truck className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-black text-green-700 mb-2 break-words">{formatNumber(detalhes.qtdTotalAtendida)}</p>
                  <p className="text-xs text-green-600 font-medium">unidades atendidas</p>
                </div>
              </div>

              {/* Distribuição por Estado */}
              {detalhes.byEstado && detalhes.byEstado.length > 0 && (
                <div className="bg-white rounded-xl p-7 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Distribuição Geográfica por Estado</h3>
                  </div>
                  <div className="space-y-4">
                    {detalhes.byEstado.map((item) => {
                      const maxTotal = Math.max(...(detalhes.byEstado?.map(e => e.total) || [1]));
                      const percentage = (item.total / maxTotal) * 100;
                      const percentageTotal = ((item.total / detalhes.totalRejeicoes) * 100).toFixed(1);
                      return (
                        <div key={item.estado} className="space-y-2 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{item.estado}</span>
                              <span className="text-xs font-semibold text-muted-foreground bg-slate-200 px-2 py-1 rounded-full">{percentageTotal}%</span>
                            </div>
                            <span className="text-sm font-bold text-slate-900">{formatNumber(item.total)} rejeições</span>
                          </div>
                          <div className="w-full bg-slate-300 rounded-full h-3 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 h-full rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top Fabricantes */}
              {detalhes.byFabricante && detalhes.byFabricante.length > 0 && (
                <div className="bg-white rounded-xl p-7 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Users className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Top 8 Fabricantes com Mais Rejeições</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {detalhes.byFabricante.slice(0, 8).map((item, idx) => (
                      <div key={item.fabricante} className="flex items-center gap-4 p-4 bg-gradient-to-r from-slate-50 to-amber-50 rounded-lg hover:from-slate-100 hover:to-amber-100 transition-colors border border-slate-200">
                        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 text-white rounded-full text-sm font-bold shadow-md">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 break-words">{item.fabricante}</p>
                          <p className="text-xs text-muted-foreground mt-1">{((item.total / detalhes.totalRejeicoes) * 100).toFixed(1)}% do total</p>
                        </div>
                        <span className="text-sm font-bold text-slate-900 whitespace-nowrap bg-white px-3 py-1 rounded-lg">{formatNumber(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Produtos */}
              {detalhes.topProdutos && detalhes.topProdutos.length > 0 && (
                <div className="bg-white rounded-xl p-7 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Package className="w-5 h-5 text-green-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Top 8 Produtos Mais Rejeitados</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {detalhes.topProdutos.slice(0, 8).map((item, idx) => (
                      <div key={item.codProduto} className="flex items-center gap-4 p-4 bg-gradient-to-r from-slate-50 to-green-50 rounded-lg hover:from-slate-100 hover:to-green-100 transition-colors border border-slate-200">
                        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full text-sm font-bold shadow-md">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground font-semibold mb-1">Cód: {item.codProduto}</p>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 break-words">{item.produto}</p>
                        </div>
                        <span className="text-sm font-bold text-slate-900 whitespace-nowrap bg-white px-3 py-1 rounded-lg">{formatNumber(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Footer Premium */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="text-slate-700 border-slate-300 hover:bg-slate-50 font-medium"
            >
              Fechar
            </Button>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium gap-2"
              disabled
            >
              <Download className="w-4 h-4" />
              Exportar Relatório
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
