// Deterministic real-estate lead scoring.
// The voice agent only collects answers; this function decides the tier, so
// every score is reproducible and auditable. The same code is pasted into the
// n8n "Score lead" Code node (keep them in sync).

const TIMELINE = { under_30_days: 30, '1_3_months': 22, '3_6_months': 12, '6_plus_months': 3, unknown: 0 };
// Nigeria: most buyers pay outright or on a developer payment plan; mortgages/NHF are slower.
const FINANCING = { outright: 25, deposit_ready: 22, mortgage_in_progress: 12, not_started: 5, unknown: 0 };
const SELLER_MOTIVATION = { must_move: 25, already_bought: 25, upsizing_downsizing: 15, testing_market: 5, unknown: 0 };

function scoreLead(a) {
  const reasons = [];
  let score = 0;

  const t = TIMELINE[a.timeline] ?? 0;
  score += t;
  reasons.push(`timeline ${a.timeline} +${t}`);

  // Buyers are scored on financing, sellers on motivation; "both" takes the stronger.
  const fin = FINANCING[a.financing] ?? 0;
  const mot = SELLER_MOTIVATION[a.seller_motivation] ?? 0;
  const readiness = a.intent === 'sell' ? mot : (a.intent === 'buy' || a.intent === 'invest') ? fin : Math.max(fin, mot);
  score += readiness;
  reasons.push(`readiness +${readiness}`);

  const budget = a.budget_in_range === true ? 15 : a.budget_in_range === false ? 0 : 7;
  score += budget;
  reasons.push(`budget +${budget}`);

  const area = a.in_service_area === true ? 10 : 0;
  score += area;
  reasons.push(`area +${area}`);

  const decision = a.decision_makers === 'all_aligned' ? 10 : a.decision_makers === 'needs_partner' ? 5 : 0;
  score += decision;
  reasons.push(`decision makers +${decision}`);

  const agentFree = a.has_agent === false ? 10 : 0;
  score += agentFree;
  reasons.push(`no other agent +${agentFree}`);

  // Hard rules that override the number.
  let tier;
  if (a.has_agent === true) {
    tier = 'cold';
    reasons.push('already under contract with another agent -> cold');
  } else if (a.intent === 'rent' || a.in_service_area === false) {
    tier = 'cold';
    reasons.push('outside what the brokerage serves -> cold');
  } else if (score >= 70 && (a.timeline === 'under_30_days' || a.timeline === '1_3_months')) {
    tier = 'hot';
  } else if (score >= 40) {
    tier = 'warm';
  } else {
    tier = 'cold';
  }

  const next_action = {
    hot: 'Ask if they would like to speak with an agent right now. If yes, use transfer_to_number. If no, or the transfer fails, use book_consultation.',
    warm: 'Offer a site inspection (in person, or virtual by video call if they are abroad) and use book_consultation once they pick a time.',
    cold: 'Thank them, say the team will send estate details and payment plans on WhatsApp or email, and end the call politely.'
  }[tier];

  return { score, tier, next_action, reasons };
}

if (typeof module !== 'undefined') module.exports = { scoreLead };
