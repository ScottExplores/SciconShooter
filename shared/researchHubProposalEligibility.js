const createResearchHubProposalEligibility = () => {
  const toTimestamp = (value) => {
    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : Date.parse(String(value || ''));

    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const isFundingDeadlineAfter = (deadline, requiredOpenUntil) => {
    const deadlineTime = toTimestamp(deadline);
    const cutoffTime = toTimestamp(requiredOpenUntil);
    return deadlineTime !== null && cutoffTime !== null && deadlineTime > cutoffTime;
  };

  return { isFundingDeadlineAfter };
};

const researchHubProposalEligibility = createResearchHubProposalEligibility();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = researchHubProposalEligibility;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__SCICON_RESEARCHHUB_PROPOSAL_ELIGIBILITY__ = researchHubProposalEligibility;
}
