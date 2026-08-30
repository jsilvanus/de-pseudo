import { describe, expect, it } from 'vitest';
import { loadClipboardText, loadFile } from './loadDataset';

describe('loadClipboardText', () => {
  it('parses tab-separated text by default', async () => {
    const text = 'username\tpreference\nAlice\tpizza';
    expect(await loadClipboardText(text)).toEqual([{ username: 'Alice', preference: 'pizza' }]);
  });

  it('parses comma-separated text when csv is requested', async () => {
    const text = 'username,preference\nAlice,pizza';
    expect(await loadClipboardText(text, 'csv')).toEqual([{ username: 'Alice', preference: 'pizza' }]);
  });

  it('does not misread a comma inside a value as a tsv delimiter', async () => {
    // Historically this parser guessed the delimiter from the text, which
    // could misfire on data like this; an explicit format must not.
    const text = 'username\taddress\nAlice\t"Springfield, Apt 2"';
    expect(await loadClipboardText(text, 'tsv')).toEqual([{ username: 'Alice', address: 'Springfield, Apt 2' }]);
  });

  it('handles a quoted field containing the csv delimiter and an escaped quote', async () => {
    const text = 'username,note\nAlice,"Says ""hi"", bye"';
    expect(await loadClipboardText(text, 'csv')).toEqual([{ username: 'Alice', note: 'Says "hi", bye' }]);
  });

  it('detects a pasted JSON array regardless of the chosen delimiter format', async () => {
    const text = '[{"username":"Alice","preference":"pizza"}]';
    expect(await loadClipboardText(text, 'csv')).toEqual([{ username: 'Alice', preference: 'pizza' }]);
  });

  it('returns an empty array for blank input', async () => {
    expect(await loadClipboardText('')).toEqual([]);
    expect(await loadClipboardText('   ')).toEqual([]);
  });

  it('names a blank header cell positionally', async () => {
    const text = ',preference\nAlice,pizza';
    expect(await loadClipboardText(text, 'csv')).toEqual([{ 'Column 1': 'Alice', preference: 'pizza' }]);
  });
});

describe('loadFile', () => {
  function csvFile(content: string, name = 'people.csv') {
    return new File([content], name, { type: 'text/csv' });
  }

  it('parses a CSV file with quoted fields', async () => {
    const file = csvFile('username,note\nAlice,"Smith, Jr."\nBob,plain');
    expect(await loadFile(file)).toEqual([
      { username: 'Alice', note: 'Smith, Jr.' },
      { username: 'Bob', note: 'plain' },
    ]);
  });

  it('rejects an unsupported file type', async () => {
    const file = new File(['hello'], 'notes.txt.exe', { type: 'application/octet-stream' });
    await expect(loadFile(file)).rejects.toThrow(/Unsupported file/);
  });
});
