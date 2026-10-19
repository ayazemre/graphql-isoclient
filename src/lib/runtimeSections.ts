export const runtimeSectionFileNames = ["transport.ts", "documentBuilder.ts", "queryBuilder.ts"] as const;

export type RuntimeSectionFileName = (typeof runtimeSectionFileNames)[number];
