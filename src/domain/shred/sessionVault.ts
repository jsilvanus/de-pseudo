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

  get active(): boolean {
    return this.state !== null;
  }

  get data(): T | null {
    return this.state?.data ?? null;
  }

  async create(data: T): Promise<T> {
    const next = await createEncryptedVault(data);
    this.state = next;
    return data;
  }

  /**
   * Persist a complete replacement atomically from the application's point of view.
   * If encryption/storage fails, the previous in-memory state remains usable.
   */
  async update(data: T): Promise<T> {
    if (!this.state) return this.create(data);
    const next = await persistVault({ key: this.state.key, data });
    this.state = next;
    return data;
  }

  /**
   * Restore only when both the encrypted payload and its key are available and
   * authenticated decryption succeeds. Any failure leaves this vault inactive.
   */
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

  /** Clear local persistence first; only then release the active key reference. */
  async shred(): Promise<void> {
    await cryptoshred(this.state);
    this.state = null;
  }
}
