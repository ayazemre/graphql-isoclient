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

export type OperationError = Error & {
  errors: ReadonlyArray<OperationGraphqlError>;
  data: unknown;
};

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
  const responseRecord = readResponseRecord(responseText, operationResponse.status, endpoint);
  const operationErrors = readOperationErrors(responseRecord);

  if (operationErrors.length > 0) {
    throw createOperationError(operationErrors, readResponseData(responseRecord), endpoint, operationResponse.status);
  }

  if (operationResponse.status !== 200) {
    throw new Error(`GraphQL request failed with status ${operationResponse.status} for ${endpoint}`);
  }

  const responseData = readResponseData(responseRecord);

  if (responseData === null) {
    throw new Error(`GraphQL response did not contain data for ${endpoint}`);
  }

  return responseData;
}

function readResponseRecord(responseText: string, statusCode: number, endpoint: string): Record<string, unknown> {
  let responsePayload: unknown;

  try {
    responsePayload = JSON.parse(responseText);
  } catch (parseError) {
    throw new Error(`GraphQL response is not valid JSON with status ${statusCode} for ${endpoint}`, { cause: parseError });
  }

  if (!responsePayload || typeof responsePayload !== "object" || Array.isArray(responsePayload)) {
    throw new Error(`GraphQL response is not an object for ${endpoint}`);
  }

  return responsePayload as Record<string, unknown>;
}

export function createOperationError(
  operationErrors: ReadonlyArray<OperationGraphqlError>,
  responseData: unknown,
  endpoint: string,
  statusCode: number,
): OperationError {
  const firstErrorMessage = operationErrors[0]?.message ?? "unknown GraphQL error";
  const errorMessage =
    statusCode === 200
      ? `GraphQL request failed: ${firstErrorMessage}`
      : `GraphQL request failed with status ${statusCode} for ${endpoint}: ${firstErrorMessage}`;

  return Object.assign(new Error(errorMessage), { data: responseData, errors: operationErrors });
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
