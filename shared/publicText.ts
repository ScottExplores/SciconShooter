const UNSAFE_PUBLIC_TEXT = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF<>]/g;

export const sanitizeSearchQuery = (value: string, maxLength = 80) => (
  value.replace(UNSAFE_PUBLIC_TEXT, '').slice(0, Math.max(0, maxLength))
);
