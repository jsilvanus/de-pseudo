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
    this.state = await createEncryptedVault(data);
    return data;
  }

  async update(data: T): Promise<T> {
    if (!this.state) return this.create(data);
    this.state = await persistVault({ key: this.state.key, data });
    return data;
  }

  async restore(): Promise<T | null> {
    this.state = await restorePersistedVault<T>();
    return this.state?.data ?? null;
  }

  async shred(): Promise<void> {
    this.state = await cryptoshred(this.state);
  }
}
