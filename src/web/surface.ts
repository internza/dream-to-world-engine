import type { WorldModel } from "../core/transform.js";

export type SurfaceType = "sand" | "grass" | "stone" | "ice" | "mud" | "marble" | "crystal" | "void" | "generic";

export interface SurfaceProfile {
  surface: SurfaceType;
  groundColor: number;
  groundRoughness: number;
  bobIntensity: number;
  stepInterval: number;
}

const SURFACE_PROFILES: Record<SurfaceType, Omit<SurfaceProfile, "surface">> = {
  sand:    { groundColor: 0xc8a86a, groundRoughness: 0.98, bobIntensity: 0.7, stepInterval: 0.52 },
  grass:   { groundColor: 0x2e4820, groundRoughness: 0.92, bobIntensity: 0.5, stepInterval: 0.46 },
  stone:   { groundColor: 0x454850, groundRoughness: 0.88, bobIntensity: 1.0, stepInterval: 0.42 },
  ice:     { groundColor: 0x9ab8cc, groundRoughness: 0.12, bobIntensity: 0.3, stepInterval: 0.38 },
  mud:     { groundColor: 0x3a2818, groundRoughness: 0.98, bobIntensity: 0.9, stepInterval: 0.58 },
  marble:  { groundColor: 0x8c8c8a, groundRoughness: 0.28, bobIntensity: 0.8, stepInterval: 0.40 },
  crystal: { groundColor: 0x283a4e, groundRoughness: 0.08, bobIntensity: 0.6, stepInterval: 0.44 },
  void:    { groundColor: 0x080810, groundRoughness: 1.0,  bobIntensity: 0.2, stepInterval: 0.50 },
  generic: { groundColor: 0x1e2230, groundRoughness: 0.94, bobIntensity: 0.6, stepInterval: 0.48 }
};

export function resolveSurfaceProfile(world: WorldModel): SurfaceProfile {
  const names = new Set(world.entities.map((e) => e.attributes.name));
  const scene = world.sceneType ?? "generic";

  let surface: SurfaceType = "generic";

  // 18E: Scene-type-driven surface selection (higher priority than name matching)
  switch (scene) {
    case "beach": case "desert": surface = "sand"; break;
    case "frozen": surface = "ice"; break;
    case "forest": surface = "grass"; break;
    case "cave": surface = "crystal"; break;
    case "temple": case "interior": case "arena": surface = "marble"; break;
    case "city": surface = "stone"; break;
    case "mountain": surface = "stone"; break;
    case "ocean": surface = "sand"; break;
    case "surreal": surface = "void"; break;
    case "sky": surface = "void"; break;
    default: break; // fall through to name-based matching
  }

  // Name-based override for edge cases not captured by sceneType
  if (surface === "generic") {
    if (names.has("beach") || names.has("ocean") || names.has("sea") || names.has("desert") || names.has("oasis")) {
      surface = "sand";
    } else if (names.has("glacier") || names.has("tundra") || names.has("frozen")) {
      surface = "ice";
    } else if (names.has("marsh") || names.has("swamp") || names.has("bog")) {
      surface = "mud";
    } else if (names.has("temple") || names.has("palace") || names.has("library") || names.has("arena")) {
      surface = "marble";
    } else if (names.has("cave") || names.has("crypt") || names.has("crystal") || names.has("dungeon")) {
      surface = "crystal";
    } else if (names.has("space") || names.has("dreamscape") || names.has("realm") || names.has("void")) {
      surface = "void";
    } else if (names.has("forest") || names.has("jungle") || names.has("garden") || names.has("field")) {
      surface = "grass";
    } else if (
      names.has("city") || names.has("castle") || names.has("ruins") || names.has("ruin") ||
      names.has("tower") || names.has("towers") || names.has("street") || names.has("village")
    ) {
      surface = "stone";
    }
  }

  return { surface, ...SURFACE_PROFILES[surface] };
}
