export interface AuthConfig { origin: string; rpID: string; bootstrapToken?: string }
export interface StoredPasskey {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface StoredSession {
  id: string;
  tokenHash: string;
  credentialId: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface StoredChallenge {
  challenge: string;
  purpose: "registration" | "login" | "recovery";
  actor: string;
  recoveryHash: string | null;
  expiresAt: number;
  generation: number;
}


export interface AuthStorePort {
  atomic<T>(operation: () => T): T;
  generation(): number;
  advanceGeneration(): void;
  getUserId(): Uint8Array;
  listPasskeys(): StoredPasskey[];
  getPasskey(id: string): StoredPasskey | null;
  savePasskey(value: Omit<StoredPasskey, "createdAt" | "lastUsedAt">): void;
  updateCounter(id: string, counter: number): void;
  saveChallenge(token: string, value: Omit<StoredChallenge, "generation"> & { generation?: number }): void;
  consumeChallenge(token: string, purpose: StoredChallenge["purpose"]): StoredChallenge | null;
  createSession(credentialId: string, label: string): { token: string; session: StoredSession };
  hasActiveSessionId(id: string): boolean;
  hasRecoveryCode(code: string): boolean;
  useRecoveryCode(hash: string): boolean;
  replaceRecoveryCodes(codes: string[]): void;
  deleteAllPasskeys(): void;
  revokeAllSessions(): void;
}
export interface AuthenticatorPort {
  token(): string;
  hash(value: string): string;
  equal(first: string, second: string): boolean;
  recoveryCodes(): string[];
  registrationOptions(config: AuthConfig, userId: Uint8Array, passkeys: StoredPasskey[]): Promise<{ challenge: string; [key: string]: unknown }>;
  loginOptions(config: AuthConfig, passkeys: StoredPasskey[]): Promise<{ challenge: string; [key: string]: unknown }>;
  verifyRegistration(response: unknown, challenge: string, config: AuthConfig): Promise<Omit<StoredPasskey, "createdAt" | "lastUsedAt" | "label"> | null>;
  verifyLogin(response: unknown, challenge: string, config: AuthConfig, passkey: StoredPasskey): Promise<number | null>;
}
