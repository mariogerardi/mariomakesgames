export type GridlChapter = {
  id: string;
  name: string;
  levelIds: readonly string[];
};

export const gridlChapters: readonly GridlChapter[] = [
  {
    id: "tutorial",
    name: "Tutorial",
    levelIds: ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110"],
  },
  {
    id: "basics",
    name: "Basics",
    levelIds: ["111", "112", "113", "114", "115"],
  },
  {
    id: "building-blocks",
    name: "Building Blocks",
    levelIds: ["123", "127"],
  },
  {
    id: "singles",
    name: "Singles",
    levelIds: ["301", "302", "303", "304", "305", "306", "307", "308", "309", "310"],
  },
  {
    id: "portals",
    name: "Portals",
    levelIds: ["411", "412", "413", "414"],
  },
] as const;

export const gridlLevelIds = gridlChapters.flatMap(
  (chapter) => chapter.levelIds,
);

export function chapterForGridlLevel(levelId: string) {
  return gridlChapters.find((chapter) => chapter.levelIds.includes(levelId));
}
