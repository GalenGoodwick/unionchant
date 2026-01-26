'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

type Idea = {
  id: string
  text: string
  status: 'submitted' | 'in_voting' | 'advancing' | 'eliminated' | 'winner' | 'defending'
  tier: number
  votes: number
  isChampion?: boolean
}

type Participant = {
  id: string
  name: string
  voted: boolean
}

type Cell = {
  id: string
  tier: number
  ideaIds: string[]
  participantIds: string[]
  votes: Record<string, string> // odvisnost odparticipantId -> ideaId
  status: 'deliberating' | 'voting' | 'completed'
  winner?: string
}

type LogEntry = {
  id: string
  message: string
  type: 'info' | 'vote' | 'result' | 'winner'
  tier?: number
}

const CELL_SIZE = 5
const IDEAS_PER_CELL = 5
const AI_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Kate', 'Leo', 'Maya', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rose', 'Sam', 'Tara',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zoe', 'Adam', 'Beth', 'Chris', 'Diana',
  'Erik', 'Fiona', 'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Mike', 'Nina',
  'Oscar', 'Petra', 'Quentin', 'Rachel', 'Steve', 'Tina', 'Ulrich', 'Vera', 'Walter', 'Xena',
  'Yuri', 'Zelda', 'Andre', 'Bianca', 'Carlos', 'Daphne', 'Eduardo', 'Fatima', 'Gustav', 'Helena',
  'Igor', 'Jasmine', 'Klaus', 'Lena', 'Marco', 'Nadia', 'Omar', 'Priya', 'Rafael', 'Sofia',
  'Thomas', 'Ursula', 'Viktor', 'Wanda', 'Xander', 'Yvonne', 'Zach', 'Amelia', 'Brandon', 'Celia',
  'Derek', 'Elena', 'Felix', 'Gloria', 'Hugo', 'Ingrid', 'Jerome', 'Kira', 'Lorenzo', 'Marta',
  'Nico', 'Olga', 'Pedro', 'Queenie', 'Ricardo', 'Sonia', 'Tobias', 'Una', 'Vince', 'Whitney',
  'Xiomara', 'Yolanda', 'Zander', 'Aria', 'Bruno', 'Carmen', 'Dante', 'Esther', 'Finn', 'Greta',
  'Hector', 'Isla', 'Jonas', 'Kaya', 'Liam', 'Mila', 'Nathan', 'Opal', 'Pascal', 'Quinn',
  'Roman', 'Stella', 'Theo', 'Unity', 'Violet', 'Wesley'
]

// Idea generation templates
const IDEA_ACTIONS = [
  'Implement', 'Introduce', 'Create', 'Establish', 'Launch', 'Offer', 'Provide', 'Start', 'Build', 'Develop'
]

const IDEA_SUBJECTS = [
  'a 4-day work week',
  'flexible working hours',
  'unlimited PTO',
  'remote work options',
  'hybrid work model',
  'compressed work weeks',
  'results-only work environment',
  'asynchronous communication',
  'optional meetings policy',
  'no-meeting Fridays',
  'meeting-free mornings',
  'focus time blocks',
  'weekly team lunches',
  'monthly team events',
  'quarterly hackathons',
  'annual company retreat',
  'birthday day off',
  'volunteer time off',
  'mental health days',
  'wellness Wednesdays',
  'a mentorship program',
  'peer coaching circles',
  'leadership training',
  'career development paths',
  'cross-team rotations',
  'job shadowing opportunities',
  'learning stipends',
  'conference attendance budget',
  'online course subscriptions',
  'book allowance',
  'certification reimbursement',
  'tuition assistance',
  'student loan support',
  'transparent salary bands',
  'profit sharing',
  'equity grants for all',
  'performance bonuses',
  'spot bonus program',
  'referral bonuses',
  'home office stipend',
  'internet reimbursement',
  'co-working space access',
  'ergonomic equipment budget',
  'standing desk options',
  'gym membership coverage',
  'fitness class subsidies',
  'on-site yoga classes',
  'meditation app subscriptions',
  'mental health counseling',
  'employee assistance program',
  'health insurance upgrades',
  'dental and vision coverage',
  'FSA/HSA contributions',
  'pet insurance',
  'pet-friendly office',
  'on-site childcare',
  'childcare subsidies',
  'parental leave expansion',
  'fertility benefits',
  'elder care support',
  'free healthy snacks',
  'catered meals',
  'coffee bar upgrade',
  'nap rooms',
  'game room',
  'outdoor workspace',
  'standing meetings only',
  'walking meetings',
  'documentation-first culture',
  'internal wiki/knowledge base',
  'open door policy',
  'skip-level meetings',
  'anonymous feedback system',
  'regular town halls',
  'employee resource groups',
  'diversity initiatives',
  'sustainability program',
  'carbon offset matching',
  'volunteer matching program',
  'charitable donation matching',
  'sabbatical program',
  'mini-sabbaticals quarterly',
  'summer Fridays',
  'winter break shutdown',
  'birthday celebrations',
  'work anniversary rewards',
  'employee recognition program',
  'peer appreciation system',
  'innovation time (20%)',
  'side project support',
  'internal startup incubator',
  'failure celebration culture',
  'blameless postmortems',
  'continuous feedback loops',
  '360 review process',
  'self-directed teams',
  'flat hierarchy experiment',
  'transparent decision making',
  'open book management'
]

function generateIdea(): string {
  const action = IDEA_ACTIONS[Math.floor(Math.random() * IDEA_ACTIONS.length)]
  const subject = IDEA_SUBJECTS[Math.floor(Math.random() * IDEA_SUBJECTS.length)]
  return `${action} ${subject}`
}

function generateUniqueIdeas(count: number): string[] {
  const ideas = new Set<string>()
  let attempts = 0
  while (ideas.size < count && attempts < count * 3) {
    ideas.add(generateIdea())
    attempts++
  }
  // Fill remaining with numbered variants if needed
  while (ideas.size < count) {
    const base = IDEA_SUBJECTS[Math.floor(Math.random() * IDEA_SUBJECTS.length)]
    ideas.add(`Prioritize ${base} (variant ${ideas.size})`)
  }
  return Array.from(ideas)
}

export default function DemoPage() {
  const question = 'What workplace policy should we implement?'
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [cells, setCells] = useState<Cell[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [phase, setPhase] = useState<'setup' | 'submission' | 'voting' | 'completed'>('setup')
  const [currentTier, setCurrentTier] = useState(0)
  const [champion, setChampion] = useState<Idea | null>(null)
  const [running, setRunning] = useState(false)
  const speed = 1000 // ms between actions
  const participantCount = 125


  const addLog = (message: string, type: LogEntry['type'] = 'info', tier?: number) => {
    setLogs(prev => [...prev, { id: crypto.randomUUID(), message, type, tier }])
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const shuffle = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const startDemo = async () => {
    setRunning(true)
    setLogs([])
    setCells([])
    setChampion(null)
    setCurrentTier(0)

    // Create participants
    const newParticipants: Participant[] = shuffle(AI_NAMES)
      .slice(0, participantCount)
      .map((name, i) => ({
        id: `p${i}`,
        name,
        voted: false
      }))
    setParticipants(newParticipants)
    addLog(`${newParticipants.length} participants joined the deliberation`)

    await sleep(speed)

    // Submission phase - each participant submits one idea
    setPhase('submission')
    const generatedIdeas = generateUniqueIdeas(newParticipants.length)
    const newIdeas: Idea[] = generatedIdeas.map((text, i) => ({
      id: `idea${i}`,
      text,
      status: 'submitted',
      tier: 0,
      votes: 0
    }))

    // Add ideas in batches for visual effect
    const batchSize = 10
    for (let i = 0; i < newIdeas.length; i += batchSize) {
      const batch = newIdeas.slice(i, i + batchSize)
      setIdeas(prev => [...prev, ...batch])
      addLog(`${batch.length} ideas submitted (${Math.min(i + batchSize, newIdeas.length)}/${newIdeas.length})`)
      await sleep(200)
    }

    addLog(`Submission phase complete. ${newIdeas.length} ideas submitted.`)
    await sleep(speed)

    // Start voting
    setPhase('voting')
    await runVotingTiers(newIdeas, newParticipants)
  }

  const runVotingTiers = async (allIdeas: Idea[], allParticipants: Participant[]) => {
    let activeIdeas = [...allIdeas]
    let tier = 1

    while (activeIdeas.length > 1) {
      setCurrentTier(tier)
      addLog(`--- TIER ${tier} ---`, 'info', tier)
      addLog(`${activeIdeas.length} ideas competing`)

      // Update idea statuses
      setIdeas(prev => prev.map(idea =>
        activeIdeas.find(ai => ai.id === idea.id)
          ? { ...idea, status: 'in_voting', tier }
          : idea
      ))

      await sleep(speed)

      // Create cells for this tier
      const shuffledIdeas = shuffle(activeIdeas)
      const shuffledParticipants = shuffle(allParticipants)
      const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

      const tierCells: Cell[] = []

      for (let i = 0; i < numCells; i++) {
        const cellIdeas = shuffledIdeas.slice(i * IDEAS_PER_CELL, (i + 1) * IDEAS_PER_CELL)
        const cellParticipants = shuffledParticipants.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)

        // If not enough participants, wrap around
        const actualParticipants = cellParticipants.length >= 3
          ? cellParticipants
          : shuffledParticipants.slice(0, CELL_SIZE)

        const cell: Cell = {
          id: `t${tier}c${i}`,
          tier,
          ideaIds: cellIdeas.map(idea => idea.id),
          participantIds: actualParticipants.map(p => p.id),
          votes: {},
          status: 'voting'
        }
        tierCells.push(cell)
      }

      setCells(prev => [...prev, ...tierCells])
      addLog(`Created ${tierCells.length} voting cells`)

      await sleep(speed)

      // Simulate voting in each cell
      const advancingIdeas: string[] = []

      for (const cell of tierCells) {
        addLog(`Cell ${cell.id}: ${cell.participantIds.length} participants voting on ${cell.ideaIds.length} ideas`)

        // Each participant votes (faster, less verbose)
        for (const participantId of cell.participantIds) {
          // Random vote
          const votedIdeaId = cell.ideaIds[Math.floor(Math.random() * cell.ideaIds.length)]
          cell.votes[participantId] = votedIdeaId
          setCells(prev => prev.map(c => c.id === cell.id ? { ...c, votes: { ...cell.votes } } : c))
          await sleep(50) // Fast individual votes
        }

        // Count votes and determine winner
        const voteCounts: Record<string, number> = {}
        Object.values(cell.votes).forEach(ideaId => {
          voteCounts[ideaId] = (voteCounts[ideaId] || 0) + 1
        })

        const maxVotes = Math.max(...Object.values(voteCounts))
        const winners = Object.entries(voteCounts)
          .filter(([, count]) => count === maxVotes)
          .map(([id]) => id)

        // All winners advance (handles ties)
        advancingIdeas.push(...winners)

        cell.status = 'completed'
        cell.winner = winners[0]
        setCells(prev => prev.map(c => c.id === cell.id ? { ...c, status: 'completed', winner: winners[0] } : c))

        const winnerIdea = allIdeas.find(i => i.id === winners[0])
        addLog(`Cell ${cell.id} winner: "${winnerIdea?.text.substring(0, 50)}..." (${maxVotes} votes)`, 'result', tier)

        // Update idea vote counts
        setIdeas(prev => prev.map(idea => {
          const voteCount = voteCounts[idea.id] || 0
          if (cell.ideaIds.includes(idea.id)) {
            return {
              ...idea,
              votes: idea.votes + voteCount,
              status: winners.includes(idea.id) ? 'advancing' : 'eliminated'
            }
          }
          return idea
        }))

        await sleep(speed / 2)
      }

      // Dedupe advancing ideas (in case of ties in multiple cells with same idea)
      const uniqueAdvancing = [...new Set(advancingIdeas)]
      activeIdeas = allIdeas.filter(idea => uniqueAdvancing.includes(idea.id))

      addLog(`Tier ${tier} complete. ${activeIdeas.length} ideas advancing.`, 'info', tier)

      tier++
      await sleep(speed * 2)
    }

    // We have a champion!
    if (activeIdeas.length === 1) {
      const winner = activeIdeas[0]
      setIdeas(prev => prev.map(idea =>
        idea.id === winner.id ? { ...idea, status: 'winner', isChampion: true } : idea
      ))
      setChampion(winner)
      setPhase('completed')
      addLog(`CHAMPION: "${winner.text}"`, 'winner')
    }

    setRunning(false)
  }

  const reset = () => {
    setPhase('setup')
    setIdeas([])
    setParticipants([])
    setCells([])
    setLogs([])
    setChampion(null)
    setCurrentTier(0)
    setRunning(false)
  }

  const phaseColors = {
    setup: 'bg-slate-500',
    submission: 'bg-blue-500',
    voting: 'bg-yellow-500',
    completed: 'bg-green-500'
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link href="/" className="text-slate-400 hover:text-slate-300 text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-3xl font-bold text-white">Automated Demo</h1>
            <p className="text-slate-400">Watch Union Chant in action with simulated participants</p>
          </div>
          <span className={`${phaseColors[phase]} text-white text-sm px-3 py-1 rounded`}>
            {phase.toUpperCase()}
            {currentTier > 0 && ` - Tier ${currentTier}`}
          </span>
        </div>

        {/* Setup Panel */}
        {phase === 'setup' && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Demo Question</h2>
            <p className="text-xl text-white mb-6">{question}</p>
            <p className="text-slate-400 text-sm mb-4">125 simulated participants will submit ideas and vote through multiple tiers until a champion emerges.</p>

            <button
              onClick={startDemo}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Start Demo
            </button>
          </div>
        )}

        {/* Champion Banner */}
        {champion && (
          <div className="bg-green-600/20 border-2 border-green-500 rounded-lg p-6 mb-6 text-center">
            <div className="text-green-400 font-semibold mb-2 text-lg">Champion Idea</div>
            <div className="text-white text-2xl font-bold">{champion.text}</div>
            <div className="text-green-400/70 mt-2">
              Emerged from {ideas.length} ideas through {currentTier} tiers of voting
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Ideas Panel */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">
              Ideas ({ideas.length})
            </h2>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {ideas.length === 0 ? (
                <p className="text-slate-500">Ideas will appear here...</p>
              ) : (
                [...ideas].sort((a, b) => {
                  const order = { winner: 0, advancing: 1, in_voting: 2, submitted: 3, defending: 4, eliminated: 5 }
                  return (order[a.status] || 3) - (order[b.status] || 3)
                }).map(idea => (
                  <div
                    key={idea.id}
                    className={`p-3 rounded-lg flex justify-between items-center text-sm ${
                      idea.status === 'winner' ? 'bg-green-600/30 border border-green-500' :
                      idea.status === 'advancing' ? 'bg-blue-600/20 border border-blue-500' :
                      idea.status === 'eliminated' ? 'bg-slate-700/50 opacity-50' :
                      idea.status === 'in_voting' ? 'bg-yellow-600/20 border border-yellow-500' :
                      'bg-slate-700'
                    }`}
                  >
                    <span className={idea.status === 'eliminated' ? 'text-slate-500 line-through' : 'text-white'}>
                      {idea.text}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      idea.status === 'winner' ? 'bg-green-500 text-white' :
                      idea.status === 'advancing' ? 'bg-blue-500 text-white' :
                      idea.status === 'eliminated' ? 'bg-red-500/50 text-red-200' :
                      idea.status === 'in_voting' ? 'bg-yellow-500 text-black' :
                      'bg-slate-600 text-slate-300'
                    }`}>
                      {idea.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Activity Log</h2>

            <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-slate-500">Activity will appear here...</p>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    className={`py-1 ${
                      log.type === 'winner' ? 'text-green-400 font-bold text-base' :
                      log.type === 'result' ? 'text-blue-400' :
                      log.type === 'vote' ? 'text-slate-500' :
                      'text-slate-300'
                    }`}
                  >
                    {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Tournament Bracket Visualization */}
        {cells.length > 0 && (
          <div className="mt-6 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">
              Tournament Bracket
            </h2>

            {/* Tier by tier visualization */}
            <div className="space-y-8">
              {Array.from(new Set(cells.map(c => c.tier))).sort((a, b) => a - b).map(tier => {
                const tierCells = cells.filter(c => c.tier === tier)
                const isCurrentTier = tier === currentTier
                const isCompletedTier = tierCells.every(c => c.status === 'completed')

                return (
                  <div key={tier} className={`${isCurrentTier ? 'opacity-100' : 'opacity-70'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className={`text-lg font-medium ${isCurrentTier ? 'text-yellow-400' : isCompletedTier ? 'text-green-400' : 'text-slate-400'}`}>
                        Tier {tier}
                      </h3>
                      <span className="text-sm text-slate-500">
                        {tierCells.length} cells, {tierCells.reduce((sum, c) => sum + c.ideaIds.length, 0)} ideas
                      </span>
                      {isCompletedTier && <span className="text-green-400 text-sm">Complete</span>}
                    </div>

                    {/* Visual representation of cells as circles/nodes */}
                    <div className="flex flex-wrap gap-3">
                      {tierCells.map(cell => {
                        const completedCount = Object.keys(cell.votes).length
                        const totalParticipants = cell.participantIds.length
                        const progress = totalParticipants > 0 ? (completedCount / totalParticipants) * 100 : 0

                        return (
                          <div
                            key={cell.id}
                            className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${
                              cell.status === 'completed'
                                ? 'border-green-500 bg-green-500/20'
                                : cell.status === 'voting'
                                ? 'border-yellow-500 bg-yellow-500/10'
                                : 'border-slate-600 bg-slate-700'
                            }`}
                            title={`Cell ${cell.id}: ${cell.ideaIds.length} ideas, ${completedCount}/${totalParticipants} voted`}
                          >
                            {/* Progress ring */}
                            {cell.status === 'voting' && (
                              <svg className="absolute inset-0 w-full h-full -rotate-90">
                                <circle
                                  cx="32"
                                  cy="32"
                                  r="28"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  className="text-yellow-500"
                                  strokeDasharray={`${progress * 1.76} 176`}
                                />
                              </svg>
                            )}
                            <div className="text-center z-10">
                              <div className={`text-sm font-bold ${
                                cell.status === 'completed' ? 'text-green-400' : 'text-white'
                              }`}>
                                {cell.ideaIds.length}
                              </div>
                              <div className="text-xs text-slate-400">ideas</div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Arrow to next tier */}
                      {isCompletedTier && tier < currentTier && (
                        <div className="flex items-center px-2">
                          <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Winners from this tier */}
                    {isCompletedTier && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tierCells.map(cell => {
                          const winnerIdea = ideas.find(i => i.id === cell.winner)
                          if (!winnerIdea) return null
                          return (
                            <div
                              key={cell.id + '-winner'}
                              className="text-xs bg-green-600/20 text-green-300 px-2 py-1 rounded border border-green-500/30"
                            >
                              {winnerIdea.text.length > 40 ? winnerIdea.text.substring(0, 40) + '...' : winnerIdea.text}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Summary stats */}
            <div className="mt-6 pt-4 border-t border-slate-700 grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{participants.length}</div>
                <div className="text-xs text-slate-400">Participants</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{ideas.length}</div>
                <div className="text-xs text-slate-400">Ideas</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{cells.length}</div>
                <div className="text-xs text-slate-400">Total Cells</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">{currentTier}</div>
                <div className="text-xs text-slate-400">Current Tier</div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        {phase !== 'setup' && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={reset}
              disabled={running}
              className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
            >
              {running ? 'Running...' : 'Reset Demo'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
