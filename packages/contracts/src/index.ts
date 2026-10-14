import { z } from 'zod';

export const labels = ['Visible damage', 'Soiling', 'Discoloration', 'Installation issue', 'Other'] as const;
export const priorities = ['low', 'medium', 'high'] as const;
export const siteInput = z.object({
  name: z.string().trim().min(2).max(120),
  customer: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(200),
  capacity_kw: z.number().positive().max(100000),
});
export const inspectionInput = z.object({
  site_id: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  notes: z.string().trim().max(2000).default(''),
});
export const boxInput = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).refine(b => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001, 'Box must stay within the image');
export const findingInput = z.object({ label: z.enum(labels), box: boxInput, notes: z.string().trim().max(2000).default('') });
export const reviewInput = z.object({
  decision: z.enum(['accepted', 'rejected']),
  priority: z.enum(priorities),
  notes: z.string().trim().max(2000).default(''),
});
export type Box = z.infer<typeof boxInput>;
export type Site = z.infer<typeof siteInput> & { id: string; inspection_count: number; open_count: number };
export const checklistInput = z.object({ photos: z.boolean(), components: z.boolean(), handover: z.boolean() });
export const checklistLabels = { photos: 'Installation photos documented', components: 'Components and workmanship checked', handover: 'Customer handover prepared' } as const;
export type Checklist = z.infer<typeof checklistInput>;
export type Inspection = { id: string; site_id: string; title: string; notes: string; status: 'draft' | 'completed'; created_at: string; site_name: string; customer: string; location: string; capacity_kw: number; photo_count: number; finding_count: number; pending_count: number; open_count: number; is_demo: boolean; checklist: Checklist };
export type Finding = { id: string; photo_id: string; label: typeof labels[number]; box: Box; notes: string; source: 'manual' | 'demo' | 'model'; score: number | null; model_version: string | null; decision: 'accepted' | 'rejected' | null; priority: typeof priorities[number] | null; review_notes: string | null; reviewer: string | null; reviewed_at: string | null; resolved: boolean; resolution_notes: string };
export type Photo = { id: string; inspection_id: string; filename: string; width: number; height: number; is_demo: boolean; created_at: string; findings: Finding[] };
export type InspectionDetail = Inspection & { photos: Photo[] };
export type Dashboard = { sites: number; inspections: number; pending: number; completed: number; recent: Inspection[] };
