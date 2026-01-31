# Union Chant Revenue Models

## Guiding Principle

**Free creation, paid control.** Anyone can start a deliberation. Revenue comes from people and organizations who need more control, visibility, and insight.

The platform's value comes from participation volume. Anything that gates participation kills the product. Revenue must come from the supply side (creators/facilitators) or from amplification, never from voters.

---

## Do

### Tier 1: Premium Facilitator Tools (Near-term, SaaS)

The manage page is the product. Free tier gets basic controls. Paid tier gets:

| Feature | Free | Pro ($15/mo) | Org ($50/mo) |
|---------|------|-------------|--------------|
| Create deliberations | Yes | Yes | Yes |
| Basic controls (start voting, force complete) | Yes | Yes | Yes |
| Voting timer customization | Default only | Full control | Full control |
| Release extra votes | No | Yes | Yes |
| Real-time analytics dashboard | No | Yes | Yes |
| Export results (PDF/CSV/JSON) | JSON only | All formats | All formats |
| Custom branding / remove "Union Chant" | No | No | Yes |
| Participant cap | 100 | 10,000 | Unlimited |
| Private deliberations | 1 | Unlimited | Unlimited |
| API access | No | Read-only | Full CRUD |
| Priority cell assignment | No | No | Yes |
| SSO / custom auth | No | No | Yes |

This is the most predictable revenue stream. Organizations running governance (unions, HOAs, school boards, DAOs, corporate feedback) will pay for reliable tooling.

### Tier 2: Promoted Deliberations (Scale)

Organizations pay to surface their deliberation in the feed. This is aligned with the platform's purpose -- getting more participation.

- "Sponsored" tag, shown in For You feed
- Pay per impression or per participant
- Must be real deliberations (no pure ads)
- Good for: brands doing customer feedback, politicians doing constituent input, NGOs doing community decisions

### Tier 3: Creator Analytics (Scale)

Deep funnel data for facilitators:

- View-to-join conversion rate
- Join-to-vote completion rate
- Drop-off analysis by tier
- Idea submission quality metrics
- Time-of-day engagement patterns
- Demographic breakdown (opt-in)
- Sentiment analysis of comments
- Comparative analytics across deliberations

### Tier 4: Enterprise / Governance-as-a-Service

White-label deployment for large organizations:

- Custom domain (decisions.yourcompany.com)
- SSO integration (Okta, SAML, Azure AD)
- Audit logs and compliance features
- Dedicated infrastructure
- SLA guarantees
- Custom cell sizes and voting rules
- Integration with existing tools (Slack, Teams, email)

---

## Don't

### Never gate participation
- No "pay to vote" or "pay to submit ideas"
- No premium-only deliberations that exclude free users from voting
- No "pay for more votes" -- this is democracy, not an auction
- Free users must always be able to participate in public deliberations

### Never sell user data
- Voting patterns are sacred. Never sell individual voting data to third parties
- Aggregate, anonymized research data is acceptable with clear consent
- No ad targeting based on voting behavior

### Never show traditional ads in the feed
- No banner ads, no interstitials, no pre-roll
- Promoted deliberations are acceptable because they ARE the product
- Ads misalign incentives -- the platform optimizes for engagement, not decisions

### Never charge per-deliberation for basic use
- Creating a deliberation must always be free
- The network effect depends on high content supply
- Charging to create kills the flywheel before it starts

### Never compromise vote integrity for revenue
- No "premium" vote weighting
- No paying to see results before they're public
- No paying to influence cell assignment or idea ordering

---

## Facilitator Tools Roadmap

### Already Built
- Start/stop voting controls
- Force complete current round
- Release extra votes
- Voting timer customization
- Idea goal settings
- Public/private toggle
- Invite members (link + email)
- Active cells overview with vote counts
- Ideas by status breakdown
- Up-pollinated comments view
- Export (PDF/CSV/JSON)

### Priority Builds (Pro tier)

**1. Real-time Analytics Dashboard**
The single most valuable paid feature. Facilitators need to understand what's happening in their deliberation.

Must-have metrics:
- Live participation funnel: Views > Joins > Ideas Submitted > Votes Cast
- Voting velocity: votes per minute by tier
- Cell completion rate and time-to-complete
- Idea health: which ideas are consistently winning vs. losing across cells
- Comment engagement: total comments, upvote rate, up-pollination rate
- Participant retention: % who return for tier 2, tier 3, etc.

Nice-to-have:
- Agreement score distribution (how consensual is each cell?)
- Prediction accuracy aggregate (how predictable are outcomes?)
- Time-series charts for all metrics
- Comparison across deliberations

**2. Scheduled Actions**
- Schedule voting start (e.g., "start voting Monday 9am")
- Schedule challenge rounds
- Auto-release extra votes when X% of cells complete
- Reminder notifications at custom intervals

**3. Participant Management**
- View participant list with engagement stats
- Ban/remove participants
- Assign roles (co-facilitator, observer)
- Waitlist management for private deliberations

**4. Custom Voting Rules**
- Configurable cell size (3, 5, 7 people)
- Ranked choice within cells (instead of single vote)
- Minimum discussion time before voting
- Required comment before vote
- Anonymous vs. attributed voting

**5. Results Presentation**
- Auto-generated summary report
- Shareable results page with OG image
- "Decision rationale" -- aggregate comments that supported the winner
- Timeline view: how the winner emerged through tiers

**6. Notification Controls**
- Custom notification templates
- Email digest frequency
- Webhook integrations (Slack, Discord, Teams)
- SMS notifications for critical events

### Enterprise Builds (Org tier)

**7. Multi-deliberation Campaigns**
- Run a series of related deliberations
- Results from one feed into the next
- Cross-deliberation analytics

**8. Compliance & Audit**
- Full vote audit trail
- Data retention policies
- GDPR data export/deletion
- Role-based access control

**9. API & Integrations**
- REST API for all operations
- Webhook events for real-time integration
- Embeddable widget for external sites
- SDK for custom implementations
