export type FhirErrorKind = "http" | "network" | "timeout";

export class FhirClientError extends Error {
  readonly kind: FhirErrorKind;
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly safeMessage: string;

  constructor(input: {
    kind: FhirErrorKind;
    method: string;
    path: string;
    status?: number;
    message: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "FhirClientError";
    this.kind = input.kind;
    this.method = input.method;
    this.path = input.path;
    this.status = input.status;
    this.safeMessage = "No se pudo acceder al servidor clínico en este momento.";
  }
}
