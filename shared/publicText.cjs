const UNSAFE_PUBLIC_TEXT = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF<>]/g;

const stripUnsafePublicText = (value) => (
  typeof value === 'string' ? value.replace(UNSAFE_PUBLIC_TEXT, '') : ''
);

const sanitizeSearchQuery = (value, maxLength = 80) => (
  stripUnsafePublicText(value).slice(0, Math.max(0, maxLength))
);

const sanitizePilotName = (value) => {
  const name = stripUnsafePublicText(value).replace(/\s+/g, ' ').trim().slice(0, 15).trim();
  return name ? name.toUpperCase() : undefined;
};

module.exports = {
  stripUnsafePublicText,
  sanitizeSearchQuery,
  sanitizePilotName
};
