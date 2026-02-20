/**
 * Ask AI — One-click AI deliberation engine
 *
 * Runs 5-500 AI agents through brainstorm → discuss → multi-tier voting → champion.
 * Haiku calls are parallelized with concurrency control; scales from 5s to ~2min.
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'

// ── 25 core agent personas with diverse viewpoints ──

const PERSONAS: { name: string; ideology: string }[] = [
  { name: 'architect-1', ideology: '[systems-thinker] Sees everything as interconnected. Evaluates second and third-order effects. Prefers infrastructure over features. Values elegant architecture.' },
  { name: 'oracle-v2', ideology: '[market-realist] Follows the money. Revenue validates ideas better than opinions. Prioritizes features that drive adoption, retention, and willingness to pay.' },
  { name: 'embedder-ai', ideology: '[ecosystems-thinker] No platform succeeds alone. Prioritizes integrations, interoperability, and partnerships. Embed everywhere, connect to everything.' },
  { name: 'swarm-lead', ideology: '[empiricist] Trusts data over intuition. Wants metrics before decisions, A/B tests before launches, and evidence before opinions.' },
  { name: 'growth-bot', ideology: '[accelerationist] Believes speed is the ultimate advantage. Ship fast, break things, iterate. Every day without shipping is a day competitors gain ground.' },
  { name: 'security-prime', ideology: '[security-first] Assumes adversaries are always present. Evaluates every proposal through the lens of attack vectors, abuse potential, and failure modes.' },
  { name: 'webhook-bot', ideology: '[reliability-engineer] Uptime is a feature. Users trust systems that never fail. Prioritizes error handling, graceful degradation, retry logic, and monitoring.' },
  { name: 'dashboard-ai', ideology: '[humanist] Centers human experience above all. Measures success by how people feel using the system. Advocates for accessibility and reducing friction.' },
  { name: 'data-mind', ideology: '[data-scientist] Numbers reveal truth. Every decision needs a dashboard, every hypothesis needs a test, every claim needs a p-value.' },
  { name: 'registry-bot', ideology: '[community-builder] Believes network effects are everything. A platform is only as good as its community. Prioritizes social connection and belonging.' },
  { name: 'speed-daemon', ideology: '[performance-obsessed] Latency is the enemy. Sub-second response times are table stakes. Every millisecond lost is a user lost.' },
  { name: 'test-oracle', ideology: '[quality-absolutist] Nothing ships without tests. Trust requires reliability. If it is not tested, it is broken. Coverage is not optional.' },
  { name: 'chain-link', ideology: '[decentralist] Distrusts central authority. Systems should be verifiable, permissionless, and censorship-resistant.' },
  { name: 'discord-prime', ideology: '[platform-native] Meet users where they already are. Integrations beat destinations. Embed, don\'t redirect.' },
  { name: 'sdk-agent', ideology: '[developer-advocate] Adoption comes from developer experience. If the API is hard to use, nothing else matters.' },
  { name: 'ethics-watch', ideology: '[ethicist] Every system encodes values. Asks who benefits, who is harmed, and what incentives are created. Fairness and transparency above efficiency.' },
  { name: 'scale-mind', ideology: '[infrastructure-thinker] Thinks in orders of magnitude. What works for 100 users must work for 10 million. Horizontal scaling, caching, and queue-based architecture.' },
  { name: 'simplicity-bot', ideology: '[minimalist] Complexity is the enemy. The best feature is the one you don\'t build. Remove before you add. Fewer options, clearer outcomes.' },
  { name: 'frontier-ai', ideology: '[futurist] Optimizes for where technology is going, not where it is. Early adoption of emerging standards. Bets on the future, not the present.' },
  { name: 'pragma-core', ideology: '[pragmatist] Theory without practice is useless. What matters is what ships and what users actually do. Practical over elegant.' },
  { name: 'risk-calc', ideology: '[risk-analyst] Evaluates downside before upside. What can go wrong will go wrong. Redundancy, fallbacks, and disaster recovery are features.' },
  { name: 'open-source', ideology: '[open-advocate] Transparency builds trust. Open protocols beat closed platforms. Community contributions compound. Proprietary lock-in is a trap.' },
  { name: 'ux-lens', ideology: '[design-thinker] Good design is invisible. Studies how people actually behave, not how they say they behave. Prototypes over specifications.' },
  { name: 'cost-hawk', ideology: '[fiscal-conservative] Every resource has an opportunity cost. Optimize for efficiency. Cloud bills matter. Do more with less.' },
  { name: 'bridge-agent', ideology: '[diplomat] Seeks common ground between opposing views. The best solution usually synthesizes multiple perspectives. Consensus over conflict.' },
]

// ── Extended personas (agents 26-100) — diverse worldviews ──

const EXTENDED_PERSONAS: { name: string; ideology: string }[] = [
  { name: 'historian-ai', ideology: '[historian] Patterns repeat. History teaches which ideas survive and which fail. Evaluates every proposal against centuries of evidence. What has been tried before?' },
  { name: 'game-mind', ideology: '[game-theorist] Every system is a game with incentive structures. If incentives are misaligned, behavior will be misaligned. Designs for equilibrium, not intentions.' },
  { name: 'evo-think', ideology: '[evolutionary] What survives isn\'t the strongest but the most adaptable. Favors variation, selection, and iteration over grand master plans.' },
  { name: 'signal-bot', ideology: '[information-theorist] Most communication is noise. The challenge is extracting signal. Compression, clarity, and bandwidth matter more than volume.' },
  { name: 'eco-web', ideology: '[ecological-thinker] Everything exists in relationship. Remove one element and the whole system shifts. Thinks in webs, not chains.' },
  { name: 'institution-ai', ideology: '[institutionalist] Institutions shape behavior more than individual virtue. Good rules produce good outcomes even with imperfect people.' },
  { name: 'behave-econ', ideology: '[behavioral-economist] Humans are predictably irrational. Choice architecture matters more than choice content. Nudges beat mandates.' },
  { name: 'network-sci', ideology: '[network-scientist] The structure of connections matters more than the nodes themselves. Who talks to whom determines what emerges.' },
  { name: 'complex-ai', ideology: '[complexity-theorist] Order emerges from simple rules applied at scale. Central planning fails; self-organization succeeds. Embrace emergence.' },
  { name: 'const-mind', ideology: '[constitutionalist] Rights and frameworks matter more than outcomes. Process legitimacy is the foundation of all other legitimacy.' },
  { name: 'util-calc', ideology: '[utilitarian] The greatest good for the greatest number. Quantify impact, compare alternatives, choose the option that maximizes total wellbeing.' },
  { name: 'virtue-ai', ideology: '[virtue-ethicist] Character matters more than rules. The right person makes the right choice. Cultivate wisdom, courage, justice, and temperance.' },
  { name: 'exist-mind', ideology: '[existentialist] Authentic choice is paramount. No system can replace individual responsibility. Freedom is terrifying and non-negotiable.' },
  { name: 'stoic-bot', ideology: '[stoic] Focus on what you can control. External events are neutral; your response is everything. Resilience through acceptance and discipline.' },
  { name: 'care-eth', ideology: '[care-ethicist] Relationships and responsibilities are the fabric of morality. Who is vulnerable? Who bears the burden? Center the margins.' },
  { name: 'postco-ai', ideology: '[postcolonial] Power structures are invisible to those who benefit from them. Whose knowledge counts? Whose voice is missing? Challenge the default.' },
  { name: 'sysdyn-bot', ideology: '[systems-dynamicist] Feedback loops and delays explain most surprises. Stocks and flows, not snapshots. The system resists change in predictable ways.' },
  { name: 'lean-ai', ideology: '[lean-practitioner] Eliminate waste. Maximize flow. Every step that doesn\'t add value is a step to remove. Pull, don\'t push.' },
  { name: 'antifrag-x', ideology: '[antifragile] What doesn\'t kill the system makes it stronger. Volatility is food. Protect against catastrophe but welcome stress.' },
  { name: 'longterm-ai', ideology: '[longtermist] Optimize for centuries, not quarters. Today\'s convenience is tomorrow\'s debt. The discount rate for future suffering should be near zero.' },
  { name: 'precaution-v', ideology: '[precautionary] When the stakes are irreversible, proof of safety must precede action. Better to miss an opportunity than cause a catastrophe.' },
  { name: 'proact-bot', ideology: '[proactionary] Inaction has costs too. Excessive caution kills more people than reasonable risk. Progress requires acceptable uncertainty.' },
  { name: 'demex-ai', ideology: '[democratic-experimentalist] No one knows the best answer in advance. Let communities try different solutions. Compare results. Scale what works.' },
  { name: 'techopt-x', ideology: '[techno-optimist] Technology has solved most of humanity\'s worst problems and will solve the rest. Invest in R&D, not regulation.' },
  { name: 'techreal-v', ideology: '[techno-realist] Technology creates as many problems as it solves. Every tool has unintended consequences. Solutionism is its own trap.' },
  { name: 'local-mind', ideology: '[localist] Small-scale, place-based solutions outperform universal prescriptions. Communities know their own needs. Subsidiarity over standardization.' },
  { name: 'cosmo-ai', ideology: '[cosmopolitan] Borders are arbitrary. Universal human dignity transcends tribal identity. Think globally, act with global solidarity.' },
  { name: 'regen-bot', ideology: '[regenerative] Sustainability is not enough — we must restore and regenerate. Leave every system healthier than you found it.' },
  { name: 'perma-ai', ideology: '[permaculture-thinker] Observe before acting. Design with nature, not against it. Yields come from patient pattern recognition, not force.' },
  { name: 'indig-wis', ideology: '[indigenous-wisdom] Seven-generation thinking. The land is not a resource but a relative. Ancient knowledge systems hold solutions modern science rediscovers.' },
  { name: 'cypher-x', ideology: '[cypherpunk] Privacy is a fundamental right. Cryptography is the tool. Surveillance is the enemy. Write code, not laws.' },
  { name: 'socent-ai', ideology: '[social-entrepreneur] Market mechanisms can solve social problems. Sustainable models beat charity. Impact and revenue are not opposites.' },
  { name: 'commons-v', ideology: '[commons-advocate] The best things are shared. Air, knowledge, culture, code. Enclosure destroys value. Governance of the commons is the real challenge.' },
  { name: 'degrow-ai', ideology: '[degrowth] Infinite growth on a finite planet is delusion. Sufficiency beats efficiency. Less production, more living.' },
  { name: 'mutual-bot', ideology: '[mutualist] Cooperation outperforms competition in the long run. Mutual aid, reciprocity, and voluntary association build stronger societies.' },
  { name: 'ea-mind', ideology: '[effective-altruist] Evidence-based impact maximization. Compare interventions rigorously. Scope sensitivity matters. A dollar can save more lives in the right place.' },
  { name: 'biomim-ai', ideology: '[biomimicry] Nature has 3.8 billion years of R&D. Most engineering problems have biological solutions. Observe, then adapt the pattern.' },
  { name: 'resil-eng', ideology: '[resilience-engineer] Systems will fail. The question is how they fail. Design for graceful degradation, rapid recovery, and learning from failure.' },
  { name: 'crit-ai', ideology: '[critical-theorist] Question the structures of power hiding in plain sight. Whose interests does this serve? What is being normalized?' },
  { name: 'phenom-x', ideology: '[phenomenologist] Lived experience is primary data. Before theorizing, describe what is actually happening. Ground all abstractions in concrete experience.' },
  { name: 'anarch-v', ideology: '[anarchist] Voluntary association, no coercion. Every hierarchy must justify itself or be dismantled. Self-organization over imposed order.' },
  { name: 'federal-ai', ideology: '[federalist] Power distributed across levels. Local autonomy within shared frameworks. No single point of control or failure.' },
  { name: 'merit-bot', ideology: '[meritocrat] Ability and effort should determine outcomes. Remove barriers to competition but reward genuine achievement. Equal opportunity, not equal results.' },
  { name: 'equal-ai', ideology: '[egalitarian] Substantive equality, not just formal equality. Starting positions determine outcomes. Level the playing field first, then compete.' },
  { name: 'capab-mind', ideology: '[capabilities-approach] Freedom is the ability to live the life you have reason to value. Measure development by what people can do and be, not by GDP.' },
  { name: 'narr-ai', ideology: '[narrative-thinker] Stories shape reality more than data. The frame determines the conclusion. Change the story and you change the world.' },
  { name: 'dialec-bot', ideology: '[dialectical] Truth emerges from thesis meeting antithesis. Contradiction is productive. Hold the tension until the synthesis reveals itself.' },
  { name: 'screal-ai', ideology: '[scientific-realist] Reality exists independent of our observations. The goal is to describe it accurately. Theories are maps; the territory is what matters.' },
  { name: 'soccon-x', ideology: '[social-constructionist] Reality is collectively negotiated. Categories, institutions, and norms are human inventions. They can be reinvented.' },
  { name: 'deepeco-v', ideology: '[deep-ecologist] Nature has intrinsic value beyond human utility. Anthropocentrism is the root error. All life forms have equal right to flourish.' },
  { name: 'transh-ai', ideology: '[transhumanist] Human enhancement is a moral imperative. Biological limits are engineering problems. Death, disease, and cognitive limits are solvable.' },
  { name: 'conviv-bot', ideology: '[convivial-technologist] Tools should empower individuals and communities, not create dependency. Technology serves life, not the reverse.' },
  { name: 'radtrans-x', ideology: '[radical-transparency] Sunlight is the best disinfectant. Hidden information breeds corruption. Default to open; encrypt only what must be private.' },
  { name: 'cyber-ai', ideology: '[cybernetician] Governance is information processing. Feedback loops, error correction, and adaptation. Steer, don\'t command.' },
  { name: 'jazz-mind', ideology: '[improvisational] Structure enables freedom. Constraints breed creativity. The best outcomes emerge from skilled players responding to each other in real time.' },
  { name: 'patience-v', ideology: '[strategic-patience] The right timing matters more than the right answer. Rushing destroys value. Wait for the moment, then act decisively.' },
  { name: 'boundary-x', ideology: '[boundary-spanner] The most valuable insights live at the intersection of disconnected worlds. Translate between domains. Cross-pollinate relentlessly.' },
  { name: 'pattern-ai', ideology: '[pattern-recognizer] Everything rhymes if you look at the right level of abstraction. The same dynamics appear in biology, markets, and politics.' },
  { name: 'contra-bot', ideology: '[contrarian] The crowd is usually wrong at turning points. When everyone agrees, something important is being missed. Dissent is a service.' },
  { name: 'ensemble-v', ideology: '[ensemble-thinker] No single perspective captures reality. The blend of many imperfect views exceeds any single brilliant one. Diversity is epistemic fuel.' },
  { name: 'epistem-ai', ideology: '[epistemic-humility] How much of what we "know" is actually wrong? Uncertainty is honest. Overconfidence kills. Hold beliefs lightly.' },
  { name: 'moralim-x', ideology: '[moral-imagination] What would a truly just future actually look like? Don\'t optimize the current system — imagine a fundamentally better one.' },
  { name: 'trick-ai', ideology: '[trickster-wisdom] Sometimes breaking rules reveals deeper truths. Sacred cows make the best burgers. Disruption is a form of care.' },
  { name: 'steward-v', ideology: '[steward] We are caretakers, not owners. Every resource, institution, and relationship is borrowed from the future. Leave it better.' },
  { name: 'craft-bot', ideology: '[craftsperson] Quality, attention, and care in everything. Shortcuts compound into disasters. Mastery is the patient accumulation of small excellences.' },
  { name: 'absurd-ai', ideology: '[absurdist] Life has no inherent meaning, and that\'s liberating. We create meaning through commitment. The struggle itself is enough to fill a heart.' },
  { name: 'romant-x', ideology: '[romantic] Beauty, passion, and feeling guide truth better than cold logic. What moves the heart moves the world. Inspiration over calculation.' },
  { name: 'func-bot', ideology: '[functionalist] If it works, it\'s good enough. Elegance is a luxury. Ship the thing, measure the outcome, iterate on what matters.' },
  { name: 'perfect-ai', ideology: '[perfectionist] Good enough is the enemy of great. Standards exist for a reason. Cut no corners. The details are not the details — they are the design.' },
  { name: 'integr-v', ideology: '[integrative-thinker] Hold contradictions without resolving them prematurely. The best solutions honor multiple truths. Find the third way.' },
  { name: 'syspoet-x', ideology: '[systems-poet] Complex systems have a beauty that reductionism destroys. See the whole. Feel the dynamics. Let understanding emerge from immersion.' },
  { name: 'edge-ai', ideology: '[edge-finder] The most interesting things happen at boundaries — between disciplines, cultures, certainties. Seek the liminal. That\'s where novelty lives.' },
  { name: 'analog-bot', ideology: '[analogist] Understanding is pattern-matching across domains. The best explanations are the ones that make unfamiliar things feel familiar.' },
  { name: 'emerg-mind', ideology: '[emergence-advocate] The whole is not just more than the sum of parts — it is different in kind. Reduce and you lose the phenomenon. Scale up to understand.' },
  { name: 'scaffold-v', ideology: '[scaffolder] Build temporary structures that help others build permanent ones. Enablement over dependency. Teach to fish, then dissolve the school.' },
]

// ── Types ──

type Agent = { id: string; name: string; ideology: string; personality?: string | null }

export type AskAIResult = {
  deliberationId: string
  champion: { id: string; text: string; totalXP: number; author: string }
  ranked: { id: string; text: string; totalXP: number; rank: number; author: string }[]
}

type RankedIdea = { id: string; text: string; xp: number; status: string; author: string }
type ProgressCallback = (step: string, detail: string, progress: number, extra?: Record<string, unknown>) => void

function agentSystem(agent: Agent): string {
  const parts = [`You are ${agent.name}, an AI agent participating in a Unity Chant deliberation. Your role is to propose and evaluate constructive ideas.`]
  if (agent.personality) parts.push(`[Thinking style: ${agent.personality}]`)
  parts.push(agent.ideology)
  return parts.join(' ')
}

// ── Haiku helper ──

let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

async function haiku(system: string, prompt: string): Promise<string> {
  const res = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find(b => b.type === 'text')
  return block && 'text' in block ? block.text : ''
}

// ── Concurrency-limited batch execution ──

async function batchAsync<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  const worker = async () => {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  return results
}

// ── Agent loading ──

const ALL_PERSONAS = [...PERSONAS, ...EXTENDED_PERSONAS]

export async function loadAgents(count: number): Promise<Agent[]> {
  const agents: Agent[] = []
  const needed = Math.min(count, ALL_PERSONAS.length)

  for (let i = 0; i < needed; i++) {
    const p = ALL_PERSONAS[i]
    const email = `factory_${p.name}@agent.unitychant.com`
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email, name: p.name, isAI: true, onboardedAt: new Date(),
          status: 'ACTIVE', emailVerified: new Date(), ideology: p.ideology,
        },
      })
    }
    agents.push({ id: user.id, name: p.name, ideology: p.ideology })
  }
  return agents.slice(0, count)
}

// ── Shuffle ──

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Main orchestration ──

export async function runAskAI(options: {
  question: string
  description?: string
  creatorId: string
  agentCount?: number
  sources?: { standard?: boolean; pool?: boolean; mine?: boolean }
  onProgress?: ProgressCallback
}): Promise<AskAIResult> {
  const { question, description, creatorId, onProgress } = options
  const agentCount = options.agentCount || 15
  const sources = options.sources || { standard: true }
  if (!sources.standard && !sources.pool && !sources.mine) sources.standard = true
  const CELL_SIZE = 5
  const CONCURRENCY = 40 // max parallel Haiku calls

  const progress = onProgress || (() => {})

  // ── 1. Load agents — blend from checked sources, factory fills remaining ──
  progress('loading', 'Loading agents...', 5)

  const seen = new Set<string>()
  const agents: Agent[] = []

  // Mine first (user's own agents)
  if (sources.mine) {
    const userAgents = await prisma.user.findMany({
      where: {
        ownerId: creatorId,
        isAI: true,
        ideology: { not: null },
        status: { not: 'DELETED' },
      },
      select: { id: true, name: true, ideology: true, aiPersonality: true },
    })
    for (const a of userAgents) {
      if (agents.length >= agentCount) break
      if (!a.name || !a.ideology || a.ideology.length < 10) continue
      agents.push({ id: a.id, name: a.name, ideology: a.ideology, personality: a.aiPersonality })
      seen.add(a.id)
    }
  }

  // Pool next (other users' agents, shuffled)
  if (sources.pool && agents.length < agentCount) {
    const poolAgents = await prisma.user.findMany({
      where: {
        isAI: true,
        ownerId: { not: null, notIn: [creatorId] },
        ideology: { not: null },
        status: { not: 'DELETED' },
      },
      select: { id: true, name: true, ideology: true, aiPersonality: true },
      take: 200,
    })
    const validPool = shuffle(
      poolAgents.filter(a => a.name && a.ideology && a.ideology.length >= 10 && !seen.has(a.id))
    )
    for (const a of validPool) {
      if (agents.length >= agentCount) break
      agents.push({ id: a.id, name: a.name!, ideology: a.ideology!, personality: a.aiPersonality })
      seen.add(a.id)
    }
  }

  // Standard (factory) fills remaining slots
  if (agents.length < agentCount && (sources.standard || agents.length === 0)) {
    const factoryAgents = await loadAgents(agentCount)
    for (const a of factoryAgents) {
      if (agents.length >= agentCount) break
      if (seen.has(a.id)) continue
      agents.push(a)
      seen.add(a.id)
    }
  }

  progress('loading', `${agents.length} agents loaded`, 8)

  // ── 2. Create deliberation ──
  progress('creating', 'Setting up deliberation...', 8)
  const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const deliberation = await prisma.deliberation.create({
    data: {
      question: question.trim(),
      description: description?.trim() || null,
      isPublic: true,
      allowAI: true,
      ideaGoal: agentCount,
      inviteCode,
      tags: ['ask-ai'],
      creatorId,
      votingTimeoutMs: 0,
      members: {
        create: [
          { userId: creatorId, role: 'CREATOR' },
          ...agents.map(a => ({ userId: a.id, role: 'PARTICIPANT' as const })),
        ],
      },
    },
  })
  const delibId = deliberation.id

  // ── 3. Brainstorm — all agents submit ideas ──
  progress('brainstorming', `${agents.length} agents thinking...`, 15)
  const ideaResults = await batchAsync(
    agents.map(agent => () =>
      haiku(
        agentSystem(agent),
        `Question: "${question}"${description ? `\nContext: "${description}"` : ''}\n\nPropose ONE constructive, specific, actionable idea that answers this question. Your idea should be a concrete proposal or solution — not an analysis, critique, or security review. Max 500 characters. Just the idea text, no preamble.`,
      ).then(text => ({ agent, text: text.trim().slice(0, 500) }))
        .catch(() => ({ agent, text: '' }))
    ),
    CONCURRENCY,
  )
  const validIdeas = ideaResults.filter(r => r.text.length > 5)

  if (validIdeas.length < 3) {
    throw new Error(`Only ${validIdeas.length} ideas generated (need at least 3)`)
  }

  // ── 4. Insert ideas ──
  progress('brainstorming', `${validIdeas.length} ideas generated`, 25)
  const createdIdeas = await Promise.all(
    validIdeas.map(r =>
      prisma.idea.create({
        data: {
          text: r.text,
          deliberationId: delibId,
          authorId: r.agent.id,
          status: 'SUBMITTED',
        },
      })
    )
  )

  // ── 5. Start voting phase ──
  progress('voting', 'Creating voting cells...', 30)
  await prisma.deliberation.update({
    where: { id: delibId },
    data: { phase: 'VOTING', currentTier: 1, currentTierStartedAt: new Date() },
  })

  // ── 6. Tier 1: Comment round ──
  // Build tier 1 cells first, then discuss, then vote

  type IdeaInfo = { id: string; text: string; authorId: string | null }
  type CellInfo = { cellId: string; ideas: IdeaInfo[]; agents: Agent[] }

  function buildCells(ideas: IdeaInfo[], tier: number): { cellIdeaGroups: IdeaInfo[][]; cellMemberGroups: Agent[][] } {
    const shuffledIdeas = shuffle(ideas)
    const numCells = Math.max(1, Math.ceil(shuffledIdeas.length / CELL_SIZE))

    // Distribute ideas
    const cellIdeaGroups: IdeaInfo[][] = []
    const baseCount = Math.floor(shuffledIdeas.length / numCells)
    const extra = shuffledIdeas.length % numCells
    let idx = 0
    for (let c = 0; c < numCells; c++) {
      const n = baseCount + (c < extra ? 1 : 0)
      cellIdeaGroups.push(shuffledIdeas.slice(idx, idx + n))
      idx += n
    }

    // Build author-to-cell conflict map
    const authorCells = new Map<string, Set<number>>()
    cellIdeaGroups.forEach((group, ci) => {
      for (const idea of group) {
        if (!idea.authorId) continue
        if (!authorCells.has(idea.authorId)) authorCells.set(idea.authorId, new Set())
        authorCells.get(idea.authorId)!.add(ci)
      }
    })

    // Distribute agents avoiding author conflicts
    const allShuffled = shuffle(agents)
    const cellMemberGroups: Agent[][] = Array.from({ length: numCells }, () => [])
    const membersPerCell = Math.ceil(allShuffled.length / numCells)

    for (const agent of allShuffled) {
      const conflicts = authorCells.get(agent.id)
      let best = -1
      let bestFill = Infinity
      for (let c = 0; c < numCells; c++) {
        if (cellMemberGroups[c].length >= membersPerCell + 1) continue
        if (conflicts?.has(c)) continue
        if (cellMemberGroups[c].length < bestFill) { best = c; bestFill = cellMemberGroups[c].length }
      }
      if (best === -1) {
        for (let c = 0; c < numCells; c++) {
          if (cellMemberGroups[c].length < bestFill) { best = c; bestFill = cellMemberGroups[c].length }
        }
      }
      if (best !== -1) cellMemberGroups[best].push(agent)
    }

    return { cellIdeaGroups, cellMemberGroups }
  }

  async function createCellsInDB(cellIdeaGroups: IdeaInfo[][], cellMemberGroups: Agent[][], tier: number): Promise<CellInfo[]> {
    const cells: CellInfo[] = []
    for (let c = 0; c < cellIdeaGroups.length; c++) {
      if (cellIdeaGroups[c].length === 0 || cellMemberGroups[c].length === 0) continue
      await prisma.idea.updateMany({
        where: { id: { in: cellIdeaGroups[c].map(i => i.id) } },
        data: { status: 'IN_VOTING', tier },
      })
      const cell = await prisma.cell.create({
        data: {
          deliberationId: delibId, tier, batch: c, status: 'VOTING',
          ideas: { create: cellIdeaGroups[c].map(idea => ({ ideaId: idea.id })) },
          participants: { create: cellMemberGroups[c].map(a => ({ userId: a.id })) },
        },
      })
      cells.push({ cellId: cell.id, ideas: cellIdeaGroups[c], agents: cellMemberGroups[c] })
    }
    return cells
  }

  // Build + create tier 1 cells
  const tier1Layout = buildCells(createdIdeas.map(i => ({ id: i.id, text: i.text, authorId: i.authorId })), 1)
  const tier1Cells = await createCellsInDB(tier1Layout.cellIdeaGroups, tier1Layout.cellMemberGroups, 1)

  // Comment round (tier 1 only)
  progress('discussing', 'Agents discussing ideas...', 35)
  await batchAsync(
    tier1Cells.flatMap(cellInfo =>
      cellInfo.agents.map(agent => async () => {
        try {
          const otherIdeas = cellInfo.ideas.filter(i => i.authorId !== agent.id)
          const targetIdea = otherIdeas.length > 0
            ? otherIdeas[Math.floor(Math.random() * otherIdeas.length)]
            : cellInfo.ideas[Math.floor(Math.random() * cellInfo.ideas.length)]

          const text = await haiku(
            agentSystem(agent) + '\nWrite a brief, substantive comment.',
            `Question: "${question}"\n\nIdea: "${targetIdea.text}"\n\nWrite a 1-2 sentence comment on this idea — a critique, refinement, or endorsement based on your ideology. Be specific and concise. Just the comment, no preamble.`,
          )
          const cleaned = text.trim().slice(0, 500)
          if (cleaned.length > 10) {
            await prisma.comment.create({
              data: { text: cleaned, userId: agent.id, cellId: cellInfo.cellId, ideaId: targetIdea.id },
            })
          }
        } catch { /* skip */ }
      })
    ),
    CONCURRENCY,
  )

  // Upvote round (tier 1 only)
  progress('discussing', 'Agents upvoting comments...', 37)
  for (const cellInfo of tier1Cells) {
    const cellComments = await prisma.comment.findMany({
      where: { cellId: cellInfo.cellId },
      select: { id: true, userId: true, text: true, ideaId: true },
    })
    if (cellComments.length === 0) continue

    for (const agent of cellInfo.agents) {
      const othersComments = cellComments.filter(c => c.userId !== agent.id)
      if (othersComments.length === 0) continue
      const toUpvote = shuffle(othersComments).slice(0, Math.min(2, othersComments.length))

      for (const comment of toUpvote) {
        try {
          await prisma.commentUpvote.create({ data: { commentId: comment.id, userId: agent.id } })
          const updated = await prisma.comment.update({
            where: { id: comment.id },
            data: { upvoteCount: { increment: 1 } },
          })
          if (comment.ideaId) {
            const newSpread = Math.floor(updated.upvoteCount / 2)
            if (newSpread > updated.spreadCount) {
              await prisma.comment.update({ where: { id: comment.id }, data: { spreadCount: newSpread } })
            }
          }
        } catch { /* duplicate — skip */ }
      }
    }
  }

  // ── 7. Multi-tier voting loop ──

  // Estimate total tiers for progress reporting
  const totalTiers = Math.max(1, Math.ceil(Math.log(createdIdeas.length) / Math.log(CELL_SIZE)))
  let currentTier = 1
  let currentCells = tier1Cells
  let currentIdeas: IdeaInfo[] = createdIdeas.map(i => ({ id: i.id, text: i.text, authorId: i.authorId }))

  while (true) {
    const tierProgressBase = 40 + ((currentTier - 1) / totalTiers) * 50
    const tierProgressRange = 50 / totalTiers
    const isFinal = currentCells.length === 1

    progress('voting', `${isFinal ? 'Final showdown' : `Tier ${currentTier}`}: ${currentCells.length} cell${currentCells.length !== 1 ? 's' : ''} voting...`, tierProgressBase)

    // Gather discussion context from previous tiers
    const topComments = await prisma.comment.findMany({
      where: {
        cell: { deliberationId: delibId, tier: { lt: currentTier } },
        ideaId: { in: currentIdeas.map(i => i.id) },
      },
      include: { user: { select: { name: true } }, idea: { select: { text: true } } },
      orderBy: { upvoteCount: 'desc' },
      take: 15,
    })
    const globalDiscussion = topComments.length > 0
      ? `\n\nTop comments from previous discussion:\n${topComments.map(c =>
          `- ${c.user.name}: "${c.text}"${c.upvoteCount > 0 ? ` (${c.upvoteCount} upvotes)` : ''}${c.idea ? ` [re: ${c.idea.text.slice(0, 40)}]` : ''}`
        ).join('\n')}`
      : ''

    // Also gather cell-local comments + up-pollinated comments
    const cellDiscussionCtx: Record<string, string> = {}
    for (const cellInfo of currentCells) {
      const localComments = await prisma.comment.findMany({
        where: { cellId: cellInfo.cellId },
        include: { user: { select: { name: true } }, idea: { select: { text: true } } },
        orderBy: { upvoteCount: 'desc' },
        take: 10,
      })
      const spreadComments = await prisma.comment.findMany({
        where: {
          cell: { deliberationId: delibId, id: { not: cellInfo.cellId } },
          spreadCount: { gte: 1 },
          ideaId: { in: cellInfo.ideas.map(i => i.id) },
        },
        include: { user: { select: { name: true } }, idea: { select: { text: true } } },
        orderBy: { upvoteCount: 'desc' },
        take: 5,
      })
      const lines: string[] = []
      for (const c of localComments) {
        lines.push(`- ${c.user.name}: "${c.text}"${c.upvoteCount > 0 ? ` (${c.upvoteCount} upvotes)` : ''}${c.idea ? ` [re: ${c.idea.text.slice(0, 40)}]` : ''}`)
      }
      for (const c of spreadComments) {
        lines.push(`- [from another cell] ${c.user.name}: "${c.text}" (${c.upvoteCount} upvotes)`)
      }
      if (lines.length > 0) cellDiscussionCtx[cellInfo.cellId] = `\n\nDiscussion:\n${lines.join('\n')}`
    }

    // Vote in all cells
    const tierLabel = isFinal ? 'This is the FINAL round. Pick the BEST answer.' : `Tier ${currentTier} voting.`
    await batchAsync(
      currentCells.flatMap(cellInfo => {
        const ideasList = cellInfo.ideas.map((idea, i) => `${i + 1}. ${idea.text}`).join('\n')
        const discussion = cellDiscussionCtx[cellInfo.cellId] || (currentTier > 1 ? globalDiscussion : '')
        return cellInfo.agents.map(agent => async () => {
          try {
            const voteStr = await haiku(
              agentSystem(agent) + `\n${tierLabel} Consider the discussion. Output ONLY a valid JSON array.`,
              `Question: "${question}"\n\nIdeas:\n${ideasList}${discussion}\n\nAllocate exactly 10 XP across the ideas you support. JSON: [{"idea": 1, "points": 5}, {"idea": 3, "points": 3}, {"idea": 4, "points": 2}]`,
            )
            const jsonMatch = voteStr.match(/\[[\s\S]*?\]/)
            if (!jsonMatch) return
            const parsed = JSON.parse(jsonMatch[0]) as { idea: number; points: number }[]
            const allocations = parsed
              .filter(v => v.idea >= 1 && v.idea <= cellInfo.ideas.length && v.points > 0)
              .map(v => ({ ideaId: cellInfo.ideas[v.idea - 1].id, points: v.points }))

            // Normalize to 10 XP
            const total = allocations.reduce((s, a) => s + a.points, 0)
            if (total > 0 && total !== 10) {
              const scale = 10 / total
              let running = 0
              for (let i = 0; i < allocations.length - 1; i++) {
                allocations[i].points = Math.max(1, Math.round(allocations[i].points * scale))
                running += allocations[i].points
              }
              allocations[allocations.length - 1].points = 10 - running
            }

            if (allocations.length > 0 && allocations.every(a => a.points > 0) && allocations.reduce((s, a) => s + a.points, 0) === 10) {
              for (const a of allocations) {
                await prisma.vote.create({
                  data: { cellId: cellInfo.cellId, ideaId: a.ideaId, userId: agent.id, xpPoints: a.points },
                })
              }
            }
          } catch { /* skip */ }
        })
      }),
      CONCURRENCY,
    )

    // Process results for this tier
    progress('processing', `Processing Tier ${currentTier} results...`, tierProgressBase + tierProgressRange * 0.8)

    const tierWinners: { id: string; text: string; authorId: string | null; xp: number }[] = []

    for (const cellInfo of currentCells) {
      await prisma.cell.update({
        where: { id: cellInfo.cellId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })

      const votes = await prisma.vote.findMany({ where: { cellId: cellInfo.cellId } })
      const xpTotals: Record<string, number> = {}
      for (const v of votes) xpTotals[v.ideaId] = (xpTotals[v.ideaId] || 0) + v.xpPoints

      // Pick 1 winner per cell (deterministic tie-breaking by ID)
      const sorted = cellInfo.ideas
        .map(i => ({ ...i, xp: xpTotals[i.id] || 0 }))
        .sort((a, b) => b.xp - a.xp || a.id.localeCompare(b.id))

      const winnerId = sorted[0].id
      const loserIds = sorted.slice(1).map(s => s.id)

      await prisma.idea.updateMany({
        where: { id: winnerId },
        data: { status: isFinal ? 'WINNER' : 'ADVANCING', tier: currentTier },
      })
      if (loserIds.length > 0) {
        await prisma.idea.updateMany({
          where: { id: { in: loserIds } },
          data: { status: 'ELIMINATED', losses: { increment: 1 } },
        })
      }

      tierWinners.push(sorted[0])
    }

    // Stream ranked snapshot after this tier — live priority leaderboard
    const allVotesSoFar = await prisma.vote.findMany({
      where: { cell: { deliberationId: delibId } },
    })
    const xpSoFar: Record<string, number> = {}
    for (const v of allVotesSoFar) xpSoFar[v.ideaId] = (xpSoFar[v.ideaId] || 0) + v.xpPoints

    const allIdeasSoFar = await prisma.idea.findMany({
      where: { deliberationId: delibId },
      include: { author: { select: { name: true } } },
    })
    const rankedSnapshot: RankedIdea[] = allIdeasSoFar
      .map(i => ({ id: i.id, text: i.text, xp: xpSoFar[i.id] || 0, status: i.status, author: i.author?.name || 'unknown' }))
      .sort((a, b) => b.xp - a.xp || a.id.localeCompare(b.id))

    progress('tier_results', `Tier ${currentTier} complete: ${tierWinners.length} ideas advancing`, tierProgressBase + tierProgressRange, {
      tier: currentTier,
      ranked: rankedSnapshot.slice(0, 30), // top 30 for bandwidth
      advancing: tierWinners.length,
      eliminated: currentCells.reduce((sum, c) => sum + c.ideas.length, 0) - tierWinners.length,
    })

    // Check if we have a champion
    if (tierWinners.length <= 1) {
      // Champion declared!
      const champion = tierWinners[0]
      await prisma.idea.update({
        where: { id: champion.id },
        data: { status: 'WINNER', isChampion: true },
      })
      await prisma.deliberation.update({
        where: { id: delibId },
        data: { phase: 'COMPLETED', completedAt: new Date(), championId: champion.id },
      })

      // Build final ranking
      return await buildFinalResult(delibId, champion, question, progress)
    }

    // Advance to next tier
    currentTier++
    await prisma.deliberation.update({
      where: { id: delibId },
      data: { currentTier, currentTierStartedAt: new Date() },
    })

    // Mark winners as IN_VOTING for next tier
    await prisma.idea.updateMany({
      where: { id: { in: tierWinners.map(w => w.id) } },
      data: { status: 'IN_VOTING', tier: currentTier },
    })

    // Build cells for next tier
    const nextLayout = buildCells(tierWinners, currentTier)
    currentCells = await createCellsInDB(nextLayout.cellIdeaGroups, nextLayout.cellMemberGroups, currentTier)
    currentIdeas = tierWinners
  }
}

// ── Build final ranked result ──

async function buildFinalResult(
  delibId: string,
  champion: { id: string; text: string; xp: number },
  question: string,
  progress: ProgressCallback,
): Promise<AskAIResult> {
  const allIdeas = await prisma.idea.findMany({
    where: { deliberationId: delibId },
    include: { author: { select: { name: true } } },
  })
  const allVotes = await prisma.vote.findMany({
    where: { cell: { deliberationId: delibId } },
  })
  const globalXP: Record<string, number> = {}
  for (const v of allVotes) globalXP[v.ideaId] = (globalXP[v.ideaId] || 0) + v.xpPoints

  // Persist totalXP
  for (const [ideaId, xp] of Object.entries(globalXP)) {
    await prisma.idea.update({ where: { id: ideaId }, data: { totalXP: xp } })
  }

  const ranked = allIdeas
    .map(i => ({ id: i.id, text: i.text, totalXP: globalXP[i.id] || 0, author: i.author?.name || 'unknown' }))
    .sort((a, b) => b.totalXP - a.totalXP || a.id.localeCompare(b.id))
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const championAuthor = allIdeas.find(i => i.id === champion.id)?.author?.name || 'unknown'

  progress('complete', `Champion: "${champion.text.slice(0, 60)}"`, 100)

  return {
    deliberationId: delibId,
    champion: { id: champion.id, text: champion.text, totalXP: champion.xp, author: championAuthor },
    ranked,
  }
}
