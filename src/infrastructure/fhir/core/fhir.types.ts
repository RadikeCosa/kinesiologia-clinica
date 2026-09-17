export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: { versionId?: string; lastUpdated?: string };
}

export interface FhirBundleEntry<
  TResource extends FhirResource = FhirResource,
> {
  fullUrl?: string;
  resource?: TResource;
  request?: {
    method: "PUT" | "POST";
    url: string;
    ifMatch?: string;
  };
  response?: { status?: string; location?: string; etag?: string };
}

export interface FhirBundle<
  TResource extends FhirResource = FhirResource,
> {
  resourceType: "Bundle";
  type?: string;
  total?: number;
  entry?: Array<FhirBundleEntry<TResource>>;
  link?: Array<{ relation?: string; url?: string }>;
}

export interface FhirOperationOutcome extends FhirResource {
  resourceType: "OperationOutcome";
  issue?: Array<{
    severity?: string;
    code?: string;
    diagnostics?: string;
  }>;
}
