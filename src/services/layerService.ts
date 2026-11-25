import { useState, useEffect, useCallback } from 'react';

export interface GisLayer {
  id: string;
  label: string;
  color: string;
  isDefault?: boolean;
}

export const DEFAULT_GIS_LAYERS: GisLayer[] = [
  { id: 'SUBSTATION', label: 'Substations', color: '#7C3AED', isDefault: true },
  { id: 'EHV_LINE', label: 'EHV Lines', color: '#DC2626', isDefault: true },
  { id: 'HV_LINE', label: 'HT Lines', color: '#F59E0B', isDefault: true },
  { id: 'DT', label: 'Power / Distribution Transformers', color: '#2563EB', isDefault: true },
  { id: 'LT_LINE', label: 'LT Lines', color: '#16A34A', isDefault: true },
  { id: 'POLE', label: 'Poles', color: '#475569', isDefault: true },
  { id: 'SMART_METER', label: 'Smart Meters', color: '#0891B2', isDefault: true },
];

export const PRESET_LAYER_COLORS = [
  '#7C3AED', // Violet
  '#DC2626', // Red
  '#F59E0B', // Amber
  '#2563EB', // Blue
  '#16A34A', // Green
  '#475569', // Slate
  '#0891B2', // Cyan
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#8B5CF6', // Purple
  '#6366F1', // Indigo
  '#E11D48', // Rose
  '#059669', // Emerald
];

const LAYERS_STORAGE_KEY = 'powergis_user_layers';
const LAYERS_CHANGE_EVENT = 'powergis:layers-changed';

export function getStoredLayers(): GisLayer[] {
  try {
    const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load stored GIS layers:', e);
  }
  return DEFAULT_GIS_LAYERS;
}

export function saveStoredLayers(layers: GisLayer[]): void {
  try {
    localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(layers));
    window.dispatchEvent(new CustomEvent(LAYERS_CHANGE_EVENT, { detail: layers }));
  } catch (e) {
    console.warn('Failed to save GIS layers:', e);
  }
}

export function addLayer(label: string, color: string, id?: string): GisLayer {
  const current = getStoredLayers();
  const cleanLabel = label.trim();
  const cleanId = (
    id ||
    cleanLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_') ||
    `LAYER_${Date.now()}`
  ).replace(/^_+|_+$/g, '');

  let uniqueId = cleanId;
  let counter = 1;
  while (current.some((l) => l.id === uniqueId)) {
    uniqueId = `${cleanId}_${counter++}`;
  }

  const newLayer: GisLayer = {
    id: uniqueId,
    label: cleanLabel || uniqueId,
    color: color || PRESET_LAYER_COLORS[current.length % PRESET_LAYER_COLORS.length],
    isDefault: false,
  };

  const updated = [...current, newLayer];
  saveStoredLayers(updated);
  return newLayer;
}

export function editLayer(id: string, newLabel: string, newColor?: string): GisLayer | null {
  const current = getStoredLayers();
  const index = current.findIndex((l) => l.id === id);
  if (index === -1) return null;

  const existing = current[index];
  const updatedLayer: GisLayer = {
    ...existing,
    label: newLabel.trim() || existing.label,
    color: newColor || existing.color,
  };

  const updated = [...current];
  updated[index] = updatedLayer;
  saveStoredLayers(updated);
  return updatedLayer;
}

export function deleteLayer(id: string): boolean {
  const current = getStoredLayers();
  const updated = current.filter((l) => l.id !== id);
  if (updated.length === current.length) return false;

  saveStoredLayers(updated);
  return true;
}

export function deleteAllLayers(): void {
  saveStoredLayers([]);
}

export function resetLayers(): GisLayer[] {
  saveStoredLayers(DEFAULT_GIS_LAYERS);
  return DEFAULT_GIS_LAYERS;
}

export function ensureLayer(label: string, color?: string, id?: string): GisLayer {
  const current = getStoredLayers();
  const cleanLabel = label.trim();
  const targetId = (
    id ||
    cleanLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_') ||
    `LAYER_${Date.now()}`
  ).replace(/^_+|_+$/g, '');

  const existing = current.find(
    (l) => l.id.toUpperCase() === targetId.toUpperCase() || l.label.toLowerCase() === cleanLabel.toLowerCase()
  );
  if (existing) {
    return existing;
  }

  return addLayer(
    cleanLabel || targetId,
    color || PRESET_LAYER_COLORS[current.length % PRESET_LAYER_COLORS.length],
    targetId
  );
}

export function filenameToLayerInfo(filename: string): { id: string; label: string } {
  const base = filename.replace(/\.[^/.]+$/, '').trim();
  const cleanLabel = base
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const titleCaseLabel = cleanLabel
    .split(' ')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
  const cleanId = base
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/^_+|_+$/g, '') || `LAYER_${Date.now()}`;
  return {
    id: cleanId,
    label: titleCaseLabel || cleanId,
  };
}

export function getLayerLabels(): Record<string, string> {
  const layers = getStoredLayers();
  return Object.fromEntries(layers.map((l) => [l.id, l.label]));
}

export function getLayerColors(): Record<string, string> {
  const layers = getStoredLayers();
  return Object.fromEntries(layers.map((l) => [l.id, l.color]));
}

export function useGisLayers() {
  const [layers, setLayers] = useState<GisLayer[]>(getStoredLayers);

  useEffect(() => {
    const handleUpdate = () => {
      setLayers(getStoredLayers());
    };
    window.addEventListener(LAYERS_CHANGE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(LAYERS_CHANGE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleAdd = useCallback((label: string, color: string, id?: string) => {
    const created = addLayer(label, color, id);
    setLayers(getStoredLayers());
    return created;
  }, []);

  const handleEdit = useCallback((id: string, newLabel: string, newColor?: string) => {
    const res = editLayer(id, newLabel, newColor);
    setLayers(getStoredLayers());
    return res;
  }, []);

  const handleDelete = useCallback((id: string) => {
    const res = deleteLayer(id);
    setLayers(getStoredLayers());
    return res;
  }, []);

  const handleDeleteAll = useCallback(() => {
    deleteAllLayers();
    setLayers([]);
  }, []);

  const handleEnsure = useCallback((label: string, color?: string, id?: string) => {
    const res = ensureLayer(label, color, id);
    setLayers(getStoredLayers());
    return res;
  }, []);

  const handleReset = useCallback(() => {
    const res = resetLayers();
    setLayers(res);
    return res;
  }, []);

  const layerLabels = Object.fromEntries(layers.map((l) => [l.id, l.label]));
  const layerColors = Object.fromEntries(layers.map((l) => [l.id, l.color]));

  return {
    layers,
    layerLabels,
    layerColors,
    addLayer: handleAdd,
    ensureLayer: handleEnsure,
    editLayer: handleEdit,
    deleteLayer: handleDelete,
    deleteAllLayers: handleDeleteAll,
    resetLayers: handleReset,
  };
}
