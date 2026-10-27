const { getPublicPrizeState } = require('../shared/weeklyCompetitionBoundary.js');
const { loadEligibleRfps } = require('./_lib/researchHubRfps');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const rfps = await loadEligibleRfps({
      requiredOpenUntil: getPublicPrizeState().proposalOpenUntil
    });
    return sendJson(res, 200, {
      source: 'researchhub-grant-feed',
      funding: 'manual-record-only',
      rfps
    });
  } catch (error) {
    console.error('ResearchHub RFP feed failed:', error);
    return sendJson(res, error.statusCode || 502, {
      error: 'Open ResearchHub RFPs could not be loaded.'
    });
  }
};
