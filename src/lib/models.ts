import { z } from "zod/mini";

export type SchemaTypeReference =
  | { kind: "NON_NULL"; ofType: SchemaTypeReference }
  | { kind: "LIST"; ofType: SchemaTypeReference }
  | { kind: "NAME"; name: string };

export const schemaTypeReferenceSchema: z.ZodMiniType<SchemaTypeReference, SchemaTypeReference> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("NON_NULL"),
      ofType: schemaTypeReferenceSchema,
    }),
    z.strictObject({
      kind: z.literal("LIST"),
      ofType: schemaTypeReferenceSchema,
    }),
    z.strictObject({
      kind: z.literal("NAME"),
      name: z.string(),
    }),
  ]),
);

export const schemaEnumValueSchema = z.strictObject({
  deprecationReason: z.optional(z.string()),
  description: z.optional(z.string()),
  name: z.string(),
});

export const schemaArgumentSchema = z.strictObject({
  description: z.optional(z.string()),
  name: z.string(),
  typeReference: schemaTypeReferenceSchema,
});

export const schemaFieldSchema = z.strictObject({
  arguments: z.array(schemaArgumentSchema),
  deprecationReason: z.optional(z.string()),
  description: z.optional(z.string()),
  name: z.string(),
  typeReference: schemaTypeReferenceSchema,
});

export const schemaInputFieldSchema = z.strictObject({
  description: z.optional(z.string()),
  name: z.string(),
  typeReference: schemaTypeReferenceSchema,
});

export const schemaScalarTypeSchema = z.strictObject({
  description: z.optional(z.string()),
  kind: z.literal("SCALAR"),
  name: z.string(),
});

export const schemaEnumTypeSchema = z.strictObject({
  description: z.optional(z.string()),
  enumValues: z.array(schemaEnumValueSchema),
  kind: z.literal("ENUM"),
  name: z.string(),
});

export const schemaObjectTypeSchema = z.strictObject({
  description: z.optional(z.string()),
  fields: z.array(schemaFieldSchema),
  interfaces: z.array(z.string()),
  kind: z.literal("OBJECT"),
  name: z.string(),
});

export const schemaInterfaceTypeSchema = z.strictObject({
  description: z.optional(z.string()),
  fields: z.array(schemaFieldSchema),
  interfaces: z.array(z.string()),
  kind: z.literal("INTERFACE"),
  name: z.string(),
  possibleTypeNames: z.array(z.string()),
});

export const schemaUnionTypeSchema = z.strictObject({
  description: z.optional(z.string()),
  kind: z.literal("UNION"),
  name: z.string(),
  possibleTypeNames: z.array(z.string()),
});

export const schemaInputObjectTypeSchema = z.strictObject({
  description: z.optional(z.string()),
  inputFields: z.array(schemaInputFieldSchema),
  kind: z.literal("INPUT_OBJECT"),
  name: z.string(),
});

export const schemaTypeSchema = z.discriminatedUnion("kind", [
  schemaScalarTypeSchema,
  schemaEnumTypeSchema,
  schemaObjectTypeSchema,
  schemaInterfaceTypeSchema,
  schemaUnionTypeSchema,
  schemaInputObjectTypeSchema,
]);

export const schemaModelSchema = z.strictObject({
  mutationTypeName: z.optional(z.string()),
  queryTypeName: z.string(),
  subscriptionTypeName: z.optional(z.string()),
  types: z.array(schemaTypeSchema),
});

export type SchemaEnumValueModel = z.infer<typeof schemaEnumValueSchema>;
export type SchemaArgumentModel = z.infer<typeof schemaArgumentSchema>;
export type SchemaFieldModel = z.infer<typeof schemaFieldSchema>;
export type SchemaInputFieldModel = z.infer<typeof schemaInputFieldSchema>;
export type SchemaScalarTypeModel = z.infer<typeof schemaScalarTypeSchema>;
export type SchemaEnumTypeModel = z.infer<typeof schemaEnumTypeSchema>;
export type SchemaObjectTypeModel = z.infer<typeof schemaObjectTypeSchema>;
export type SchemaInterfaceTypeModel = z.infer<typeof schemaInterfaceTypeSchema>;
export type SchemaUnionTypeModel = z.infer<typeof schemaUnionTypeSchema>;
export type SchemaInputObjectTypeModel = z.infer<typeof schemaInputObjectTypeSchema>;
export type SchemaTypeModel = z.infer<typeof schemaTypeSchema>;
export type SchemaModel = z.infer<typeof schemaModelSchema>;

export const cliInputSchema = z.strictObject({
  outputPath: z.string().check(z.minLength(1)),
  schemaSource: z.string().check(z.minLength(1)),
});

export type CliInput = z.infer<typeof cliInputSchema>;
