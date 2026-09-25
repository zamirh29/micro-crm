import * as SecureStore from 'expo-secure-store';

// iOS Keychain historically refuses values above ~2048 bytes, and a Supabase
// session JSON blob can approach that. Values larger than MAX are split into
// numbered parts; a "chunked:<n>" head in the base key marks the layout.
const MAX = 1500;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith('chunked:')) return head;
    const count = Number(head.slice('chunked:'.length));
    let out = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      out += part;
    }
    return out;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= MAX) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / MAX);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * MAX, (i + 1) * MAX));
    }
    // Head is written last so a partial write never looks complete.
    await SecureStore.setItemAsync(key, `chunked:${count}`);
  },

  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key);
    if (head?.startsWith('chunked:')) {
      const count = Number(head.slice('chunked:'.length));
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
    }
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
