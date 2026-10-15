import { useMutation, useQueryClient } from '@tanstack/react-query';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  if (!response.headers.get('content-type')?.toLowerCase().includes('json')) {
    throw new Error('The API returned a webpage instead of JSON. Check the deployment’s API routing or enable browser storage for this prototype.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || `Request failed (${response.status}).`);
  }
  try { return await response.json(); }
  catch { throw new Error('The API returned invalid JSON. Please try again or check the API deployment.'); }
}
export function useAction<T = void, TResult = unknown>(action: (variables: T) => Promise<TResult>) {
  const cache = useQueryClient();
  return useMutation({ mutationFn: action, onSuccess: () => cache.invalidateQueries() });
}
export function uploadPhoto(inspectionId: string, file: File, onProgress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(), data = new FormData();
    data.append('file', file);
    xhr.open('POST', `/api/inspections/${inspectionId}/photos`);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new Error('Network interrupted. Please retry the upload.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry.'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else { let message = 'Upload failed.'; try { message = JSON.parse(xhr.responseText).message || message; } catch { /* Preserve fallback for a proxy response. */ } reject(new Error(message)); }
    };
    xhr.send(data);
  });
}
