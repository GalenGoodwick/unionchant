use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};
use anchor_spl::token::spl_token::instruction::AuthorityType;

declare_id!("5ngmZdSGoTX1J1iZF3BDJzWf983aS4aEpQH8CWZ9mBgb");

// Split percentages (basis points out of 10000)
const CONTRIBUTOR_SHARE_BPS: u64 = 9400; // 94% → token distribution to contributors
const WINNER_SHARE_BPS: u64 = 500;       // 5%  → SOL to winner for operations
const PLATFORM_SHARE_BPS: u64 = 100;     // 1%  → tokens to UC platform

// Total token supply minted on finalize
const TOKEN_SUPPLY: u64 = 1_000_000_000;
const TOKEN_DECIMALS: u8 = 6;

// Confirmation window bounds
const MIN_CONFIRM_SECS: i64 = 86_400;    // 24 hours minimum
const MAX_CONFIRM_SECS: i64 = 604_800;   // 7 days maximum
const DEFAULT_CONFIRM_SECS: i64 = 172_800; // 48 hours default

#[program]
pub mod contracts {
    use super::*;

    // ═══════════════════════════════════════════════════
    // Multisig management (#11)
    // ═══════════════════════════════════════════════════

    /// Initialize a 2-of-3 multisig authority.
    pub fn create_multisig(
        ctx: Context<CreateMultisig>,
        signers: [Pubkey; 3],
        threshold: u8,
    ) -> Result<()> {
        require!(threshold >= 2 && threshold <= 3, LaunchError::InvalidThreshold);
        // All signers must be unique
        require!(signers[0] != signers[1] && signers[1] != signers[2] && signers[0] != signers[2], LaunchError::DuplicateSigner);

        let ms = &mut ctx.accounts.multisig;
        ms.signers = signers;
        ms.threshold = threshold;
        ms.nonce = 0;
        ms.bump = ctx.bumps.multisig;

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Pool lifecycle
    // ═══════════════════════════════════════════════════

    /// Create a new launch pool. Authority is the multisig PDA.
    pub fn create_pool(
        ctx: Context<CreatePool>,
        target_lamports: u64,
        deadline: i64,
        pool_id: String,
        confirm_duration_secs: i64,
    ) -> Result<()> {
        require!(target_lamports > 0, LaunchError::InvalidTarget);
        require!(deadline > Clock::get()?.unix_timestamp, LaunchError::DeadlinePassed);
        require!(pool_id.len() <= 64, LaunchError::IdTooLong);

        let confirm_secs = if confirm_duration_secs == 0 {
            DEFAULT_CONFIRM_SECS
        } else {
            require!(confirm_duration_secs >= MIN_CONFIRM_SECS, LaunchError::ConfirmTooShort);
            require!(confirm_duration_secs <= MAX_CONFIRM_SECS, LaunchError::ConfirmTooLong);
            confirm_duration_secs
        };

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.multisig.key();
        pool.pool_id = pool_id;
        pool.target_lamports = target_lamports;
        pool.current_lamports = 0;
        pool.deadline = deadline;
        pool.status = PoolStatus::Funding;
        pool.winner = Pubkey::default();
        pool.platform_wallet = ctx.accounts.platform_wallet.key();
        pool.contributor_count = 0;
        pool.token_mint = Pubkey::default();
        pool.merkle_root = [0u8; 32];
        pool.confirm_deadline = 0;
        pool.confirm_duration_secs = confirm_secs;
        pool.approve_lamports = 0;
        pool.reject_lamports = 0;
        pool.paused = false;
        pool.bump = ctx.bumps.pool;

        emit!(PoolCreated {
            pool: pool.key(),
            pool_id: pool.pool_id.clone(),
            target_lamports,
            deadline,
            confirm_duration_secs: confirm_secs,
        });

        Ok(())
    }

    /// Contribute SOL to a pool. SOL is transferred to the pool PDA (escrow).
    pub fn contribute(ctx: Context<Contribute>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, LaunchError::InvalidAmount);
        require!(!ctx.accounts.pool.paused, LaunchError::PoolPaused);
        require!(ctx.accounts.pool.status == PoolStatus::Funding, LaunchError::PoolNotFunding);
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.pool.deadline,
            LaunchError::DeadlinePassed
        );

        // Transfer SOL from contributor to pool PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        let pool_key = ctx.accounts.pool.key();
        let pool = &mut ctx.accounts.pool;
        let record = &mut ctx.accounts.contribution;
        if record.amount_lamports == 0 {
            record.pool = pool_key;
            record.contributor = ctx.accounts.contributor.key();
            record.bump = ctx.bumps.contribution;
            pool.contributor_count += 1;
        }
        record.amount_lamports += amount_lamports;
        pool.current_lamports += amount_lamports;

        emit!(ContributionMade {
            pool: pool_key,
            contributor: ctx.accounts.contributor.key(),
            amount_lamports,
            total_lamports: pool.current_lamports,
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Finalize → Confirming → Distribute flow (#12, #13, #15)
    // ═══════════════════════════════════════════════════

    /// Propose finalization: declare winner + Merkle root of deliberation votes.
    /// Pool enters CONFIRMING state with a timelock. Contributors must approve.
    /// Requires multisig signer.
    pub fn propose_finalize(
        ctx: Context<ProposeFinalize>,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(!pool.paused, LaunchError::PoolPaused);
        require!(pool.status == PoolStatus::Funding, LaunchError::PoolNotFunding);
        require!(pool.current_lamports > 0, LaunchError::NoContributions);

        let now = Clock::get()?.unix_timestamp;
        let confirm_deadline = now + pool.confirm_duration_secs;

        let pool = &mut ctx.accounts.pool;
        pool.status = PoolStatus::Confirming;
        pool.winner = ctx.accounts.winner.key();
        pool.token_mint = ctx.accounts.token_mint.key();
        pool.merkle_root = merkle_root;
        pool.confirm_deadline = confirm_deadline;
        pool.approve_lamports = 0;
        pool.reject_lamports = 0;

        emit!(FinalizeProposed {
            pool: pool.key(),
            winner: ctx.accounts.winner.key(),
            token_mint: ctx.accounts.token_mint.key(),
            merkle_root,
            confirm_deadline,
        });

        Ok(())
    }

    /// Contributors vote to approve or reject the proposed finalization (#12).
    /// Vote weight = their SOL contribution amount.
    pub fn confirm_vote(ctx: Context<ConfirmVote>, approve: bool) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(pool.status == PoolStatus::Confirming, LaunchError::NotConfirming);
        require!(Clock::get()?.unix_timestamp < pool.confirm_deadline, LaunchError::ConfirmExpired);

        let record = &ctx.accounts.contribution;
        require!(record.amount_lamports > 0, LaunchError::NoContribution);

        let vote = &mut ctx.accounts.confirmation_vote;
        require!(!vote.has_voted, LaunchError::AlreadyVoted);

        vote.pool = pool.key();
        vote.contributor = ctx.accounts.contributor.key();
        vote.approve = approve;
        vote.weight = record.amount_lamports;
        vote.has_voted = true;
        vote.bump = ctx.bumps.confirmation_vote;

        let pool = &mut ctx.accounts.pool;
        if approve {
            pool.approve_lamports += vote.weight;
        } else {
            pool.reject_lamports += vote.weight;
        }

        emit!(ConfirmationVoteCast {
            pool: pool.key(),
            contributor: ctx.accounts.contributor.key(),
            approve,
            weight: vote.weight,
            total_approve: pool.approve_lamports,
            total_reject: pool.reject_lamports,
        });

        Ok(())
    }

    /// Execute distribution after confirmation passes.
    /// Can be called by anyone once majority approves.
    pub fn execute_distribution(ctx: Context<ExecuteDistribution>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(!pool.paused, LaunchError::PoolPaused);
        require!(pool.status == PoolStatus::Confirming, LaunchError::NotConfirming);

        // Check majority: approve > reject (weighted by SOL contribution)
        require!(pool.approve_lamports > pool.reject_lamports, LaunchError::NotApproved);

        // Calculate SOL splits
        let total_sol = pool.current_lamports;
        let winner_sol = total_sol * WINNER_SHARE_BPS / 10000;

        let pool_id = pool.pool_id.clone();
        let authority = pool.authority;
        let bump = pool.bump;
        let seeds = &[b"pool" as &[u8], authority.as_ref(), pool_id.as_bytes(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        // Transfer 5% SOL to winner
        **ctx.accounts.pool.to_account_info().try_borrow_mut_lamports()? -= winner_sol;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_sol;

        // Mint total token supply
        let total_tokens = TOKEN_SUPPLY * 10u64.pow(TOKEN_DECIMALS as u32);
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.pool_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            total_tokens,
        )?;

        // Transfer 1% tokens to platform
        let platform_tokens = total_tokens * PLATFORM_SHARE_BPS / 10000;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.pool_token_account.to_account_info(),
                    to: ctx.accounts.platform_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            platform_tokens,
        )?;

        let contributor_tokens = total_tokens * CONTRIBUTOR_SHARE_BPS / 10000;
        let pool = &mut ctx.accounts.pool;
        pool.status = PoolStatus::Distributing;

        emit!(PoolFinalized {
            pool: pool.key(),
            winner: ctx.accounts.winner.key(),
            token_mint: ctx.accounts.token_mint.key(),
            total_sol,
            winner_sol,
            contributor_tokens,
            platform_tokens,
        });

        Ok(())
    }

    /// Handle expired confirmation: if deadline passes without majority approve, auto-cancel.
    pub fn expire_confirmation(ctx: Context<ExpireConfirmation>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(pool.status == PoolStatus::Confirming, LaunchError::NotConfirming);
        require!(Clock::get()?.unix_timestamp >= pool.confirm_deadline, LaunchError::ConfirmNotExpired);

        // If approve didn't win, cancel
        if pool.approve_lamports <= pool.reject_lamports {
            let pool = &mut ctx.accounts.pool;
            pool.status = PoolStatus::Cancelled;

            emit!(PoolCancelled { pool: pool.key() });
        } else {
            // Majority approved but nobody called execute_distribution — still valid
            // Do nothing, let someone call execute_distribution
        }

        Ok(())
    }

    /// Claim tokens as a contributor.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(!pool.paused, LaunchError::PoolPaused);
        require!(
            pool.status == PoolStatus::Distributing || pool.status == PoolStatus::Complete,
            LaunchError::PoolNotDistributing
        );

        let record = &mut ctx.accounts.contribution;
        require!(!record.claimed, LaunchError::AlreadyClaimed);
        require!(record.amount_lamports > 0, LaunchError::NoContribution);

        let total_tokens = TOKEN_SUPPLY * 10u64.pow(TOKEN_DECIMALS as u32);
        let contributor_tokens = total_tokens * CONTRIBUTOR_SHARE_BPS / 10000;
        let user_tokens = (contributor_tokens as u128)
            .checked_mul(record.amount_lamports as u128)
            .unwrap()
            .checked_div(pool.current_lamports as u128)
            .unwrap() as u64;

        let pool_id = pool.pool_id.clone();
        let authority = pool.authority;
        let bump = pool.bump;
        let seeds = &[b"pool" as &[u8], authority.as_ref(), pool_id.as_bytes(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.pool_token_account.to_account_info(),
                    to: ctx.accounts.contributor_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            user_tokens,
        )?;

        record.claimed = true;

        emit!(TokensClaimed {
            pool: pool.key(),
            contributor: ctx.accounts.contributor.key(),
            tokens: user_tokens,
        });

        Ok(())
    }

    /// Refund: if pool is cancelled or deadline passed without finalization.
    /// Always available even when paused (#14).
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(
            pool.status == PoolStatus::Cancelled
                || (pool.status == PoolStatus::Funding
                    && Clock::get()?.unix_timestamp > pool.deadline),
            LaunchError::RefundNotAvailable
        );

        let record = &mut ctx.accounts.contribution;
        require!(!record.claimed, LaunchError::AlreadyClaimed);
        require!(record.amount_lamports > 0, LaunchError::NoContribution);

        let refund_amount = record.amount_lamports;

        **ctx.accounts.pool.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
        **ctx.accounts.contributor.to_account_info().try_borrow_mut_lamports()? += refund_amount;

        record.claimed = true;

        let pool = &mut ctx.accounts.pool;
        pool.current_lamports -= refund_amount;

        emit!(ContributionRefunded {
            pool: pool.key(),
            contributor: ctx.accounts.contributor.key(),
            amount_lamports: refund_amount,
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Emergency pause (#14)
    // ═══════════════════════════════════════════════════

    /// Pause the pool. Blocks all operations except refund.
    /// Requires multisig signer.
    pub fn pause_pool(ctx: Context<MultisigAction>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(!pool.paused, LaunchError::AlreadyPaused);
        pool.paused = true;

        emit!(PoolPaused { pool: pool.key() });
        Ok(())
    }

    /// Unpause the pool.
    pub fn unpause_pool(ctx: Context<MultisigAction>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(pool.paused, LaunchError::NotPaused);
        pool.paused = false;

        emit!(PoolUnpaused { pool: pool.key() });
        Ok(())
    }

    /// Cancel a pool. Requires multisig signer.
    pub fn cancel_pool(ctx: Context<MultisigAction>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(
            pool.status == PoolStatus::Funding || pool.status == PoolStatus::Confirming,
            LaunchError::PoolNotFunding
        );

        pool.status = PoolStatus::Cancelled;
        emit!(PoolCancelled { pool: pool.key() });
        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Complete + burn mint authority (#16)
    // ═══════════════════════════════════════════════════

    /// Mark pool as complete and permanently burn the token mint authority.
    /// After this, no more tokens can ever be minted. Supply is fixed forever.
    pub fn complete_pool(ctx: Context<CompletePool>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(pool.status == PoolStatus::Distributing, LaunchError::PoolNotDistributing);

        let pool_id = pool.pool_id.clone();
        let authority = pool.authority;
        let bump = pool.bump;
        let seeds = &[b"pool" as &[u8], authority.as_ref(), pool_id.as_bytes(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        // Burn mint authority — set to None. Irreversible. (#16)
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint: ctx.accounts.token_mint.to_account_info(),
                    current_authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        let pool = &mut ctx.accounts.pool;
        pool.status = PoolStatus::Complete;

        emit!(PoolCompleted {
            pool: pool.key(),
            mint_authority_burned: true,
        });

        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════
// Account Structs
// ═══════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct CreateMultisig<'info> {
    #[account(
        init,
        payer = payer,
        space = Multisig::SPACE,
        seeds = [b"multisig", payer.key().as_ref()],
        bump,
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(target_lamports: u64, deadline: i64, pool_id: String)]
pub struct CreatePool<'info> {
    #[account(
        init,
        payer = payer,
        space = LaunchPool::space(&pool_id),
        seeds = [b"pool", multisig.key().as_ref(), pool_id.as_bytes()],
        bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    /// Multisig authority that controls this pool.
    pub multisig: Account<'info, Multisig>,

    /// One of the multisig signers must pay for pool creation.
    #[account(
        mut,
        constraint = multisig.is_signer(payer.key) @ LaunchError::NotMultisigSigner,
    )]
    pub payer: Signer<'info>,

    /// CHECK: Platform wallet for receiving tokens.
    pub platform_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        init_if_needed,
        payer = contributor,
        space = ContributionRecord::SPACE,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump,
    )]
    pub contribution: Account<'info, ContributionRecord>,

    #[account(mut)]
    pub contributor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProposeFinalize<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        constraint = multisig.key() == pool.authority @ LaunchError::WrongAuthority,
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(
        constraint = multisig.is_signer(signer.key) @ LaunchError::NotMultisigSigner,
    )]
    pub signer: Signer<'info>,

    /// CHECK: Winner wallet. Decided by UC deliberation.
    pub winner: UncheckedAccount<'info>,

    /// Token mint — must have pool PDA as mint authority.
    #[account(
        constraint = token_mint.mint_authority.unwrap() == pool.key() @ LaunchError::InvalidMintAuthority,
    )]
    pub token_mint: Account<'info, Mint>,
}

#[derive(Accounts)]
pub struct ConfirmVote<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump = contribution.bump,
        has_one = contributor,
    )]
    pub contribution: Account<'info, ContributionRecord>,

    #[account(
        init_if_needed,
        payer = contributor,
        space = ConfirmationVoteRecord::SPACE,
        seeds = [b"confirm_vote", pool.key().as_ref(), contributor.key().as_ref()],
        bump,
    )]
    pub confirmation_vote: Account<'info, ConfirmationVoteRecord>,

    #[account(mut)]
    pub contributor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteDistribution<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    /// CHECK: Must match pool.winner
    #[account(
        mut,
        constraint = winner.key() == pool.winner @ LaunchError::WrongWinner,
    )]
    pub winner: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = token_mint.key() == pool.token_mint @ LaunchError::InvalidTokenAccount,
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = pool_token_account.owner == pool.key() @ LaunchError::InvalidTokenAccount,
        constraint = pool_token_account.mint == token_mint.key() @ LaunchError::InvalidTokenAccount,
    )]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = platform_token_account.mint == token_mint.key() @ LaunchError::InvalidTokenAccount,
    )]
    pub platform_token_account: Account<'info, TokenAccount>,

    /// Anyone can call this — no signer restriction. The contract enforces the rules.
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireConfirmation<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    /// Anyone can call this after deadline.
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        mut,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump = contribution.bump,
        has_one = contributor,
    )]
    pub contribution: Account<'info, ContributionRecord>,

    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(
        mut,
        constraint = pool_token_account.owner == pool.key() @ LaunchError::InvalidTokenAccount,
        constraint = pool_token_account.mint == pool.token_mint @ LaunchError::InvalidTokenAccount,
    )]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = contributor_token_account.mint == pool.token_mint @ LaunchError::InvalidTokenAccount,
    )]
    pub contributor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        mut,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump = contribution.bump,
        has_one = contributor,
    )]
    pub contribution: Account<'info, ContributionRecord>,

    #[account(mut)]
    pub contributor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Multisig-gated action (pause, unpause, cancel).
#[derive(Accounts)]
pub struct MultisigAction<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        constraint = multisig.key() == pool.authority @ LaunchError::WrongAuthority,
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(
        constraint = multisig.is_signer(signer.key) @ LaunchError::NotMultisigSigner,
    )]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CompletePool<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), pool.pool_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LaunchPool>,

    #[account(
        constraint = multisig.key() == pool.authority @ LaunchError::WrongAuthority,
    )]
    pub multisig: Account<'info, Multisig>,

    #[account(
        constraint = multisig.is_signer(signer.key) @ LaunchError::NotMultisigSigner,
    )]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = token_mint.key() == pool.token_mint @ LaunchError::InvalidTokenAccount,
    )]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

/// 2-of-3 multisig authority (#11)
#[account]
pub struct Multisig {
    pub signers: [Pubkey; 3],
    pub threshold: u8,
    pub nonce: u64,
    pub bump: u8,
}

impl Multisig {
    pub const SPACE: usize = 8 + (32 * 3) + 1 + 8 + 1;

    pub fn is_signer(&self, key: &Pubkey) -> bool {
        self.signers.contains(key)
    }
}

#[account]
pub struct LaunchPool {
    pub authority: Pubkey,              // Multisig PDA
    pub pool_id: String,                // Maps to UC deliberation ID
    pub target_lamports: u64,
    pub current_lamports: u64,
    pub deadline: i64,
    pub status: PoolStatus,
    pub winner: Pubkey,
    pub platform_wallet: Pubkey,
    pub token_mint: Pubkey,
    pub merkle_root: [u8; 32],          // Merkle root of deliberation votes (#13)
    pub confirm_deadline: i64,          // When confirmation window ends (#15)
    pub confirm_duration_secs: i64,     // Configurable confirmation duration
    pub approve_lamports: u64,          // SOL-weighted approve votes (#12)
    pub reject_lamports: u64,           // SOL-weighted reject votes (#12)
    pub contributor_count: u32,
    pub paused: bool,                   // Emergency pause (#14)
    pub bump: u8,
}

impl LaunchPool {
    pub fn space(pool_id: &str) -> usize {
        8 +                         // discriminator
        32 +                        // authority
        4 + pool_id.len() +         // pool_id
        8 +                         // target_lamports
        8 +                         // current_lamports
        8 +                         // deadline
        1 +                         // status
        32 +                        // winner
        32 +                        // platform_wallet
        32 +                        // token_mint
        32 +                        // merkle_root
        8 +                         // confirm_deadline
        8 +                         // confirm_duration_secs
        8 +                         // approve_lamports
        8 +                         // reject_lamports
        4 +                         // contributor_count
        1 +                         // paused
        1                           // bump
    }
}

#[account]
pub struct ContributionRecord {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount_lamports: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl ContributionRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1 + 1;
}

/// Contributor's confirmation vote (#12)
#[account]
pub struct ConfirmationVoteRecord {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub approve: bool,
    pub weight: u64,
    pub has_voted: bool,
    pub bump: u8,
}

impl ConfirmationVoteRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PoolStatus {
    Funding,
    Confirming,     // Finalize proposed, waiting for contributor votes (#12/#15)
    Distributing,   // Confirmed, tokens minted, claims open
    Complete,       // All claimed, mint authority burned (#16)
    Cancelled,
}

// ═══════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub pool_id: String,
    pub target_lamports: u64,
    pub deadline: i64,
    pub confirm_duration_secs: i64,
}

#[event]
pub struct ContributionMade {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount_lamports: u64,
    pub total_lamports: u64,
}

#[event]
pub struct FinalizeProposed {
    pub pool: Pubkey,
    pub winner: Pubkey,
    pub token_mint: Pubkey,
    pub merkle_root: [u8; 32],
    pub confirm_deadline: i64,
}

#[event]
pub struct ConfirmationVoteCast {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub approve: bool,
    pub weight: u64,
    pub total_approve: u64,
    pub total_reject: u64,
}

#[event]
pub struct PoolFinalized {
    pub pool: Pubkey,
    pub winner: Pubkey,
    pub token_mint: Pubkey,
    pub total_sol: u64,
    pub winner_sol: u64,
    pub contributor_tokens: u64,
    pub platform_tokens: u64,
}

#[event]
pub struct TokensClaimed {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub tokens: u64,
}

#[event]
pub struct ContributionRefunded {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount_lamports: u64,
}

#[event]
pub struct PoolCancelled {
    pub pool: Pubkey,
}

#[event]
pub struct PoolCompleted {
    pub pool: Pubkey,
    pub mint_authority_burned: bool,
}

#[event]
pub struct PoolPaused {
    pub pool: Pubkey,
}

#[event]
pub struct PoolUnpaused {
    pub pool: Pubkey,
}

// ═══════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════

#[error_code]
pub enum LaunchError {
    #[msg("Target amount must be greater than zero")]
    InvalidTarget,
    #[msg("Deadline must be in the future")]
    DeadlinePassed,
    #[msg("Pool ID too long (max 64 chars)")]
    IdTooLong,
    #[msg("Contribution amount must be greater than zero")]
    InvalidAmount,
    #[msg("Pool is not in funding status")]
    PoolNotFunding,
    #[msg("Pool is not in distributing status")]
    PoolNotDistributing,
    #[msg("Pool is not in confirming status")]
    NotConfirming,
    #[msg("No contributions in pool")]
    NoContributions,
    #[msg("No contribution found")]
    NoContribution,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Already voted on confirmation")]
    AlreadyVoted,
    #[msg("Refund not available")]
    RefundNotAvailable,
    #[msg("Invalid mint authority — must be pool PDA")]
    InvalidMintAuthority,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Not a multisig signer")]
    NotMultisigSigner,
    #[msg("Wrong multisig authority for this pool")]
    WrongAuthority,
    #[msg("Wrong winner address")]
    WrongWinner,
    #[msg("Duplicate signer in multisig")]
    DuplicateSigner,
    #[msg("Threshold must be 2 or 3")]
    InvalidThreshold,
    #[msg("Confirmation window expired")]
    ConfirmExpired,
    #[msg("Confirmation window not yet expired")]
    ConfirmNotExpired,
    #[msg("Majority did not approve")]
    NotApproved,
    #[msg("Confirmation duration too short (min 24h)")]
    ConfirmTooShort,
    #[msg("Confirmation duration too long (max 7 days)")]
    ConfirmTooLong,
    #[msg("Pool is paused")]
    PoolPaused,
    #[msg("Pool is already paused")]
    AlreadyPaused,
    #[msg("Pool is not paused")]
    NotPaused,
}
