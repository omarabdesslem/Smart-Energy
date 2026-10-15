import { designInput, type Design } from '@energy/contracts';
import { api } from './api';

export const usesBrowserStorage = import.meta.env.VITE_DESIGN_STORAGE === 'browser';
const storageKey = 'r-studio:solar-design:v1';

function readBrowserDesign(): Design | null {
  let stored: string | null;
  try { stored = window.localStorage.getItem(storageKey); }
  catch { throw new Error('Browser storage is unavailable. Allow this site to store data to save your design.'); }
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored);
    const design = designInput.parse(value);
    if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Invalid saved date');
    return { ...design, updatedAt: value.updatedAt };
  } catch {
    throw new Error('The saved design in this browser could not be read. Clear this site’s saved data and reload.');
  }
}

export async function loadDesign(): Promise<Design | null> {
  return usesBrowserStorage ? readBrowserDesign() : api<Design | null>('/design');
}

export async function saveDesign(design: Design): Promise<Design> {
  if (!usesBrowserStorage) return api<Design>('/design', { method: 'PUT', body: JSON.stringify(design) });
  const current = readBrowserDesign();
  if ((current?.revision || 0) !== design.revision) throw new Error('This design changed in another tab. Reload the latest saved design before saving.');
  const saved = { ...designInput.parse(design), revision: design.revision + 1, updatedAt: new Date().toISOString() };
  try { window.localStorage.setItem(storageKey, JSON.stringify(saved)); }
  catch { throw new Error('Your design could not be saved in this browser. Allow site storage or free some browser storage space and try again.'); }
  return saved;
}
