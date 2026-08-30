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
  /** Stable random identifier for this encrypted session; never derived from personal data. */
  get sessionId(): string | null { return this.state?.generation ?? null; }

  async create(data: T): Promise<T> {
    const next = await createEncryptedVault(data);
    this.state = next;
    return data;
  }

  async update(data: T): Promise<T> {
    if (!this.state) return this.create(data);
    const next = await persistVault({ key: this.state.key, data, generation: this.state.generation });
    this.state = next;
    return data;
  }

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
