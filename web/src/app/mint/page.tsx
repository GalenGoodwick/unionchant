'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'

type MintInfo = {
  badge: { priceUsd: number; priceLamports: string; priceSol: number }
  supporter: { priceUsd: number; priceLamports: string; priceSol: number }
  solPriceUsd: number
  paymentAddress: string | null
  network: string
}

type MintResult = {
  badge: {
    id: string
    foresightScore: number
    isSupporter: boolean
    proof: {
      memoTxSignature: string | null
      paymentTxSignature: string
      explorer: string | null
    }
    mintedAt: string
  }
}

type ScoreData = {
  foresightApprox: number
  participation: number
  ideaViability: number
  votingAccuracy: number
  commentStrength: number
  deliberations: number
  ideas: number
  votes: number
}

export default function MintPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const wallet = useWallet()
  const { setVisible: openWalletModal } = useWalletModal()

  const [mintInfo, setMintInfo] = useState<MintInfo | null>(null)
  const [score, setScore] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [minting, setMinting] = useState(false)
  const [mintStep, setMintStep] = useState('')
  const [result, setResult] = useState<MintResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/badges/mint').then(r => r.json()),
      session ? fetch('/api/my-score').then(r => r.json()) : null,
    ]).then(([info, scoreData]) => {
      if (info.badge) setMintInfo(info)
      if (scoreData?.foresightApprox !== undefined) setScore(scoreData)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [session])

  const handleMint = async (tier: 'badge' | 'supporter') => {
    if (!wallet.publicKey || !wallet.sendTransaction || !mintInfo?.paymentAddress) {
      setError('Connect your wallet first')
      return
    }

    setMinting(true)
    setError('')
    setMintStep('Preparing transaction...')

    try {
      const priceLamports = tier === 'supporter'
        ? BigInt(mintInfo.supporter.priceLamports)
        : BigInt(mintInfo.badge.priceLamports)

      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
        || (mintInfo.network === 'mainnet-beta'
          ? 'https://api.mainnet-beta.solana.com'
          : 'https://api.devnet.solana.com')
      const connection = new Connection(rpcUrl)

      // Build SOL transfer transaction
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey(mintInfo.paymentAddress),
          lamports: priceLamports,
        })
      )
      tx.feePayer = wallet.publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

      setMintStep('Approve in wallet...')
      const txSignature = await wallet.sendTransaction(tx, connection)

      setMintStep('Confirming transaction...')
      await connection.confirmTransaction(txSignature, 'confirmed')

      setMintStep('Minting badge on-chain...')
      const res = await fetch('/api/badges/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txSignature, tier }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Mint failed')

      setResult(data)
      setMintStep('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mint failed'
      setError(msg.includes('User rejected') ? 'Transaction cancelled' : msg)
      setMintStep('')
    } finally {
      setMinting(false)
    }
  }

  if (!session) {
    return (
      <FrameLayout active="foresight" showBack>
        <div className="text-center py-12 space-y-3">
          <p className="text-muted text-sm">Sign in to mint your Foresight Badge</p>
          <Link href="/auth/signin" className="inline-block px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg">
            Sign In
          </Link>
        </div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout active="foresight" showBack>
      <div className="py-4 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Mint Foresight Badge</h1>
          <p className="text-xs text-muted mt-0.5">
            Record your reputation on-chain. Permanent, verifiable proof on Solana.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-muted animate-pulse text-sm">Loading...</div>
          </div>
        ) : result ? (
          /* ── Success ── */
          <div className="space-y-4">
            <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-center space-y-2">
              <div className="text-success text-2xl font-bold font-mono">
                {result.badge.foresightScore.toFixed(2)}
              </div>
              <p className="text-xs text-success font-medium">
                {result.badge.isSupporter ? 'Supporter Badge Minted' : 'Badge Minted'}
              </p>
              <p className="text-[10px] text-muted">
                {new Date(result.badge.mintedAt).toLocaleString()}
              </p>
            </div>

            {result.badge.proof.explorer && (
              <a
                href={result.badge.proof.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 text-center text-xs font-medium bg-surface border border-border rounded-lg text-accent hover:bg-surface-hover transition-colors"
              >
                View on Solana Explorer
              </a>
            )}

            {result.badge.proof.paymentTxSignature && (
              <div className="bg-surface/80 border border-border rounded-lg p-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Payment TX</p>
                <p className="text-[10px] font-mono text-foreground/70 break-all">
                  {result.badge.proof.paymentTxSignature}
                </p>
              </div>
            )}

            <button
              onClick={() => router.push('/foresight')}
              className="w-full py-2.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              Back to Foresight
            </button>
          </div>
        ) : (
          /* ── Mint Options ── */
          <div className="space-y-4">
            {/* Current Score Preview */}
            {score && (
              <div className="bg-surface/80 border border-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted uppercase tracking-wider">Your Score</span>
                  <span className={`text-xl font-mono font-bold tabular-nums ${
                    score.foresightApprox >= 0.6 ? 'text-success' : score.foresightApprox >= 0.3 ? 'text-warning' : 'text-muted'
                  }`}>
                    {score.foresightApprox.toFixed(2)}
                  </span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted">
                  <span>{score.deliberations} delibs</span>
                  <span>{score.ideas} ideas</span>
                  <span>{score.votes} votes</span>
                </div>
              </div>
            )}

            {/* Wallet Connection */}
            {!wallet.connected ? (
              <button
                onClick={() => openWalletModal(true)}
                className="w-full py-3 text-sm font-medium bg-surface border-2 border-dashed border-border hover:border-accent/40 rounded-xl text-muted hover:text-accent transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                </svg>
                Connect Wallet
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-lg">
                <div className="w-2 h-2 bg-success rounded-full" />
                <span className="text-[11px] text-success font-medium truncate flex-1">
                  {wallet.publicKey?.toBase58().slice(0, 4)}...{wallet.publicKey?.toBase58().slice(-4)}
                </span>
                <button
                  onClick={() => wallet.disconnect()}
                  className="text-[10px] text-muted hover:text-foreground"
                >
                  Disconnect
                </button>
              </div>
            )}

            {/* Standard Badge */}
            <div className="bg-surface/90 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Foresight Badge</h3>
                  <p className="text-[10px] text-muted mt-0.5">
                    Snapshot your current score on Solana
                  </p>
                </div>
                {mintInfo && (
                  <div className="text-right">
                    <span className="text-lg font-mono font-bold text-foreground">
                      ${mintInfo.badge.priceUsd.toFixed(2)}
                    </span>
                    <p className="text-[9px] text-muted">
                      ~{mintInfo.badge.priceSol.toFixed(4)} SOL
                    </p>
                  </div>
                )}
              </div>
              <ul className="text-[10px] text-muted space-y-0.5 mb-3">
                <li>- Score permanently recorded on-chain</li>
                <li>- Verifiable by anyone via Solana Explorer</li>
                <li>- Embeddable badge with proof link</li>
              </ul>
              <button
                onClick={() => handleMint('badge')}
                disabled={!wallet.connected || minting}
                className="w-full py-2.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {minting && mintStep ? mintStep : 'Mint Badge'}
              </button>
            </div>

            {/* Supporter Badge */}
            <div className="bg-surface/90 border-2 border-success/30 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 px-2 py-0.5 bg-success/20 text-success text-[9px] font-bold uppercase tracking-wider rounded-bl-lg">
                Supporter
              </div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-success">Supporter Badge</h3>
                  <p className="text-[10px] text-muted mt-0.5">
                    Score + all your chants printed to chain
                  </p>
                </div>
                {mintInfo && (
                  <div className="text-right">
                    <span className="text-lg font-mono font-bold text-success">
                      ${mintInfo.supporter.priceUsd.toFixed(2)}
                    </span>
                    <p className="text-[9px] text-muted">
                      ~{mintInfo.supporter.priceSol.toFixed(4)} SOL
                    </p>
                  </div>
                )}
              </div>
              <ul className="text-[10px] text-muted space-y-0.5 mb-3">
                <li>- Everything in standard badge</li>
                <li>- All your deliberations recorded on-chain</li>
                <li>- Supporter outline on your embeddable badge</li>
                <li>- Permanent on-chain proof of every vote and idea</li>
              </ul>
              <button
                onClick={() => handleMint('supporter')}
                disabled={!wallet.connected || minting}
                className="w-full py-2.5 text-xs font-medium bg-success hover:bg-success-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {minting && mintStep ? mintStep : 'Mint Supporter Badge'}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2 bg-error/10 border border-error/30 rounded-lg">
                <p className="text-xs text-error">{error}</p>
              </div>
            )}

            {/* Network Info */}
            {mintInfo && (
              <p className="text-[9px] text-muted/50 text-center">
                Network: {mintInfo.network} | SOL: ${mintInfo.solPriceUsd.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </div>
    </FrameLayout>
  )
}
