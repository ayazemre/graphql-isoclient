export type OperationGraphqlError = {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: Record<string, unknown>;
};

export type RequestOptions = {
  headers?: Record<string, string>;
  endpoint?: string;
  signal?: AbortSignal;
};

export type OperationRequest = {
  endpoint: string;
  headers: Record<string, string>;
  document: string;
  variables: Record<string, unknown>;
  operationName: string;
  signal?: AbortSignal;
};

export type SubscriptionTransport = {
  subscribe(operationRequest: OperationRequest): AsyncIterableIterator<unknown>;
};

export type IsoclientError = Error & {
  graphqlErrors: ReadonlyArray<OperationGraphqlError>;
  partialData: unknown;
};

export function createIsoclientError(
  errorMessage: string,
  graphqlErrors: ReadonlyArray<OperationGraphqlError>,
  partialData: unknown,
): IsoclientError {
  const createdError = new Error(errorMessage);
  createdError.name = "IsoclientError";
  return Object.assign(createdError, { graphqlErrors, partialData });
}

export function isIsoclientError(error: unknown): error is IsoclientError {
  return error instanceof Error && error.name === "IsoclientError";
}

export async function sendOperationRequest(operationRequest: OperationRequest): Promise<unknown> {
  const { endpoint, headers, document, variables, operationName, signal } = operationRequest;
  let operationResponse: Response;

  try {
    operationResponse = await fetch(endpoint, {
      body: JSON.stringify({ operationName, query: document, variables }),
      headers: { "content-type": "application/json", ...headers },
      method: "POST",
      signal,
    });
  } catch (requestError) {
    if (isAbortError(requestError)) {
      throw requestError;
    }

    throw new Error(`GraphQL request failed to reach ${endpoint}`, { cause: requestError });
  }

  const responseText = await operationResponse.text();
  let responsePayload: unknown;

  try {
    responsePayload = JSON.parse(responseText);
  } catch (parseError) {
    throw new Error(`GraphQL response is not valid JSON with status ${operationResponse.status} for ${endpoint}`, { cause: parseError });
  }

  if (!responsePayload || typeof responsePayload !== "object" || Array.isArray(responsePayload)) {
    throw new Error(`GraphQL response is not an object for ${endpoint}`);
  }

  const responseRecord = responsePayload as Record<string, unknown>;
  const operationErrors = readOperationErrors(responseRecord);

  if (operationErrors.length > 0) {
    throw createIsoclientError(operationErrors[0].message, operationErrors, responseRecord.data);
  }

  if (operationResponse.ok === false) {
    throw new Error(`GraphQL request failed with status ${operationResponse.status} for ${endpoint}`);
  }

  return responseRecord.data;
}

export function startSubscriptionStream(
  operationRequest: OperationRequest,
  subscriptionTransport: SubscriptionTransport | undefined,
): AsyncIterableIterator<unknown> {
  if (!subscriptionTransport || typeof subscriptionTransport.subscribe !== "function") {
    throw new Error("subscription requires a transport with a subscribe function");
  }

  const subscriptionIterator = subscriptionTransport.subscribe(operationRequest);

  if (!subscriptionIterator || typeof subscriptionIterator.next !== "function") {
    throw new Error("subscription transport subscribe must return an async iterable");
  }

  return subscriptionIterator;
}

function readOperationErrors(responseRecord: Record<string, unknown>): OperationGraphqlError[] {
  const errorsValue = responseRecord.errors;

  if (errorsValue === undefined || errorsValue === null) {
    return [];
  }

  if (Array.isArray(errorsValue) === false) {
    throw new Error("GraphQL response errors field is not an array");
  }

  return errorsValue.map((errorValue: unknown, errorIndex: number) => {
    if (!errorValue || typeof errorValue !== "object" || Array.isArray(errorValue)) {
      throw new Error(`GraphQL response error at index ${errorIndex} is not an object`);
    }

    const errorRecord = errorValue as Record<string, unknown>;

    if (typeof errorRecord.message !== "string") {
      throw new Error(`GraphQL response error at index ${errorIndex} has no message`);
    }

    const operationGraphqlError: OperationGraphqlError = { message: errorRecord.message };

    if (Array.isArray(errorRecord.path)) {
      operationGraphqlError.path = errorRecord.path as ReadonlyArray<string | number>;
    }

    if (
      errorRecord.extensions !== undefined &&
      typeof errorRecord.extensions === "object" &&
      errorRecord.extensions !== null &&
      Array.isArray(errorRecord.extensions) === false
    ) {
      operationGraphqlError.extensions = errorRecord.extensions as Record<string, unknown>;
    }

    return operationGraphqlError;
  });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError";
}
