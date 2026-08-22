import { useState, useRef, useCallback } from "react";
import { Upload, X, File, Image, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface FileUploadProps {
  ticketId?: number;
  onUploadComplete?: (attachment: any) => void;
  maxSizeMB?: number;
  acceptedTypes?: string[];
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/")) return <Image className="w-5 h-5" />;
  if (mimeType === "application/pdf") return <FileText className="w-5 h-5" />;
  return <File className="w-5 h-5" />;
};

export function FileUpload({
  ticketId,
  onUploadComplete,
  maxSizeMB = 10,
  acceptedTypes = ACCEPTED_TYPES,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createAttachmentMutation = trpc.attachments.create.useMutation({
    onSuccess: (data) => {
      toast.success("Arquivo enviado com sucesso");
      onUploadComplete?.(data);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao salvar anexo");
    },
  });

  const uploadToS3 = async (file: File): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    // Generate unique file key
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileKey = `tickets/${ticketId || "temp"}/${timestamp}-${randomSuffix}-${file.name}`;

    // Upload to S3 via backend
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      headers: {
        "X-File-Key": fileKey,
      },
    });

    if (!response.ok) {
      throw new Error("Falha no upload do arquivo");
    }

    const data = await response.json();
    return { url: data.url, key: fileKey };
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const maxSize = maxSizeMB * 1024 * 1024;
      const filesToUpload: File[] = [];

      // Validate files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!acceptedTypes.includes(file.type)) {
          toast.error(`Tipo de arquivo não suportado: ${file.name}`);
          continue;
        }

        if (file.size > maxSize) {
          toast.error(`Arquivo muito grande: ${file.name} (máx: ${maxSizeMB}MB)`);
          continue;
        }

        filesToUpload.push(file);
      }

      if (filesToUpload.length === 0) return;

      // Add files to uploading state
      const newUploadingFiles: UploadingFile[] = filesToUpload.map((file) => ({
        file,
        progress: 0,
        status: "uploading",
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      // Upload files
      for (const uploadingFile of newUploadingFiles) {
        try {
          // Simulate progress (real progress would require XMLHttpRequest)
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file ? { ...f, progress: 50 } : f
            )
          );

          // Upload to S3
          const { url, key } = await uploadToS3(uploadingFile.file);

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file ? { ...f, progress: 80 } : f
            )
          );

          // Save attachment metadata if ticketId is provided
          if (ticketId) {
            await createAttachmentMutation.mutateAsync({
              ticketId,
              fileName: uploadingFile.file.name,
              fileUrl: url,
              fileKey: key,
              mimeType: uploadingFile.file.type,
              fileSize: uploadingFile.file.size,
            });
          }

          // Mark as success
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file
                ? { ...f, progress: 100, status: "success" }
                : f
            )
          );

          // Remove from list after 2 seconds
          setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => f.file !== uploadingFile.file));
          }, 2000);
        } catch (error) {
          console.error("Upload error:", error);
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file
                ? {
                    ...f,
                    status: "error",
                    error: error instanceof Error ? error.message : "Erro no upload",
                  }
                : f
            )
          );
        }
      }
    },
    [ticketId, maxSizeMB, acceptedTypes, createAttachmentMutation, onUploadComplete]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeFile = (file: File) => {
    setUploadingFiles((prev) => prev.filter((f) => f.file !== file));
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
              : "border-gray-300 dark:border-border hover:border-blue-400 dark:hover:border-blue-600"
          }
        `}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm font-medium text-gray-700 dark:text-muted-foreground mb-1">
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
          Máximo {maxSizeMB}MB por arquivo • Imagens, PDFs, Documentos
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(",")}
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Uploading Files List */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((uploadingFile, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-muted rounded-lg"
            >
              <div className="flex-shrink-0 text-blue-600 dark:text-blue-700">
                {uploadingFile.status === "uploading" ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : uploadingFile.status === "success" ? (
                  getFileIcon(uploadingFile.file.type)
                ) : (
                  <X className="w-5 h-5 text-red-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {uploadingFile.file.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        uploadingFile.status === "error"
                          ? "bg-red-500"
                          : uploadingFile.status === "success"
                          ? "bg-green-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${uploadingFile.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground">
                    {uploadingFile.progress}%
                  </span>
                </div>
                {uploadingFile.error && (
                  <p className="text-xs text-red-500 mt-1">{uploadingFile.error}</p>
                )}
              </div>

              {uploadingFile.status === "error" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => removeFile(uploadingFile.file)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
