import React from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Construction } from 'lucide-react';

export default function ModulePlaceholder({ title }: { title: string }) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-700 to-blue-600 flex items-center justify-center relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-white/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-white/5 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10 text-center p-8">
        <div className="w-24 h-24 bg-white/15 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md border border-white/20 shadow-xl">
          <Construction size={48} className="text-white" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">Módulo {title}</h1>
        <p className="text-white/70 text-lg mb-8 max-w-md mx-auto">
          Este módulo está em desenvolvimento e estará disponível em breve no portal OpenDesk.
        </p>
        <button
          onClick={() => setLocation('/dashboard')}
          className="px-6 py-3 rounded-xl bg-white text-blue-700 font-semibold hover:bg-blue-50 transition flex items-center gap-2 mx-auto shadow-lg"
        >
          <ArrowLeft size={20} />
          Voltar ao Portal
        </button>
      </div>
    </div>
  );
}
