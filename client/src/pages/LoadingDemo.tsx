import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function LoadingDemo() {
  const [showFullScreen, setShowFullScreen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003366] via-[#004080] to-[#0059b3] p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">Loading Spinner OpenDesk</h1>
          <p className="text-blue-200">Demonstração dos diferentes tamanhos e estilos</p>
        </div>

        {/* Size variations */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4">
            <h3 className="text-white font-semibold">Small</h3>
            <LoadingSpinner size="sm" text="Carregando..." />
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4">
            <h3 className="text-white font-semibold">Medium</h3>
            <LoadingSpinner size="md" text="Carregando..." />
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4">
            <h3 className="text-white font-semibold">Large</h3>
            <LoadingSpinner size="lg" text="Carregando..." />
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4">
            <h3 className="text-white font-semibold">Extra Large</h3>
            <LoadingSpinner size="xl" text="Carregando..." />
          </div>
        </div>

        {/* Without text */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-12">
          <h3 className="text-white font-semibold text-center mb-8">Sem texto</h3>
          <div className="flex justify-center">
            <LoadingSpinner size="lg" text="" />
          </div>
        </div>

        {/* Full screen demo */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 text-center space-y-4">
          <h3 className="text-white font-semibold">Tela Cheia</h3>
          <p className="text-blue-200 text-sm">Clique no botão para ver o spinner em tela cheia</p>
          <Button
            onClick={() => setShowFullScreen(true)}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400"
          >
            Mostrar Tela Cheia
          </Button>
        </div>

        {/* Use cases */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 space-y-4">
          <h3 className="text-white font-semibold text-xl mb-4">Casos de Uso</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-blue-200">
            <div className="space-y-2">
              <p className="font-medium text-white">Small (sm)</p>
              <p className="text-sm">• Botões inline</p>
              <p className="text-sm">• Ícones de status</p>
              <p className="text-sm">• Indicadores pequenos</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-white">Medium (md)</p>
              <p className="text-sm">• Cards de conteúdo</p>
              <p className="text-sm">• Modais</p>
              <p className="text-sm">• Seções de página</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-white">Large (lg)</p>
              <p className="text-sm">• Carregamento de páginas</p>
              <p className="text-sm">• Autenticação</p>
              <p className="text-sm">• Processos longos</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-white">Extra Large (xl)</p>
              <p className="text-sm">• Splash screens</p>
              <p className="text-sm">• Inicialização do app</p>
              <p className="text-sm">• Telas de boas-vindas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Full screen overlay */}
      {showFullScreen && (
        <div className="fixed inset-0 z-50" onClick={() => setShowFullScreen(false)}>
          <LoadingSpinner fullScreen size="xl" text="Carregando sistema..." />
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-white/70 text-sm">Clique em qualquer lugar para fechar</p>
          </div>
        </div>
      )}
    </div>
  );
}
