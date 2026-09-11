import { describe, expect, it, vi } from "vitest";
import { detectPasskeyCapabilities } from "@/application/auth/passkey-capabilities";

describe("detectPasskeyCapabilities", () => {
  it("blocks passkeys outside a secure context", async () => {
    const result = await detectPasskeyCapabilities({
      secureContext: false,
      publicKeyCredential: {},
    });

    expect(result).toMatchObject({
      secureContext: false,
      webAuthn: true,
      status: "blocked",
    });
  });

  it("reports a local user-verifying authenticator as ready", async () => {
    const result = await detectPasskeyCapabilities({
      secureContext: true,
      publicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
      },
    });

    expect(result).toEqual({
      secureContext: true,
      webAuthn: true,
      platformAuthenticator: true,
      conditionalMediation: true,
      status: "ready",
    });
  });

  it("keeps synced or external authenticators as an open possibility", async () => {
    const result = await detectPasskeyCapabilities({
      secureContext: true,
      publicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
      },
    });

    expect(result).toMatchObject({
      platformAuthenticator: false,
      conditionalMediation: null,
      status: "partial",
    });
  });
});
