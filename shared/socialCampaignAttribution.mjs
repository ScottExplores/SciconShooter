const CAMPAIGN_VALUE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

const readCampaignValue = (params, key) => {
  const value = String(params.get(key) || '').trim();
  return CAMPAIGN_VALUE_PATTERN.test(value) ? value : null;
};

export const readSocialCampaignAttribution = (search = '') => {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const source = readCampaignValue(params, 'utm_source');
  const medium = readCampaignValue(params, 'utm_medium');
  if (source !== 'x' || medium !== 'social') return {};

  const campaign = readCampaignValue(params, 'utm_campaign');
  const content = readCampaignValue(params, 'utm_content');
  return {
    campaign_source: source,
    campaign_medium: medium,
    ...(campaign ? { campaign_name: campaign } : {}),
    ...(content ? { campaign_content: content } : {})
  };
};
