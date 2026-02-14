import { normalizeText, purgeEmoji } from '@/modules/imports/application/utils/normalize';

describe('purgeEmoji helper', () => {
  it('removes emojis and collapses whitespace', () => {
    expect(purgeEmoji(' João 😀 😃 ')).toBe('João');
    expect(purgeEmoji('hello 😂  world')).toBe('hello world');
  });

  it('returns null when only emojis are provided', () => {
    expect(purgeEmoji('😀😃')).toBeNull();
    expect(purgeEmoji('   😁   ')).toBeNull();
  });

  it('chains with normalizeText to trim and collapse values', () => {
    const input = '  😎  Ana Maria  😊 ';
    expect(normalizeText(purgeEmoji(input))).toBe('Ana Maria');
  });
});
