import { useState } from "react";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface AttachmentPreviewProps {
  fileUrl: string;
  fileName: string;
  mimeType?: string | null;
  onClose: () => void;
}

export function AttachmentPreview({
  fileUrl,
  fileName,
  mimeType,
  onClose,
}: AttachmentPreviewProps) {
  const [zoom, setZoom] = useState(100);

  const isImage = mimeType?.startsWith("image/");
  const isPDF = mimeType === "application/pdf";

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-6xl h-[90vh] bg-card rounded-lg shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-medium truncate">{fileName}</h3>
              <p className="text-muted-foreground text-sm">
                {mimeType || "Arquivo"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isImage && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    className="text-foreground hover:bg-muted/50"
                    disabled={zoom <= 50}
                  >
                    <ZoomOut className="w-5 h-5" />
                  </Button>
                  <span className="text-foreground text-sm min-w-[4rem] text-center">
                    {zoom}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    className="text-foreground hover:bg-muted/50"
                    disabled={zoom >= 200}
                  >
                    <ZoomIn className="w-5 h-5" />
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                className="text-foreground hover:bg-muted/50"
              >
                <Download className="w-5 h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-foreground hover:bg-muted/50"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
            {isImage ? (
              <img
                src={fileUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{ transform: `scale(${zoom / 100})` }}
              />
            ) : isPDF ? (
              <iframe
                src={fileUrl}
                title={fileName}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="text-center">
                <p className="text-foreground mb-4">
                  Preview não disponível para este tipo de arquivo
                </p>
                <Button onClick={handleDownload} className="bg-blue-600 hover:bg-blue-700">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Arquivo
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
