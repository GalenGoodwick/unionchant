'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import Header from '@/components/Header'

type Idea = {
  id: string
  text: string
  status: 'submitted' | 'in_voting' | 'advancing' | 'eliminated' | 'winner'
  tier: number
  votes: number
}

type Participant = {
  id: string
  name: string
}

type CellConversation = {
  participantName: string
  message: string
  ideaRef?: string
}

type Cell = {
  id: string
  tier: number
  ideaIds: string[]
  participantIds: string[]
  votes: Record<string, string>
  status: 'deliberating' | 'voting' | 'completed'
  winner?: string
  conversations: CellConversation[]
}

type TierSummary = {
  tier: number
  ideasStart: number
  ideasEnd: number
  cells: number
  status: 'pending' | 'active' | 'completed'
}

const AI_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Kate', 'Leo', 'Maya', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rose', 'Sam', 'Tara',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zoe', 'Adam', 'Beth', 'Chris', 'Diana',
  'Erik', 'Fiona', 'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Mike', 'Nina'
]

const IDEA_ACTIONS = ['Implement', 'Introduce', 'Create', 'Establish', 'Launch', 'Offer', 'Start', 'Build']

const IDEA_SUBJECTS = [
  'a 4-day work week', 'flexible working hours', 'unlimited PTO', 'remote work options',
  'hybrid work model', 'no-meeting Fridays', 'weekly team lunches', 'monthly team events',
  'a mentorship program', 'learning stipends', 'conference attendance budget', 'profit sharing',
  'equity grants for all', 'home office stipend', 'gym membership coverage', 'mental health days',
  'wellness Wednesdays', 'free healthy snacks', 'catered meals', 'nap rooms',
  'game room', 'walking meetings', 'open door policy', 'anonymous feedback system',
  'employee recognition program', 'innovation time', 'sabbatical program', 'summer Fridays'
]

const CONVERSATION_TEMPLATES = {
  support: [
    "I really like {idea} - it would improve work-life balance significantly.",
    "As someone who {context}, I think {idea} makes a lot of sense.",
    "{idea} worked great at my previous company. Highly recommend.",
    "I've been hoping for something like {idea}. It addresses a real need.",
  ],
  question: [
    "How would {idea} work with our current policies?",
    "What's the cost estimate for {idea}?",
    "Has anyone seen {idea} implemented elsewhere?",
    "Would {idea} apply to all departments equally?",
  ],
  concern: [
    "I like the intent of {idea}, but I worry about implementation.",
    "{idea} sounds good, but how do we measure success?",
    "My concern with {idea} is whether it's sustainable long-term.",
  ],
  agreement: [
    "Good point about {idea}. I hadn't considered that angle.",
    "You've convinced me - changing my vote to {idea}.",
    "After hearing everyone's perspective, {idea} seems like the best choice.",
  ],
}

const CONTEXTS = [
  "commutes an hour each way",
  "has young kids at home",
  "works best in the mornings",
  "often collaborates with overseas teams",
  "values focused deep work time",
]

function generateIdea(): string {
  const action = IDEA_ACTIONS[Math.floor(Math.random() * IDEA_ACTIONS.length)]
  const subject = IDEA_SUBJECTS[Math.floor(Math.random() * IDEA_SUBJECTS.length)]
  return `${action} ${subject}`
}

function generateUniqueIdeas(count: number): string[] {
  const ideas = new Set<string>()
  while (ideas.size < count) {
    ideas.add(generateIdea())
  }
  return Array.from(ideas)
}

function generateConversation(ideaTexts: string[], participantNames: string[]): CellConversation[] {
  const conversations: CellConversation[] = []
  const numMessages = 3 + Math.floor(Math.random() * 3) // 3-5 messages

  for (let i = 0; i < numMessages; i++) {
    const participant = participantNames[Math.floor(Math.random() * participantNames.length)]
    const idea = ideaTexts[Math.floor(Math.random() * ideaTexts.length)]
    const shortIdea = idea.length > 30 ? idea.substring(0, 30) + '...' : idea

    let templateType: keyof typeof CONVERSATION_TEMPLATES
    if (i === 0) templateType = 'support'
    else if (i === numMessages - 1) templateType = 'agreement'
    else templateType = ['support', 'question', 'concern'][Math.floor(Math.random() * 3)] as keyof typeof CONVERSATION_TEMPLATES

    const templates = CONVERSATION_TEMPLATES[templateType]
    let message = templates[Math.floor(Math.random() * templates.length)]
    message = message.replace('{idea}', `"${shortIdea}"`)
    message = message.replace('{context}', CONTEXTS[Math.floor(Math.random() * CONTEXTS.length)])

    conversations.push({ participantName: participant, message, ideaRef: idea })
  }

  return conversations
}

export default function DemoPage() {
  const question = 'What workplace policy should we implement?'
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [cells, setCells] = useState<Cell[]>([])
  const [tierSummaries, setTierSummaries] = useState<TierSummary[]>([])
  const [phase, setPhase] = useState<'setup' | 'submission' | 'voting' | 'completed'>('setup')
  const [currentTier, setCurrentTier] = useState(0)
  const [champion, setChampion] = useState<Idea | null>(null)
  const [running, setRunning] = useState(false)
  const [activeCell, setActiveCell] = useState<Cell | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [speed, setSpeed] = useState(1) // 1 = normal, 2 = fast, 0.5 = slow
  const [runId, setRunId] = useState(0) // Unique ID for each demo run to prevent key collisions
  const abortRef = useRef(false)

  const participantCount = 40
  const CELL_SIZE = 5
  const IDEAS_PER_CELL = 5

  const sleep = (ms: number) => new Promise(resolve => {
    if (abortRef.current) return
    setTimeout(resolve, ms / speed)
  })

  const shuffle = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const calculateTierPlan = (ideaCount: number, participantCount: number): TierSummary[] => {
    const summaries: TierSummary[] = []
    let remaining = ideaCount
    let tier = 1

    while (remaining > 1) {
      const cells = Math.ceil(remaining / IDEAS_PER_CELL)
      const advancing = cells // One winner per cell
      summaries.push({
        tier,
        ideasStart: remaining,
        ideasEnd: Math.max(1, advancing),
        cells,
        status: 'pending'
      })
      remaining = advancing
      tier++
      if (tier > 10) break // Safety
    }

    return summaries
  }

  const startDemo = async () => {
    abortRef.current = false
    setRunning(true)
    setCells([])
    setChampion(null)
    setCurrentTier(0)
    setActiveCell(null)
    setTierSummaries([])
    const currentRunId = runId + 1
    setRunId(currentRunId) // Increment run ID to ensure unique keys

    // Create participants
    setStatusMessage('Participants joining the deliberation...')
    const newParticipants: Participant[] = shuffle(AI_NAMES)
      .slice(0, participantCount)
      .map((name, i) => ({ id: `p${i}`, name }))
    setParticipants(newParticipants)
    await sleep(800)

    // Show tier plan
    const plan = calculateTierPlan(participantCount, participantCount)
    setTierSummaries(plan)
    setStatusMessage(`${participantCount} participants will submit ideas, then vote through ${plan.length} tiers`)
    await sleep(1500)

    // Submission phase
    setPhase('submission')
    setStatusMessage('Submission phase: Each participant submits one idea...')
    const generatedIdeas = generateUniqueIdeas(participantCount)
    const newIdeas: Idea[] = []

    for (let i = 0; i < generatedIdeas.length; i++) {
      if (abortRef.current) return
      newIdeas.push({
        id: `idea${i}`,
        text: generatedIdeas[i],
        status: 'submitted',
        tier: 0,
        votes: 0
      })
      if (i % 5 === 0 || i === generatedIdeas.length - 1) {
        setIdeas([...newIdeas])
        setStatusMessage(`${newIdeas.length} ideas submitted...`)
        await sleep(100)
      }
    }

    setStatusMessage(`All ${newIdeas.length} ideas submitted. Starting voting phase...`)
    await sleep(1000)

    // Start voting
    setPhase('voting')
    await runVotingTiers(newIdeas, newParticipants, currentRunId)
  }

  const runVotingTiers = async (allIdeas: Idea[], allParticipants: Participant[], demoRunId: number) => {
    let activeIdeas = [...allIdeas]
    let tier = 1

    while (activeIdeas.length > 1 && !abortRef.current) {
      setCurrentTier(tier)

      // Update tier summaries
      setTierSummaries(prev => prev.map(t => ({
        ...t,
        status: t.tier < tier ? 'completed' : t.tier === tier ? 'active' : 'pending'
      })))

      // Update idea statuses
      setIdeas(prev => prev.map(idea =>
        activeIdeas.find(ai => ai.id === idea.id)
          ? { ...idea, status: 'in_voting', tier }
          : idea
      ))

      setStatusMessage(`Tier ${tier}: ${activeIdeas.length} ideas competing in small groups`)
      await sleep(1000)

      // Create cells
      const shuffledIdeas = shuffle(activeIdeas)
      const shuffledParticipants = shuffle(allParticipants)
      const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

      const tierCells: Cell[] = []

      for (let i = 0; i < numCells; i++) {
        const cellIdeas = shuffledIdeas.slice(i * IDEAS_PER_CELL, (i + 1) * IDEAS_PER_CELL)
        const cellParticipants = shuffledParticipants.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)
        const actualParticipants = cellParticipants.length >= 3 ? cellParticipants : shuffledParticipants.slice(0, CELL_SIZE)

        const cell: Cell = {
          id: `r${demoRunId}t${tier}c${i}`,
          tier,
          ideaIds: cellIdeas.map(idea => idea.id),
          participantIds: actualParticipants.map(p => p.id),
          votes: {},
          status: 'deliberating',
          conversations: generateConversation(
            cellIdeas.map(i => i.text),
            actualParticipants.map(p => p.name)
          )
        }
        tierCells.push(cell)
      }

      setCells(prev => [...prev, ...tierCells])
      setStatusMessage(`${tierCells.length} cells created - participants are discussing...`)
      await sleep(800)

      // Process each cell with conversation display
      const advancingIdeas: string[] = []

      for (let cellIndex = 0; cellIndex < tierCells.length; cellIndex++) {
        if (abortRef.current) return

        const cell = tierCells[cellIndex]
        setActiveCell(cell)

        // Show deliberation
        cell.status = 'deliberating'
        setCells(prev => prev.map(c => c.id === cell.id ? { ...cell } : c))
        setStatusMessage(`Cell ${cellIndex + 1}/${tierCells.length}: 5 people discussing 5 ideas...`)

        // Show conversations one by one
        for (let convIndex = 0; convIndex < cell.conversations.length; convIndex++) {
          if (abortRef.current) return
          await sleep(600)
        }

        // Voting
        cell.status = 'voting'
        setCells(prev => prev.map(c => c.id === cell.id ? { ...cell } : c))
        setStatusMessage(`Cell ${cellIndex + 1}: Voting...`)

        for (const participantId of cell.participantIds) {
          if (abortRef.current) return
          const votedIdeaId = cell.ideaIds[Math.floor(Math.random() * cell.ideaIds.length)]
          cell.votes[participantId] = votedIdeaId
          setCells(prev => prev.map(c => c.id === cell.id ? { ...cell } : c))
          await sleep(150)
        }

        // Count and determine winner
        const voteCounts: Record<string, number> = {}
        Object.values(cell.votes).forEach(ideaId => {
          voteCounts[ideaId] = (voteCounts[ideaId] || 0) + 1
        })

        const maxVotes = Math.max(...Object.values(voteCounts))
        const winners = Object.entries(voteCounts)
          .filter(([, count]) => count === maxVotes)
          .map(([id]) => id)

        advancingIdeas.push(...winners)
        cell.status = 'completed'
        cell.winner = winners[0]
        setCells(prev => prev.map(c => c.id === cell.id ? { ...cell } : c))

        // Update idea statuses
        setIdeas(prev => prev.map(idea => {
          if (cell.ideaIds.includes(idea.id)) {
            return {
              ...idea,
              votes: idea.votes + (voteCounts[idea.id] || 0),
              status: winners.includes(idea.id) ? 'advancing' : 'eliminated'
            }
          }
          return idea
        }))

        await sleep(400)
      }

      setActiveCell(null)

      // Dedupe and update active ideas
      const uniqueAdvancing = [...new Set(advancingIdeas)]
      activeIdeas = allIdeas.filter(idea => uniqueAdvancing.includes(idea.id))

      setStatusMessage(`Tier ${tier} complete! ${activeIdeas.length} ideas advancing to next round.`)

      // Update tier summary
      setTierSummaries(prev => prev.map(t =>
        t.tier === tier ? { ...t, status: 'completed', ideasEnd: activeIdeas.length } : t
      ))

      tier++
      await sleep(1500)
    }

    // Champion!
    if (activeIdeas.length === 1 && !abortRef.current) {
      const winner = activeIdeas[0]
      setIdeas(prev => prev.map(idea =>
        idea.id === winner.id ? { ...idea, status: 'winner' } : idea
      ))
      setChampion(winner)
      setPhase('completed')
      setStatusMessage(`Champion determined through ${tier - 1} tiers of deliberation!`)
    }

    setRunning(false)
  }

  const reset = () => {
    abortRef.current = true
    setPhase('setup')
    setIdeas([])
    setParticipants([])
    setCells([])
    setTierSummaries([])
    setChampion(null)
    setCurrentTier(0)
    setRunning(false)
    setActiveCell(null)
    setStatusMessage('')
  }

  const getIdeaText = (ideaId: string) => ideas.find(i => i.id === ideaId)?.text || ''
  const getParticipantName = (pId: string) => participants.find(p => p.id === pId)?.name || ''

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Title */}
        <div className="mb-6">
          <Link href="/" className="text-muted hover:text-foreground text-sm mb-2 inline-block">
            &larr; Back to home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">See Union Chant in Action</h1>
          <p className="text-muted mt-1 text-sm sm:text-base">Watch how {participantCount} people reach consensus through structured small-group deliberation</p>
        </div>

        {/* Setup Panel */}
        {phase === 'setup' && (
          <div className="bg-background rounded-lg p-8 border border-border mb-6 max-w-2xl">
            <h2 className="text-xl font-semibold text-foreground mb-2">Demo Question</h2>
            <p className="text-2xl text-accent font-medium mb-6">"{question}"</p>

            <div className="bg-surface rounded-lg p-4 mb-6 text-subtle text-sm space-y-2">
              <p><strong className="text-foreground">How it works:</strong></p>
              <p>1. {participantCount} participants each submit one idea</p>
              <p>2. Ideas are grouped into cells of 5 ideas, 5 people each</p>
              <p>3. Each cell <span className="text-accent">deliberates</span> (discusses trade-offs) then votes</p>
              <p>4. Winners advance to the next tier, losers are eliminated</p>
              <p>5. Process repeats until one champion emerges</p>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <label className="text-sm text-muted">Speed:</label>
              <div className="flex gap-2">
                {[0.5, 1, 2].map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-3 py-1 rounded text-sm ${
                      speed === s
                        ? 'bg-accent text-white'
                        : 'bg-surface text-muted border border-border hover:border-accent'
                    }`}
                  >
                    {s === 0.5 ? 'Slow' : s === 1 ? 'Normal' : 'Fast'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startDemo}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-4 rounded-lg transition-colors text-lg"
            >
              Start Demo
            </button>
          </div>
        )}

        {/* Running Demo */}
        {phase !== 'setup' && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left: Tier Progress */}
            <div className="lg:col-span-1 space-y-4">
              {/* Status */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <div className="text-sm text-muted mb-1">Status</div>
                <div className="text-foreground font-medium">{statusMessage}</div>
              </div>

              {/* Champion Banner */}
              {champion && (
                <div className="bg-success-bg border-2 border-success rounded-lg p-6 text-center animate-pulse">
                  <div className="text-success text-sm font-medium mb-2">CHAMPION</div>
                  <div className="text-foreground text-xl font-bold">{champion.text}</div>
                  <div className="text-success text-sm mt-3">
                    Selected by {participantCount} people through {currentTier} tiers
                  </div>
                </div>
              )}

              {/* Tier Funnel */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <h3 className="text-sm font-medium text-muted mb-4">Tournament Progress</h3>
                <div className="space-y-2">
                  {tierSummaries.map((t, i) => (
                    <div key={t.tier} className="relative">
                      <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        t.status === 'active' ? 'bg-warning-bg border border-warning' :
                        t.status === 'completed' ? 'bg-success-bg border border-success' :
                        'bg-surface border border-border'
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          t.status === 'active' ? 'bg-warning text-white' :
                          t.status === 'completed' ? 'bg-success text-white' :
                          'bg-border text-muted'
                        }`}>
                          {t.tier}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-foreground font-medium">
                            Tier {t.tier}: {t.cells} cells
                          </div>
                          <div className="text-xs text-muted">
                            {t.ideasStart} ideas → {t.status === 'completed' ? t.ideasEnd : '?'} advancing
                          </div>
                        </div>
                        {t.status === 'completed' && (
                          <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {t.status === 'active' && (
                          <div className="w-5 h-5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      {i < tierSummaries.length - 1 && (
                        <div className="absolute left-6 top-full w-0.5 h-2 bg-border" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ideas Summary */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <h3 className="text-sm font-medium text-muted mb-3">Ideas by Status</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-accent-light rounded p-2">
                    <div className="text-2xl font-bold text-accent font-mono">
                      {ideas.filter(i => i.status === 'advancing' || i.status === 'in_voting').length}
                    </div>
                    <div className="text-accent text-xs">Active</div>
                  </div>
                  <div className="bg-success-bg rounded p-2">
                    <div className="text-2xl font-bold text-success font-mono">
                      {ideas.filter(i => i.status === 'winner').length}
                    </div>
                    <div className="text-success text-xs">Winner</div>
                  </div>
                  <div className="bg-surface rounded p-2">
                    <div className="text-2xl font-bold text-muted font-mono">
                      {ideas.filter(i => i.status === 'eliminated').length}
                    </div>
                    <div className="text-muted text-xs">Eliminated</div>
                  </div>
                  <div className="bg-surface rounded p-2">
                    <div className="text-2xl font-bold text-muted font-mono">{ideas.length}</div>
                    <div className="text-muted text-xs">Total</div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <button
                onClick={reset}
                className="w-full bg-muted hover:bg-subtle text-white px-4 py-2 rounded-lg transition-colors"
              >
                {running ? 'Stop & Reset' : 'Reset Demo'}
              </button>
            </div>

            {/* Middle/Right: Panels */}
            <div className="lg:col-span-2 space-y-4">
              {/* All Cells Grid - Always visible during voting */}
              {cells.length > 0 && phase !== 'completed' && (
                <div className="bg-background rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">All Cells - Tier {currentTier}</h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                    {cells.filter(c => c.tier === currentTier).map(cell => (
                      <div
                        key={cell.id}
                        className={`aspect-square rounded flex items-center justify-center text-xs font-mono ${
                          activeCell?.id === cell.id ? 'ring-2 ring-foreground' : ''
                        } ${
                          cell.status === 'completed' ? 'bg-success-bg border border-success text-success' :
                          cell.status === 'voting' ? 'bg-warning-bg border border-warning text-warning' :
                          cell.status === 'deliberating' ? 'bg-accent-light border border-accent text-accent' :
                          'bg-surface border border-border text-muted'
                        }`}
                        title={`Cell ${cell.id}: ${Object.keys(cell.votes).length}/${cell.participantIds.length} voted`}
                      >
                        {Object.keys(cell.votes).length}/{cell.participantIds.length}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Cell Detail */}
              {activeCell && (
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                  <div className={`p-3 ${
                    activeCell.status === 'deliberating' ? 'bg-accent-light' :
                    activeCell.status === 'voting' ? 'bg-warning-bg' :
                    'bg-success-bg'
                  }`}>
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-foreground text-sm">
                        Active: Cell {activeCell.id.split('t')[1]} - Tier {activeCell.tier}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded ${
                        activeCell.status === 'deliberating' ? 'bg-accent text-white' :
                        activeCell.status === 'voting' ? 'bg-warning text-white' :
                        'bg-success text-white'
                      }`}>
                        {activeCell.status === 'deliberating' ? 'Discussing' :
                         activeCell.status === 'voting' ? 'Voting' : 'Complete'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 grid md:grid-cols-2 gap-4">
                    {/* Ideas being voted on */}
                    <div>
                      <h4 className="text-sm font-medium text-muted mb-2">Ideas in this cell:</h4>
                      <div className="space-y-1.5">
                        {activeCell.ideaIds.map(ideaId => {
                          const voteCount = Object.values(activeCell.votes).filter(v => v === ideaId).length
                          const isWinner = activeCell.winner === ideaId
                          return (
                            <div key={ideaId} className={`p-2 rounded text-sm flex justify-between items-center ${
                              isWinner ? 'bg-success-bg border border-success' : 'bg-surface'
                            }`}>
                              <span className={`${isWinner ? 'text-success font-medium' : 'text-foreground'} text-xs`}>
                                {getIdeaText(ideaId)}
                              </span>
                              {voteCount > 0 && (
                                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                                  isWinner ? 'bg-success text-white' : 'bg-border text-muted'
                                }`}>
                                  {voteCount}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Conversation */}
                    <div>
                      <h4 className="text-sm font-medium text-muted mb-2">Discussion:</h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {activeCell.conversations.map((conv, i) => (
                          <div key={i} className="bg-surface rounded p-2 text-xs">
                            <span className="font-medium text-accent">{conv.participantName}:</span>
                            <span className="text-subtle ml-1">{conv.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Participants */}
                  <div className="px-4 pb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {activeCell.participantIds.map(pId => {
                        const hasVoted = activeCell.votes[pId]
                        return (
                          <span key={pId} className={`text-xs px-2 py-0.5 rounded ${
                            hasVoted ? 'bg-success text-white' : 'bg-surface text-muted border border-border'
                          }`}>
                            {getParticipantName(pId)} {hasVoted ? '✓' : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Completed View */}
              {phase === 'completed' && (
                <div className="bg-background rounded-lg border border-border p-8 text-center">
                  <div className="text-6xl mb-4">🏆</div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Deliberation Complete!</h3>
                  <p className="text-muted mb-6">
                    From {ideas.length} ideas submitted by {participants.length} participants,
                    one champion emerged through {currentTier} rounds of small-group deliberation.
                  </p>
                  <div className="bg-success-bg border border-success rounded-lg p-4 mb-6">
                    <div className="text-success text-sm mb-1">Winning Idea:</div>
                    <div className="text-foreground text-xl font-semibold">{champion?.text}</div>
                  </div>
                  <div className="text-sm text-muted">
                    <p className="mb-2">This is the power of Union Chant:</p>
                    <p>Not just a vote count, but a decision shaped by real discussion.</p>
                  </div>
                </div>
              )}

              {/* Key Insight Box */}
              {!champion && (
                <div className="bg-purple-bg border border-purple rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-purple text-xl">💡</div>
                    <div>
                      <div className="text-purple font-medium text-sm">Why Small Groups Matter</div>
                      <div className="text-subtle text-sm mt-1">
                        In a traditional poll, the loudest voices dominate. In Union Chant, every participant
                        deliberates in a small group where their voice is heard. Ideas win by surviving
                        scrutiny across multiple independent groups—not by popularity or timing.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        {phase === 'completed' && (
          <div className="mt-8 text-center">
            <Link
              href="/deliberations/new"
              className="inline-block bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Start Your Own Deliberation
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
