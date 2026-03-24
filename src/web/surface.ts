import type { WorldModel } from "../core/transform.js";

export type SurfaceType = "sand" | "grass" | "stone" | "generic";

export interface SurfaceProfile {
  surface: SurfaceType;
  groundColor: number;
  groundRoughness: number;
  bobIntensity: number;
  stepInterval: number;
}

const SURFACE_PROFILES: Record<SurfaceType, Omit<SurfaceProfile, "surface">> = {
  sand: { groundColor: 0x8a7d5a, groundRoughness: 0.98, bobIntensity: 0.7, stepInterval: 0.52 },
  grass: { groundColor: 0x2a3a20, groundRoughness: 0.92, bobIntensity: 0.5, stepInterval: 0.46 },
  stone: { groundColor: 0x3a3a40, groundRoughness: 0.85, bobIntensity: 1.0, stepInterval: 0.42 },
  generic: { groundColor: 0x1a1e28, groundRoughness: 0.94, bobIntensity: 0.6, stepInterval: 0.48 }
};

export function resolveSurfaceProfile(world: WorldModel): SurfaceProfile {
  const names = new Set(world.entities.map((e) => e.attributes.name));

  let surface: SurfaceType = "generic";

  if (names.has("beach") || names.has("ocean") || names.has("sea") || names.has("desert")) {
    surface = "sand";
  } else if (names.has("forest") || names.has("jungle") || names.has("garden") || names.has("field")) {
    surface = "grass";
  } else if (
    names.has("city") || names.has("castle") || names.has("ruins") || names.has("ruin") ||
    names.has("tower") || names.has("towers") || names.has("temple") || names.has("palace") ||
    names.has("street") || names.has("village")
  ) {
    surface = "stone";
  }

  return { surface, ...SURFACE_PROFILES[surface] };
}
