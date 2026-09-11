export type PasskeyCapabilityResult = {
  secureContext: boolean;
  webAuthn: boolean;
  platformAuthenticator: boolean | null;
  conditionalMediation: boolean | null;
  status: "ready" | "partial" | "blocked";
};

export type PasskeyCapabilityRuntime = {
  secureContext: boolean;
  publicKeyCredential?: {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    isConditionalMediationAvailable?: () => Promise<boolean>;
  };
};

export async function detectPasskeyCapabilities(
  runtime: PasskeyCapabilityRuntime,
): Promise<PasskeyCapabilityResult> {
  const publicKeyCredential = runtime.publicKeyCredential;
  const webAuthn = publicKeyCredential !== undefined;

  if (!runtime.secureContext || !publicKeyCredential) {
    return {
      secureContext: runtime.secureContext,
      webAuthn,
      platformAuthenticator: null,
      conditionalMediation: null,
      status: "blocked",
    };
  }

  const platformAuthenticator = publicKeyCredential
    .isUserVerifyingPlatformAuthenticatorAvailable
    ? await publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    : null;
  const conditionalMediation = publicKeyCredential.isConditionalMediationAvailable
    ? await publicKeyCredential.isConditionalMediationAvailable()
    : null;

  return {
    secureContext: true,
    webAuthn: true,
    platformAuthenticator,
    conditionalMediation,
    status: platformAuthenticator ? "ready" : "partial",
  };
}
