import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  File,
  Image,
  FileText,
  FileSpreadsheet,
  Loader2,
  Download,
  Trash2,
  Eye,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface ProjectAttachmentsProps {
  projectId: number;
  readOnly?: boolean;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

function detectCategory(
  mimeType: string
): "imagem" | "planilha" | "documento" | "outro" {
  if (mimeType.startsWith("image/")) return "imagem";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  )
    return "planilha";
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType === "text/plain"
  )
    return "documento";
  return "outro";
}

function getFileIcon(mimeType: string | null, size: "sm" | "md" = "sm") {
  const cls = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  if (!mimeType) return <File className={cls} />;
  if (mimeType.startsWith("image/"))
    return <Image className={`${cls} text-blue-500`} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return <FileSpreadsheet className={`${cls} text-green-600`} />;
  if (mimeType.includes("pdf"))
    return <FileText className={`${cls} text-red-500`} />;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return <FileText className={`${cls} text-blue-600`} />;
  return <File className={cls} />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCategoryBadge(category: string) {
  const styles: Record<string, string> = {
    imagem: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    planilha:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    documento:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    outro: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  };
  const labels: Record<string, string> = {
    imagem: "Imagem",
    planilha: "Planilha",
    documento: "Documento",
    outro: "Outro",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[category] || styles.outro}`}
    >
      {labels[category] || category}
    </span>
  );
}

export function ProjectAttachments({
  projectId,
  readOnly = false,
}: ProjectAttachmentsProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: attachments = [], isLoading } =
    trpc.projectAttachments.list.useQuery({ projectId });

  const createMutation = trpc.projectAttachments.create.useMutation({
    onSuccess: () => {
      utils.projectAttachments.list.invalidate({ projectId });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao salvar anexo");
    },
  });

  const deleteMutation = trpc.projectAttachments.delete.useMutation({
    onSuccess: () => {
      toast.success("Anexo removido");
      utils.projectAttachments.list.invalidate({ projectId });
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao remover anexo");
      setDeleteId(null);
    },
  });

  const uploadToS3 = async (
    file: File
  ): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileKey = `projects/${projectId}/${timestamp}-${randomSuffix}-${file.name}`;

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

      const filesToUpload: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!ACCEPTED_TYPES.includes(file.type) && file.type !== "") {
          toast.error(`Tipo de arquivo nao suportado: ${file.name}`);
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          toast.error(`Arquivo muito grande: ${file.name} (max: 10MB)`);
          continue;
        }

        filesToUpload.push(file);
      }

      if (filesToUpload.length === 0) return;

      const newUploadingFiles: UploadingFile[] = filesToUpload.map((file) => ({
        file,
        progress: 0,
        status: "uploading",
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      for (const uploadingFile of newUploadingFiles) {
        try {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file ? { ...f, progress: 30 } : f
            )
          );

          const { url, key } = await uploadToS3(uploadingFile.file);

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file ? { ...f, progress: 70 } : f
            )
          );

          const category = detectCategory(uploadingFile.file.type);

          await createMutation.mutateAsync({
            projectId,
            fileName: uploadingFile.file.name,
            fileUrl: url,
            fileKey: key,
            mimeType: uploadingFile.file.type,
            fileSize: uploadingFile.file.size,
            category,
          });

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file
                ? { ...f, progress: 100, status: "success" }
                : f
            )
          );

          toast.success(`${uploadingFile.file.name} enviado com sucesso`);

          setTimeout(() => {
            setUploadingFiles((prev) =>
              prev.filter((f) => f.file !== uploadingFile.file)
            );
          }, 2000);
        } catch (error) {
          console.error("Upload error:", error);
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.file === uploadingFile.file
                ? {
                    ...f,
                    status: "error",
                    error:
                      error instanceof Error ? error.message : "Erro no upload",
                  }
                : f
            )
          );
        }
      }
    },
    [projectId, createMutation]
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeUploadingFile = (file: File) => {
    setUploadingFiles((prev) => prev.filter((f) => f.file !== file));
  };

  const handlePreview = (url: string, name: string) => {
    setPreviewUrl(url);
    setPreviewName(name);
  };

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isImage = (mimeType: string | null) =>
    mimeType?.startsWith("image/") ?? false;

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      {!readOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
            ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                : "border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/30"
            }
          `}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Arraste arquivos aqui ou clique para selecionar
          </p>
          <p className="text-xs text-muted-foreground">
            Imagens, Planilhas (Excel, CSV), PDFs, Documentos (Word) - Max 10MB
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((uploadingFile, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex-shrink-0">
                {uploadingFile.status === "uploading" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
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
                      className={`h-full transition-all duration-300 rounded-full ${
                        uploadingFile.status === "error"
                          ? "bg-red-500"
                          : uploadingFile.status === "success"
                            ? "bg-green-500"
                            : "bg-blue-500"
                      }`}
                      style={{ width: `${uploadingFile.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {uploadingFile.progress}%
                  </span>
                </div>
                {uploadingFile.error && (
                  <p className="text-xs text-red-500 mt-1">
                    {uploadingFile.error}
                  </p>
                )}
              </div>

              {uploadingFile.status === "error" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeUploadingFile(uploadingFile.file);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attachments List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : attachments.length === 0 && uploadingFiles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum anexo neste projeto</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment: any) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
            >
              {/* Thumbnail or Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                {isImage(attachment.mimeType) ? (
                  <img
                    src={attachment.fileUrl}
                    alt={attachment.fileName}
                    className="w-10 h-10 object-cover rounded-lg"
                    loading="lazy"
                  />
                ) : (
                  getFileIcon(attachment.mimeType, "md")
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {attachment.fileName}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {getCategoryBadge(attachment.category)}
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSize)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    por {attachment.uploadedByName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(attachment.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {isImage(attachment.mimeType) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Visualizar"
                    onClick={() =>
                      handlePreview(attachment.fileUrl, attachment.fileName)
                    }
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Download"
                  onClick={() =>
                    handleDownload(attachment.fileUrl, attachment.fileName)
                  }
                >
                  <Download className="w-4 h-4" />
                </Button>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Excluir"
                    onClick={() => setDeleteId(attachment.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Dialog */}
      <Dialog
        open={!!previewUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="truncate">{previewName}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center overflow-auto max-h-[75vh]">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={previewName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este anexo? Esta acao nao pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteId !== null) {
                  deleteMutation.mutate({ id: deleteId });
                }
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
