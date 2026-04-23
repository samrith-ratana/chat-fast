'use client';

import { useState } from 'react';

import { getApiUrl } from '@/lib/api';

type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

type UploadedFile = {
  _id: string;
  conversation_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  preview: {
    type: 'image' | 'pdf' | 'text' | 'binary';
    inline_url: string;
    text_excerpt?: string;
  };
  download_url: string;
  access_token: string;
};

type UseFileUploadReturn = {
  uploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
  uploadFile: (file: File, conversationId: string, accessToken: string) => Promise<UploadedFile>;
  clearError: () => void;
};

const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_UPLOAD_SIZE_LABEL = '8GB';

export function useFileUpload(): UseFileUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File, conversationId: string, accessToken: string) {
    setError(null);
    setUploading(true);
    setProgress({ loaded: 0, total: file.size, percentage: 0 });

    try {
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        throw new Error(`File size exceeds ${MAX_UPLOAD_SIZE_LABEL} limit`);
      }

      const formData = new FormData();
      formData.append('conversation_id', conversationId);
      formData.append('file', file);

      const response = await fetch(`${getApiUrl()}/api/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(payload.error || 'Upload failed');
      }

      const data = (await response.json()) as UploadedFile;
      setProgress({ loaded: file.size, total: file.size, percentage: 100 });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      throw err;
    } finally {
      setUploading(false);
      window.setTimeout(() => setProgress(null), 1500);
    }
  }

  function clearError() {
    setError(null);
  }

  return {
    uploading,
    progress,
    error,
    uploadFile,
    clearError,
  };
}
