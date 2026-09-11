export interface FhirResource {
  resourceType: string;
  id?: string;
}

export interface FhirBundleEntry<
  TResource extends FhirResource = FhirResource,
> {
  fullUrl?: string;
  resource?: TResource;
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
