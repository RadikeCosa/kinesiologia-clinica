export interface AgendaLease {
  owner: string;
  version: string;
  expiresAt: string;
}

export interface AgendaCoordinatorRepository {
  withLock<T>(operation: (lease: AgendaLease) => Promise<T>): Promise<T>;
}
