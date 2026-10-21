export const runtimeSectionDefinitions: RuntimeSectionDefinition[] = [
  { fileName: "transport.ts" },
  { fileName: "documentBuilder.ts" },
  { fileName: "queryBuilder.ts" },
  { fileName: "subscriptionRuntime.ts", requiredRootType: "subscription" },
];

export type RuntimeSectionFileName = "transport.ts" | "documentBuilder.ts" | "queryBuilder.ts" | "subscriptionRuntime.ts";

export type RuntimeSectionRequirement = "query" | "mutation" | "subscription";

export type RuntimeSectionDefinition = {
  fileName: RuntimeSectionFileName;
  requiredRootType?: RuntimeSectionRequirement;
};
