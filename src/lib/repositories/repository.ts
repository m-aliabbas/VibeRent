export type RepositoryErrorCode = "conflict" | "not_found" | "unavailable" | "validation";

export type RepositoryError = {
  code: RepositoryErrorCode;
  message: string;
  field?: string;
};

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RepositoryError };

export interface EntityRepository<T extends { id: string }> {
  list(): Promise<RepositoryResult<T[]>>;
  getById(id: string): Promise<RepositoryResult<T>>;
  save(entity: T): Promise<RepositoryResult<T>>;
  remove(id: string): Promise<RepositoryResult<{ id: string }>>;
}
