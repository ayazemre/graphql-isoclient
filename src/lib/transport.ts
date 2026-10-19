export type OperationGraphqlError = {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: Record<string, unknown>;
  [fieldName: string]: unknown;
};

export type RequestOptions = {
  headers?: Record<string, string>;
  endpoint?: string;
  signal?: AbortSignal;
};

export type ClientConfig = {
  endpoint: string | undefined;
  headers: Record<string, string>;
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

export type OperationResult<Data = unknown> = {
  data: Data | null;
  errors: ReadonlyArray<OperationGraphqlError>;
};

export async function sendOperationRequest(operationRequest: OperationRequest): Promise<OperationResult> {
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

  if (operationResponse.status !== 200) {
    throw new Error(`GraphQL request failed with status ${operationResponse.status} for ${endpoint}`);
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

  return { data: readResponseData(responseRecord), errors: readOperationErrors(responseRecord) };
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

function readResponseData(responseRecord: Record<string, unknown>): unknown {
  const dataValue = responseRecord.data;

  if (dataValue === undefined || dataValue === null) {
    return null;
  }

  return dataValue;
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

    return errorRecord as OperationGraphqlError;
  });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError";
}
