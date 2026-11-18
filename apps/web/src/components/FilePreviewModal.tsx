import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  FileText, 
  Film, 
  Music, 
  Image as ImageIcon, 
  FileArchive, 
  File as FileIcon, 
  ShieldCheck, 
  User, 
  HardDrive 
} from 'lucide-react';
import { formatBytes, getPreviewCategory } from '@phoenix-drop/shared';
import { FileTransferSession } from '../services/transferEngine.js';

export interface PreviewableFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  downloadUrl?: string;
  senderName?: string;
  createdAt?: string;
  sha256?: string;
  blob?: Blob;
}

interface FilePreviewModalProps {
  session?: FileTransferSession | null;
  file?: PreviewableFile | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ session, file, onClose }) => {
  const [textContent, setTextContent] = useState<string | null>(null);

  const fileName = file?.fileName || session?.metadata.fileName || 'file';
  const fileType = file?.fileType || session?.metadata.fileType || 'application/octet-stream';
  const fileSize = file?.fileSize || session?.metadata.fileSize || 0;
  const downloadUrl = file?.downloadUrl || session?.downloadUrl;
  const senderName = file?.senderName || session?.metadata.senderName || 'Peer';
  const sha256 = file?.sha256 || session?.metadata.sha256;
  const blob = file?.blob || session?.blob;

  const category = getPreviewCategory(fileType, fileName);

  useEffect(() => {
    if (category === 'text') {
      if (blob) {
        blob.text().then(text => {
          setTextContent(text.slice(0, 100000));
        }).catch(() => {
          setTextContent('Unable to read text preview.');
        });
      } else if (downloadUrl) {
        fetch(downloadUrl)
          .then(res => res.text())
          .then(text => setTextContent(text.slice(0, 100000)))
          .catch(() => setTextContent('Unable to fetch text preview.'));
      }
    }
  }, [category, blob, downloadUrl]);

  const handleDownload = () => {
    if (!downloadUrl && blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
    }
  };

  const renderViewer = () => {
    if (!downloadUrl && !blob) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
          <FileIcon className="w-16 h-16 text-zinc-600 mb-4" />
          <p>File content not ready for preview.</p>
        </div>
      );
    }

    const src = downloadUrl || (blob ? URL.createObjectURL(blob) : '');

    switch (category) {
      case 'image':
        return (
          <div className="flex items-center justify-center bg-black/60 rounded-xl p-4 max-h-[60vh] overflow-hidden">
            <img
              src={src}
              alt={fileName}
              className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-lg"
            />
          </div>
        );

      case 'video':
        return (
          <div className="flex items-center justify-center bg-black/60 rounded-xl p-2 max-h-[60vh]">
            <video
              src={src}
              controls
              autoPlay={false}
              className="max-h-[55vh] max-w-full rounded-lg"
            />
          </div>
        );

      case 'audio':
        return (
          <div className="flex flex-col items-center justify-center bg-zinc-900/80 p-8 rounded-xl">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-6">
              <Music className="w-8 h-8 text-orange-400" />
            </div>
            <audio src={src} controls className="w-full max-w-md" />
          </div>
        );

      case 'pdf':
        return (
          <div className="w-full h-[60vh] rounded-xl overflow-hidden bg-zinc-900">
            <iframe
              src={src}
              title={fileName}
              className="w-full h-full border-0"
            />
          </div>
        );

      case 'text':
        return (
          <div className="w-full max-h-[60vh] overflow-y-auto bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 whitespace-pre-wrap selection:bg-orange-500/30">
            {textContent || 'Loading preview...'}
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-zinc-900/40 rounded-xl border border-zinc-800/80">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
              <FileIcon className="w-8 h-8 text-orange-400" />
            </div>
            <h4 className="text-base font-semibold text-white mb-1">{fileName}</h4>
            <p className="text-xs text-zinc-400 mb-6">
              Preview not supported for this file type. Click download to open on your device.
            </p>
            <button
              onClick={handleDownload}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-orange-600/30 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download File ({formatBytes(fileSize)})</span>
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#12141a] border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 shrink-0">
              {category === 'image' && <ImageIcon className="w-5 h-5" />}
              {category === 'video' && <Film className="w-5 h-5" />}
              {category === 'audio' && <Music className="w-5 h-5" />}
              {category === 'text' && <FileText className="w-5 h-5" />}
              {category === 'archive' && <FileArchive className="w-5 h-5" />}
              {category === 'other' && <FileIcon className="w-5 h-5" />}
            </div>
            <div className="overflow-hidden">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">{fileName}</h2>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span>{formatBytes(fileSize)}</span>
                <span>•</span>
                <span className="capitalize">{category}</span>
                {sha256 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      SHA-256
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition cursor-pointer"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Preview */}
        <div className="p-6 overflow-y-auto">
          {renderViewer()}

          {/* Metadata Footer */}
          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-zinc-500" />
                <span>Uploaded by: <strong className="text-zinc-200">{senderName}</strong></span>
              </span>
            </div>
            {sha256 && (
              <div className="font-mono text-[10px] text-zinc-500 break-all select-all">
                Hash: {sha256.slice(0, 16)}...{sha256.slice(-16)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
