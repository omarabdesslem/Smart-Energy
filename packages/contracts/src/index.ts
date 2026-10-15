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
  assigned_to: z.string().trim().min(2).max(120).default('Local reviewer'),
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
export type Inspection = { id: string; site_id: string; title: string; assigned_to: string; notes: string; status: 'draft' | 'completed'; created_at: string; site_name: string; customer: string; location: string; capacity_kw: number; photo_count: number; finding_count: number; pending_count: number; open_count: number; is_demo: boolean; checklist: Checklist };
export type Finding = { id: string; photo_id: string; label: typeof labels[number]; box: Box; notes: string; source: 'manual' | 'demo' | 'model'; score: number | null; model_version: string | null; decision: 'accepted' | 'rejected' | null; priority: typeof priorities[number] | null; review_notes: string | null; reviewer: string | null; reviewed_at: string | null; resolved: boolean; resolution_notes: string };
export type Photo = { id: string; inspection_id: string; filename: string; width: number; height: number; is_demo: boolean; created_at: string; findings: Finding[] };
export type InspectionDetail = Inspection & { photos: Photo[] };
export type Dashboard = { sites: number; inspections: number; pending: number; completed: number; recent: Inspection[] };

export const roofColumns = 10;
export const roofRows = 3;
export const roofSlotCount = roofColumns * roofRows;
export const roofColors = {
  red: { label: 'Red', hex: '#a7473e' },
  green: { label: 'Green', hex: '#4c7057' },
  orange: { label: 'Orange', hex: '#c47b3c' },
  'dark-grey': { label: 'Dark grey', hex: '#575757' },
} as const;
export type RoofColor = keyof typeof roofColors;
export const designInput = z.object({
  name: z.string().trim().min(2).max(120),
  customer: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200),
  panels: z.array(z.number().int().min(0).max(roofSlotCount - 1)).max(roofSlotCount).refine(items => new Set(items).size === items.length, 'Each roof section may contain only one panel.'),
  panelWatts: z.union([z.literal(450), z.literal(475)]),
  roofColor: z.enum(['red', 'green', 'orange', 'dark-grey']).default('dark-grey'),
  revision: z.number().int().min(0),
});
export type DesignInput = z.infer<typeof designInput>;
export type Design = DesignInput & { updatedAt: string | null };
export const initialDesign: Design = {
  name: 'The modern home', customer: 'Alex Morgan', address: 'Residential solar project',
  panels: [13, 14, 15, 16, 23, 24, 25, 26],
  panelWatts: 450, roofColor: 'dark-grey', revision: 0, updatedAt: null,
};
// Editable concept design: these are illustrative proposal assumptions, not a site simulation.
export function designSummary(design: Pick<DesignInput, 'panels' | 'panelWatts'>) {
  const count = design.panels.length;
  const capacity = count * design.panelWatts / 1000;
  const moduleUnitPrice = design.panelWatts === 450 ? 175 : 195;
  const modules = count * moduleUnitPrice;
  const inverter = count ? 1500 : 0;
  const installation = count ? 2000 + count * 70 : 0;
  return { count, capacity, annualYield: Math.round(capacity * 950), modules, moduleUnitPrice, inverter, installation, total: modules + inverter + installation };
}
