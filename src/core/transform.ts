export type EntityType = "place" | "object" | "descriptor" | "unknown";
export type RelationType = "modifies" | "located_in" | "above";

export interface WorldEntity {
  id: string;
  type: EntityType;
  attributes: { name: string };
}

export interface WorldModel {
  entities: WorldEntity[];
  relationships: WorldRelation[];
}

export interface WorldRelation {
  id: string;
  type: RelationType;
  from: string;
  to: string;
}

const STOPWORDS = new Set([
  "i",
  "am",
  "is",
  "are",
  "was",
  "were",
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "at",
  "in",
  "on",
  "of",
  "to",
  "with",
  "above",
  "below"
]);

export function normalizeDream(dream: string): string {
  return dream
    .toLowerCase()
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not");
}

export function tokenizeDream(dream: string): string[] {
  const normalized = normalizeDream(dream);
  const matches = normalized.match(/[a-z]+/g);
  if (!matches) return [];

  return matches.filter((word) => !STOPWORDS.has(word));
}

export function classifyWord(word: string): EntityType {
  const places = [
    "beach",
    "city",
    "forest",
    "desert",
    "ocean",
    "mountain",
    "space",
    "room",
    "street",
    "house",
    "clouds"
  ];
  const objects = [
    "tower",
    "towers",
    "ship",
    "car",
    "door",
    "tree",
    "trees",
    "building",
    "buildings"
  ];
  const descriptors = [
    "floating",
    "jacked",
    "dark",
    "bright",
    "glowing",
    "ruined",
    "ancient",
    "futuristic",
    "glass"
  ];

  if (places.includes(word)) return "place";
  if (objects.includes(word)) return "object";
  if (descriptors.includes(word)) return "descriptor";

  return "unknown";
}

export function transformDreamToWorld(dream: string): WorldModel {
  const normalized = normalizeDream(dream);
  const allTokens = normalized.match(/[a-z]+/g) ?? [];
  const tokens = allTokens.filter((word) => !STOPWORDS.has(word));
  const entities: WorldEntity[] = [];
  const seen = new Set<string>();
  const entityByName = new Map<string, WorldEntity>();

  tokens.forEach((word) => {
    if (seen.has(word)) return;
    seen.add(word);
    const entity: WorldEntity = {
      id: `entity_${entities.length + 1}`,
      type: classifyWord(word),
      attributes: { name: word }
    };

    entities.push(entity);
    entityByName.set(word, entity);
  });

  const relationships: WorldRelation[] = [];

  const findNearestEntity = (startIndex: number, direction: -1 | 1) => {
    for (let i = startIndex; i >= 0 && i < allTokens.length; i += direction) {
      const entity = entityByName.get(allTokens[i]);
      if (entity && (entity.type === "place" || entity.type === "object")) {
        return entity;
      }
    }

    return undefined;
  };

  allTokens.forEach((word, index) => {
    if (classifyWord(word) === "descriptor") {
      const next = allTokens[index + 1];
      const from = entityByName.get(word);
      const to = next ? entityByName.get(next) : undefined;

      if (from && to && (to.type === "place" || to.type === "object")) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "modifies",
          from: from.id,
          to: to.id
        });
      }
    }

    if (word === "above") {
      const from = findNearestEntity(index - 1, -1);
      const to = findNearestEntity(index + 1, 1);

      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "above",
          from: from.id,
          to: to.id
        });
      }
    }

    if (word === "in" || word === "at") {
      const from = findNearestEntity(index - 1, -1);
      const to = findNearestEntity(index + 1, 1);

      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "located_in",
          from: from.id,
          to: to.id
        });
      }
    }
  });

  return { entities, relationships };
}
