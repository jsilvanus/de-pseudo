import {
  createEncryptedVault,
  cryptoshred,
  persistVault,
  restorePersistedVault,
  type VaultState,
} from './cryptoshred';

/** Application-facing boundary for sensitive local session state. */
export class SessionVault<T> {
  private state: VaultState<T> | null = null;

  get active(): boolean { return this.state !== null; }
  get data(): T | null { return this.state?.data ?? null; }
  get generation(): string | null { return this.state?.generation ?? null; }

  async create(data: T): Promise<T> {
    const next = await createEncryptedVault(data);
    this.state = next;
    return data;
  }

  /** A failed write leaves the previous active generation untouched. */
  async update(data: T): Promise<T> {
    if (!this.state) return this.create(data);
    const next = await persistVault({ key: this.state.key, data, generation: this.state.generation });
    this.state = next;
    return data;
  }

  /** Restore only an authenticated payload with its stored generation metadata. */
  async restore(): Promise<T | null> {
    try {
      const restored = await restorePersistedVault<T>();
      this.state = restored;
      return restored?.data ?? null;
    } catch {
      this.state = null;
      return null;
    }
  }

  async shred(): Promise<void> {
    await cryptoshred(this.state);
    this.state = null;
  }
}
