import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  schemaArgumentSchema,
  schemaEnumTypeSchema,
  schemaEnumValueSchema,
  schemaFieldSchema,
  schemaInputFieldSchema,
  schemaInputObjectTypeSchema,
  schemaInterfaceTypeSchema,
  schemaModelSchema,
  schemaObjectTypeSchema,
  schemaScalarTypeSchema,
  schemaTypeReferenceSchema,
  schemaTypeSchema,
  schemaUnionTypeSchema,
} from "#src/lib/models.ts";

export function modelsTests() {
  return describe("Models", function () {
    test("Type Reference Name", () => {
      const result = schemaTypeReferenceSchema.safeParse({ kind: "NAME", name: "String" });
      assert.equal(result.success, true);
    });

    test("Type Reference Non Null", () => {
      const result = schemaTypeReferenceSchema.safeParse({ kind: "NON_NULL", ofType: { kind: "NAME", name: "String" } });
      assert.equal(result.success, true);
    });

    test("Type Reference List", () => {
      const result = schemaTypeReferenceSchema.safeParse({ kind: "LIST", ofType: { kind: "NAME", name: "String" } });
      assert.equal(result.success, true);
    });

    test("Type Reference Malformed", () => {
      const result = schemaTypeReferenceSchema.safeParse({ kind: "NAME" });
      assert.equal(result.success, false);
    });

    test("Enum Value", () => {
      const result = schemaEnumValueSchema.safeParse({ name: "ACTIVE" });
      assert.equal(result.success, true);
    });

    test("Enum Value Malformed", () => {
      const result = schemaEnumValueSchema.safeParse({ description: "x" });
      assert.equal(result.success, false);
    });

    test("Argument", () => {
      const result = schemaArgumentSchema.safeParse({ name: "limit", typeReference: { kind: "NAME", name: "Int" } });
      assert.equal(result.success, true);
    });

    test("Argument Malformed", () => {
      const result = schemaArgumentSchema.safeParse({ name: "limit" });
      assert.equal(result.success, false);
    });

    test("Field", () => {
      const result = schemaFieldSchema.safeParse({
        arguments: [],
        name: "id",
        typeReference: { kind: "NON_NULL", ofType: { kind: "NAME", name: "ID" } },
      });
      assert.equal(result.success, true);
    });

    test("Field Malformed", () => {
      const result = schemaFieldSchema.safeParse({ name: "id" });
      assert.equal(result.success, false);
    });

    test("Input Field", () => {
      const result = schemaInputFieldSchema.safeParse({ name: "title", typeReference: { kind: "NAME", name: "String" } });
      assert.equal(result.success, true);
    });

    test("Input Field Malformed", () => {
      const result = schemaInputFieldSchema.safeParse({ name: "title" });
      assert.equal(result.success, false);
    });

    test("Scalar Type", () => {
      const result = schemaScalarTypeSchema.safeParse({ kind: "SCALAR", name: "String" });
      assert.equal(result.success, true);
    });

    test("Scalar Type Malformed", () => {
      const result = schemaScalarTypeSchema.safeParse({ kind: "SCALAR" });
      assert.equal(result.success, false);
    });

    test("Enum Type", () => {
      const result = schemaEnumTypeSchema.safeParse({ enumValues: [{ name: "A" }], kind: "ENUM", name: "Status" });
      assert.equal(result.success, true);
    });

    test("Enum Type Malformed", () => {
      const result = schemaEnumTypeSchema.safeParse({ kind: "ENUM", name: "Status" });
      assert.equal(result.success, false);
    });

    test("Object Type", () => {
      const result = schemaObjectTypeSchema.safeParse({ fields: [], interfaces: [], kind: "OBJECT", name: "User" });
      assert.equal(result.success, true);
    });

    test("Object Type Malformed", () => {
      const result = schemaObjectTypeSchema.safeParse({ kind: "OBJECT", name: "User" });
      assert.equal(result.success, false);
    });

    test("Interface Type", () => {
      const result = schemaInterfaceTypeSchema.safeParse({
        fields: [],
        interfaces: [],
        kind: "INTERFACE",
        name: "Node",
        possibleTypeNames: [],
      });
      assert.equal(result.success, true);
    });

    test("Interface Type Malformed", () => {
      const result = schemaInterfaceTypeSchema.safeParse({ kind: "INTERFACE", name: "Node" });
      assert.equal(result.success, false);
    });

    test("Union Type", () => {
      const result = schemaUnionTypeSchema.safeParse({ kind: "UNION", name: "SearchResult", possibleTypeNames: ["User", "Post"] });
      assert.equal(result.success, true);
    });

    test("Union Type Malformed", () => {
      const result = schemaUnionTypeSchema.safeParse({ kind: "UNION", name: "SearchResult" });
      assert.equal(result.success, false);
    });

    test("Input Object Type", () => {
      const result = schemaInputObjectTypeSchema.safeParse({ inputFields: [], kind: "INPUT_OBJECT", name: "CreateUserInput" });
      assert.equal(result.success, true);
    });

    test("Input Object Type Malformed", () => {
      const result = schemaInputObjectTypeSchema.safeParse({ kind: "INPUT_OBJECT", name: "CreateUserInput" });
      assert.equal(result.success, false);
    });

    test("Type Schema Scalar", () => {
      const result = schemaTypeSchema.safeParse({ kind: "SCALAR", name: "String" });
      assert.equal(result.success, true);
    });

    test("Type Schema Malformed", () => {
      const result = schemaTypeSchema.safeParse({ kind: "UNKNOWN", name: "X" });
      assert.equal(result.success, false);
    });

    test("Schema Model", () => {
      const result = schemaModelSchema.safeParse({ queryTypeName: "Query", types: [] });
      assert.equal(result.success, true);
    });

    test("Schema Model Malformed", () => {
      const result = schemaModelSchema.safeParse({ types: [] });
      assert.equal(result.success, false);
    });
  });
}
