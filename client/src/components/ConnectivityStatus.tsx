import { useEffect, useState } from 'react';
import { AlertCircle, Wifi, WifiOff } from 'lucide-react';

/**
 * Componente para mostrar status de conectividade do usuário
 * Detecta quando há problemas de conexão e mostra aviso visual
 */
export function ConnectivityStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verificar status inicial
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showBanner) {
    return null;
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center gap-3 ${
      isOnline 
        ? 'bg-green-900/90 text-green-100' 
        : 'bg-red-900/90 text-red-100'
    }`}>
      {isOnline ? (
        <>
          <Wifi size={20} />
          <span className="text-sm font-medium">Conexão restaurada</span>
        </>
      ) : (
        <>
          <AlertCircle size={20} />
          <span className="text-sm font-medium">
            Sem conexão. Tentando reconectar automaticamente...
          </span>
        </>
      )}
    </div>
  );
}
