const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
});

const hasSupabaseConfig = () => {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
};

const supabaseUrl = (path) => {
  const { url } = getSupabaseConfig();
  if (!url) throw new Error('SUPABASE_URL is not configured.');
  return `${url.replace(/\/$/, '')}/rest/v1/${path}`;
};

const supabaseHeaders = (extraHeaders = {}) => {
  const { key } = getSupabaseConfig();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
};

const fetchSupabaseJson = async (path, options = {}) => {
  const response = await fetch(supabaseUrl(path), options);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase request failed with ${response.status}: ${details}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

module.exports = {
  fetchSupabaseJson,
  getSupabaseConfig,
  hasSupabaseConfig,
  supabaseHeaders,
  supabaseUrl
};
