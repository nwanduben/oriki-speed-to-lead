const assert = require('node:assert');
const { scoreLead } = require('./scoring');

const cases = [
  ['hot deposit-ready buyer, 30 days', { intent: 'buy', timeline: 'under_30_days', financing: 'deposit_ready', budget_in_range: true, in_service_area: true, decision_makers: 'all_aligned', has_agent: false }, 'hot'],
  ['hot diaspora investor paying outright', { intent: 'invest', timeline: '1_3_months', financing: 'outright', budget_in_range: true, in_service_area: true, decision_makers: 'all_aligned', has_agent: false }, 'hot'],
  ['hot motivated seller', { intent: 'sell', timeline: '1_3_months', seller_motivation: 'must_move', budget_in_range: true, in_service_area: true, decision_makers: 'all_aligned', has_agent: false }, 'hot'],
  ['warm buyer 3-6 months, mortgage in progress', { intent: 'buy', timeline: '3_6_months', financing: 'mortgage_in_progress', budget_in_range: true, in_service_area: true, decision_makers: 'needs_partner', has_agent: false }, 'warm'],
  ['high score but 3-6 months is warm, not hot', { intent: 'buy', timeline: '3_6_months', financing: 'outright', budget_in_range: true, in_service_area: true, decision_makers: 'all_aligned', has_agent: false }, 'warm'],
  ['cold browser', { intent: 'buy', timeline: '6_plus_months', financing: 'not_started', budget_in_range: null, in_service_area: true, decision_makers: 'unknown', has_agent: false }, 'cold'],
  ['already has an agent', { intent: 'buy', timeline: 'under_30_days', financing: 'outright', budget_in_range: true, in_service_area: true, decision_makers: 'all_aligned', has_agent: true }, 'cold'],
  ['out of area', { intent: 'buy', timeline: 'under_30_days', financing: 'outright', budget_in_range: true, in_service_area: false, decision_makers: 'all_aligned', has_agent: false }, 'cold'],
];

for (const [name, answers, expected] of cases) {
  const r = scoreLead(answers);
  assert.strictEqual(r.tier, expected, `${name}: got ${r.tier} (${r.score})`);
  console.log(`ok  ${name} -> ${r.tier} (${r.score})`);
}
