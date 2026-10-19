import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildOperationDocument, lowerSelectionMap } from "#src/lib/documentBuilder.ts";

import type { OperationSelection } from "#src/lib/documentBuilder.ts";
import type { RuntimeFieldMap, RuntimeScalarFieldLists } from "#src/lib/fieldMap.ts";

const documentFieldMap: RuntimeFieldMap = {
  "Mutation.createTweet": { arguments: { body: "String" }, select: "Tweet" },
  "Mutation.markTweetRead": { arguments: { id: "ID!" } },
  "Query.Tweet": { arguments: { id: "ID!" }, select: "Tweet" },
  "Query.Tweets": { arguments: { limit: "Int", skip: "Int" }, select: "Tweet" },
  "Query.User": { arguments: { id: "ID!" }, select: "User" },
  "Tweet.Author": { select: "User" },
};

const documentScalarFieldLists: RuntimeScalarFieldLists = {
  Mutation: ["markTweetRead"],
  Tweet: ["body", "date", "id"],
  User: ["first_name", "last_name", "username"],
};

describe("Document Builder", () => {
  test("Scalar Expansion", () => {
    const builtOperation = buildOperationDocument(
      "query",
      "Query",
      lowerSelectionMap({ Tweets: { __args: { limit: 2 }, __scalar: true } }),
      documentFieldMap,
      documentScalarFieldLists,
    );

    assert.equal(
      builtOperation.document,
      ["query QueryTweets($limit: Int) {", "  Tweets(limit: $limit) {", "    body", "    date", "    id", "  }", "}"].join("\n"),
    );
    assert.deepEqual(builtOperation.variables, { limit: 2 });
    assert.equal(builtOperation.operationName, "QueryTweets");
  });

  test("Nested Selections", () => {
    const builtOperation = buildOperationDocument(
      "query",
      "Query",
      lowerSelectionMap({
        Tweet: { Author: { __scalar: true }, __args: { id: "tweet-1" }, __scalar: true },
      }),
      documentFieldMap,
      documentScalarFieldLists,
    );

    assert.equal(
      builtOperation.document,
      [
        "query QueryTweet($id: ID!) {",
        "  Tweet(id: $id) {",
        "    Author {",
        "      first_name",
        "      last_name",
        "      username",
        "    }",
        "    body",
        "    date",
        "    id",
        "  }",
        "}",
      ].join("\n"),
    );
    assert.deepEqual(builtOperation.variables, { id: "tweet-1" });
  });

  test("Repeated Argument Names", () => {
    const builtOperation = buildOperationDocument(
      "query",
      "Query",
      lowerSelectionMap({
        Tweet: { __args: { id: "tweet-1" }, __scalar: true },
        User: { __args: { id: "user-1" }, __scalar: true },
      }),
      documentFieldMap,
      documentScalarFieldLists,
    );

    assert.equal(
      builtOperation.document,
      [
        "query QueryTweetUser($id: ID!, $id_2: ID!) {",
        "  Tweet(id: $id) {",
        "    body",
        "    date",
        "    id",
        "  }",
        "  User(id: $id_2) {",
        "    first_name",
        "    last_name",
        "    username",
        "  }",
        "}",
      ].join("\n"),
    );
    assert.deepEqual(builtOperation.variables, { id: "tweet-1", id_2: "user-1" });
  });

  test("Explicit Field Wins Over Scalar Expansion", () => {
    const builtOperation = buildOperationDocument(
      "query",
      "Query",
      lowerSelectionMap({ Tweet: { __args: { id: "tweet-1" }, __scalar: true, body: true } }),
      documentFieldMap,
      documentScalarFieldLists,
    );

    assert.equal(
      builtOperation.document,
      ["query QueryTweet($id: ID!) {", "  Tweet(id: $id) {", "    body", "    date", "    id", "  }", "}"].join("\n"),
    );
    assert.equal(builtOperation.document.split("body").length - 1, 1);
  });

  test("Undefined Argument Values", () => {
    const builtOperation = buildOperationDocument(
      "query",
      "Query",
      lowerSelectionMap({ Tweets: { __args: { limit: undefined, skip: 2 }, __scalar: true } }),
      documentFieldMap,
      documentScalarFieldLists,
    );

    assert.equal(
      builtOperation.document,
      ["query QueryTweets($skip: Int) {", "  Tweets(skip: $skip) {", "    body", "    date", "    id", "  }", "}"].join("\n"),
    );
    assert.deepEqual(builtOperation.variables, { skip: 2 });
  });

  test("Structural Aliases", () => {
    const aliasedSelection: OperationSelection = [
      {
        alias: "feed",
        arguments: { limit: 1 },
        field: "Tweets",
        selection: [{ field: "body" }],
      },
      {
        alias: "viewer",
        arguments: { id: "user-1" },
        field: "User",
        selection: [{ field: "username" }],
      },
    ];

    const builtOperation = buildOperationDocument("query", "Query", aliasedSelection, documentFieldMap, documentScalarFieldLists);

    assert.equal(
      builtOperation.document,
      [
        "query QueryFeedViewer($limit: Int, $id: ID!) {",
        "  feed: Tweets(limit: $limit) {",
        "    body",
        "  }",
        "  viewer: User(id: $id) {",
        "    username",
        "  }",
        "}",
      ].join("\n"),
    );
    assert.deepEqual(builtOperation.variables, { id: "user-1", limit: 1 });
    assert.equal(builtOperation.operationName, "QueryFeedViewer");
  });

  test("Mutation Operation", () => {
    const builtOperation = buildOperationDocument(
      "mutation",
      "Mutation",
      lowerSelectionMap({ createTweet: { __args: { body: "hello" }, __scalar: true } }),
      documentFieldMap,
      documentScalarFieldLists,
    );

    assert.equal(
      builtOperation.document,
      ["mutation MutationCreateTweet($body: String) {", "  createTweet(body: $body) {", "    body", "    date", "    id", "  }", "}"].join("\n"),
    );
    assert.equal(builtOperation.operationName, "MutationCreateTweet");
  });

  test("Unknown Field", () => {
    assert.throws(() => buildOperationDocument("query", "Query", lowerSelectionMap({ Missing: true }), documentFieldMap, documentScalarFieldLists), {
      message: "field Missing does not exist on type Query",
    });
  });

  test("Missing Selection", () => {
    assert.throws(
      () =>
        buildOperationDocument("query", "Query", lowerSelectionMap({ Tweets: { __args: { limit: 1 } } }), documentFieldMap, documentScalarFieldLists),
      { message: "field Tweets on type Query requires a selection" },
    );
  });

  test("Unsupported Selection", () => {
    assert.throws(
      () =>
        buildOperationDocument(
          "query",
          "Query",
          lowerSelectionMap({ Tweet: { __args: { id: "tweet-1" }, body: { date: true } } }),
          documentFieldMap,
          documentScalarFieldLists,
        ),
      { message: "field body on type Tweet does not support a selection" },
    );
  });

  test("Unknown Argument", () => {
    assert.throws(
      () =>
        buildOperationDocument(
          "query",
          "Query",
          lowerSelectionMap({ Tweets: { __args: { unknownArgument: 1 }, __scalar: true } }),
          documentFieldMap,
          documentScalarFieldLists,
        ),
      { message: "field Tweets does not accept argument unknownArgument" },
    );
  });

  test("Empty Selection", () => {
    assert.throws(() => buildOperationDocument("query", "Query", [], documentFieldMap, documentScalarFieldLists), {
      message: "selection for Query is empty",
    });
  });

  test("Duplicate Field", () => {
    const duplicatedSelection: OperationSelection = [
      {
        arguments: { id: "tweet-1" },
        field: "Tweet",
        selection: [{ field: "body" }, { field: "body" }],
      },
    ];

    assert.throws(() => buildOperationDocument("query", "Query", duplicatedSelection, documentFieldMap, documentScalarFieldLists), {
      message: "field body is selected more than once on type Tweet",
    });
  });

  test("Duplicated Response Key", () => {
    const duplicatedSelection: OperationSelection = [
      { alias: "body", field: "Tweets", selection: [{ field: "body" }] },
      { alias: "body", field: "User", selection: [{ field: "username" }] },
    ];

    assert.throws(() => buildOperationDocument("query", "Query", duplicatedSelection, documentFieldMap, documentScalarFieldLists), {
      message: "response key body is selected more than once on type Query",
    });
  });

  test("Invalid Field Name", () => {
    assert.throws(() => lowerSelectionMap({ "not a field": true }), {
      message: "field name not a field is not a valid GraphQL name",
    });
  });

  test("Nested Alias", () => {
    const nestedAliasSelection: OperationSelection = [
      {
        arguments: { id: "tweet-1" },
        field: "Tweet",
        selection: [{ alias: "bodyAlias", field: "body" }],
      },
    ];

    assert.throws(() => buildOperationDocument("query", "Query", nestedAliasSelection, documentFieldMap, documentScalarFieldLists), {
      message: "alias bodyAlias is only supported on operation root fields",
    });
  });
});
