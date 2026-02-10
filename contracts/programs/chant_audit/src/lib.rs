use anchor_lang::prelude::*;

declare_id!("CyjjTdnnVKgqKjnjRnz9g8wgc1LBWs2d1QEjqzbCCJUh");

/// Maximum lengths for variable-size fields
const MAX_CHANT_ID: usize = 32;
const MAX_QUESTION: usize = 500;
const MAX_IDEA_TEXT: usize = 1000;
const MAX_AUTHOR_ID: usize = 32;
const MAX_IDEAS_PER_CELL: usize = 10;
const MAX_ALLOCATIONS: usize = 10;
const MAX_ADVANCING: usize = 200;

#[program]
pub mod chant_audit {
    use super::*;

    // ═══════════════════════════════════════════════════
    // Initialize a chant record on-chain
    // ═══════════════════════════════════════════════════

    pub fn initialize_chant(
        ctx: Context<InitializeChant>,
        chant_id: String,
        question: String,
        cell_size: u8,
        continuous_flow: bool,
    ) -> Result<()> {
        require!(chant_id.len() <= MAX_CHANT_ID, AuditError::StringTooLong);
        require!(question.len() <= MAX_QUESTION, AuditError::StringTooLong);
        require!(cell_size >= 3 && cell_size <= 7, AuditError::InvalidCellSize);

        let chant = &mut ctx.accounts.chant;
        chant.authority = ctx.accounts.authority.key();
        chant.chant_id = chant_id;
        chant.question = question;
        chant.cell_size = cell_size;
        chant.continuous_flow = continuous_flow;
        chant.phase = Phase::Submission as u8;
        chant.current_tier = 0;
        chant.idea_count = 0;
        chant.cell_count = 0;
        chant.created_at = Clock::get()?.unix_timestamp;
        chant.bump = ctx.bumps.chant;

        emit!(ChantInitialized {
            chant: chant.key(),
            chant_id: chant.chant_id.clone(),
            question: chant.question.clone(),
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Record an idea submission
    // ═══════════════════════════════════════════════════

    pub fn record_idea(
        ctx: Context<RecordIdea>,
        idea_index: u16,
        text: String,
        author_id: String,
    ) -> Result<()> {
        require!(text.len() <= MAX_IDEA_TEXT, AuditError::StringTooLong);
        require!(author_id.len() <= MAX_AUTHOR_ID, AuditError::StringTooLong);

        let chant = &mut ctx.accounts.chant;
        require!(
            ctx.accounts.authority.key() == chant.authority,
            AuditError::Unauthorized
        );
        require!(idea_index == chant.idea_count, AuditError::IndexMismatch);

        let idea = &mut ctx.accounts.idea;
        idea.chant = chant.key();
        idea.index = idea_index;
        idea.text = text;
        idea.author_id = author_id;
        idea.status = IdeaStatus::Submitted as u8;
        idea.tier = 0;
        idea.total_xp = 0;
        idea.created_at = Clock::get()?.unix_timestamp;
        idea.bump = ctx.bumps.idea;

        chant.idea_count = chant.idea_count.checked_add(1).unwrap();

        emit!(IdeaRecorded {
            chant: chant.key(),
            idea_index,
            author_id: idea.author_id.clone(),
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Record a cell creation
    // ═══════════════════════════════════════════════════

    pub fn record_cell(
        ctx: Context<RecordCell>,
        cell_index: u16,
        tier: u8,
        batch: u8,
        idea_indices: Vec<u16>,
    ) -> Result<()> {
        require!(
            idea_indices.len() <= MAX_IDEAS_PER_CELL,
            AuditError::TooManyItems
        );

        let chant = &mut ctx.accounts.chant;
        require!(
            ctx.accounts.authority.key() == chant.authority,
            AuditError::Unauthorized
        );
        require!(cell_index == chant.cell_count, AuditError::IndexMismatch);

        let cell = &mut ctx.accounts.cell;
        cell.chant = chant.key();
        cell.index = cell_index;
        cell.tier = tier;
        cell.batch = batch;
        cell.status = CellStatus::Voting as u8;
        cell.idea_indices = idea_indices;
        cell.voter_count = 0;
        cell.created_at = Clock::get()?.unix_timestamp;
        cell.bump = ctx.bumps.cell;

        chant.cell_count = chant.cell_count.checked_add(1).unwrap();

        emit!(CellRecorded {
            chant: chant.key(),
            cell_index,
            tier,
            batch,
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Record a vote (allocation vector)
    // ═══════════════════════════════════════════════════

    pub fn record_vote(
        ctx: Context<RecordVote>,
        voter_id: String,
        allocations: Vec<Allocation>,
    ) -> Result<()> {
        require!(voter_id.len() <= MAX_AUTHOR_ID, AuditError::StringTooLong);
        require!(
            allocations.len() <= MAX_ALLOCATIONS,
            AuditError::TooManyItems
        );

        let chant = &ctx.accounts.chant;
        require!(
            ctx.accounts.authority.key() == chant.authority,
            AuditError::Unauthorized
        );

        // Validate total points = 10
        let total: u16 = allocations.iter().map(|a| a.points as u16).sum();
        require!(total == 10, AuditError::InvalidPointTotal);

        let cell = &mut ctx.accounts.cell;
        let vote = &mut ctx.accounts.vote;

        vote.cell = cell.key();
        vote.voter_id = voter_id;
        vote.allocations = allocations;
        vote.voted_at = Clock::get()?.unix_timestamp;
        vote.bump = ctx.bumps.vote;

        cell.voter_count = cell.voter_count.checked_add(1).unwrap();

        emit!(VoteRecorded {
            chant: chant.key(),
            cell: cell.key(),
            voter_id: vote.voter_id.clone(),
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Record tier completion results
    // ═══════════════════════════════════════════════════

    pub fn record_tier_result(
        ctx: Context<RecordTierResult>,
        tier: u8,
        advancing_indices: Vec<u16>,
        xp_totals: Vec<XpEntry>,
    ) -> Result<()> {
        require!(
            advancing_indices.len() <= MAX_ADVANCING,
            AuditError::TooManyItems
        );

        let chant = &mut ctx.accounts.chant;
        require!(
            ctx.accounts.authority.key() == chant.authority,
            AuditError::Unauthorized
        );

        let result = &mut ctx.accounts.tier_result;
        result.chant = chant.key();
        result.tier = tier;
        result.advancing_indices = advancing_indices;
        result.xp_totals = xp_totals;
        result.completed_at = Clock::get()?.unix_timestamp;
        result.bump = ctx.bumps.tier_result;

        chant.current_tier = tier;

        emit!(TierCompleted {
            chant: chant.key(),
            tier,
            advancing_count: result.advancing_indices.len() as u16,
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Declare champion — the go-ahead key
    // ═══════════════════════════════════════════════════

    pub fn declare_champion(
        ctx: Context<DeclareChampion>,
        idea_index: u16,
        text_hash: [u8; 32],
        total_tiers: u8,
        total_voters: u16,
    ) -> Result<()> {
        let chant = &mut ctx.accounts.chant;
        require!(
            ctx.accounts.authority.key() == chant.authority,
            AuditError::Unauthorized
        );
        require!(
            idea_index < chant.idea_count,
            AuditError::IndexMismatch
        );

        let champion = &mut ctx.accounts.champion;
        champion.chant = chant.key();
        champion.idea_index = idea_index;
        champion.text_hash = text_hash;
        champion.total_tiers = total_tiers;
        champion.total_voters = total_voters;
        champion.declared_at = Clock::get()?.unix_timestamp;
        champion.bump = ctx.bumps.champion;

        chant.phase = Phase::Completed as u8;

        emit!(ChampionDeclared {
            chant: chant.key(),
            idea_index,
            total_tiers,
            total_voters,
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════
    // Update phase (SUBMISSION → VOTING → COMPLETED)
    // ═══════════════════════════════════════════════════

    pub fn update_phase(ctx: Context<UpdatePhase>, new_phase: u8) -> Result<()> {
        let chant = &mut ctx.accounts.chant;
        require!(
            ctx.accounts.authority.key() == chant.authority,
            AuditError::Unauthorized
        );
        require!(new_phase <= 3, AuditError::InvalidPhase);

        let old_phase = chant.phase;
        chant.phase = new_phase;

        emit!(PhaseUpdated {
            chant: chant.key(),
            old_phase,
            new_phase,
        });

        Ok(())
    }
}

// ═══════════════════════════════════════════════════════
// Account contexts
// ═══════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(chant_id: String, question: String)]
pub struct InitializeChant<'info> {
    #[account(
        init,
        payer = authority,
        space = Chant::space(&chant_id, &question),
        seeds = [b"chant", chant_id.as_bytes()],
        bump,
    )]
    pub chant: Account<'info, Chant>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(idea_index: u16, text: String, author_id: String)]
pub struct RecordIdea<'info> {
    #[account(mut)]
    pub chant: Account<'info, Chant>,

    #[account(
        init,
        payer = authority,
        space = Idea::space(&text, &author_id),
        seeds = [b"idea", chant.key().as_ref(), &idea_index.to_le_bytes()],
        bump,
    )]
    pub idea: Account<'info, Idea>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cell_index: u16, tier: u8, batch: u8, idea_indices: Vec<u16>)]
pub struct RecordCell<'info> {
    #[account(mut)]
    pub chant: Account<'info, Chant>,

    #[account(
        init,
        payer = authority,
        space = Cell::space(&idea_indices),
        seeds = [b"cell", chant.key().as_ref(), &cell_index.to_le_bytes()],
        bump,
    )]
    pub cell: Account<'info, Cell>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(voter_id: String, allocations: Vec<Allocation>)]
pub struct RecordVote<'info> {
    pub chant: Account<'info, Chant>,

    #[account(mut)]
    pub cell: Account<'info, Cell>,

    #[account(
        init,
        payer = authority,
        space = VoteRecord::space(&voter_id, &allocations),
        seeds = [b"vote", cell.key().as_ref(), voter_id.as_bytes()],
        bump,
    )]
    pub vote: Account<'info, VoteRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tier: u8, advancing_indices: Vec<u16>, xp_totals: Vec<XpEntry>)]
pub struct RecordTierResult<'info> {
    #[account(mut)]
    pub chant: Account<'info, Chant>,

    #[account(
        init,
        payer = authority,
        space = TierResult::space(&advancing_indices, &xp_totals),
        seeds = [b"tier", chant.key().as_ref(), &[tier]],
        bump,
    )]
    pub tier_result: Account<'info, TierResult>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeclareChampion<'info> {
    #[account(mut)]
    pub chant: Account<'info, Chant>,

    #[account(
        init,
        payer = authority,
        space = Champion::SPACE,
        seeds = [b"champion", chant.key().as_ref()],
        bump,
    )]
    pub champion: Account<'info, Champion>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePhase<'info> {
    #[account(mut)]
    pub chant: Account<'info, Chant>,

    pub authority: Signer<'info>,
}

// ═══════════════════════════════════════════════════════
// Account structs
// ═══════════════════════════════════════════════════════

#[account]
pub struct Chant {
    pub authority: Pubkey,       // 32
    pub chant_id: String,        // 4 + len
    pub question: String,        // 4 + len
    pub cell_size: u8,           // 1
    pub continuous_flow: bool,   // 1
    pub phase: u8,               // 1
    pub current_tier: u8,        // 1
    pub idea_count: u16,         // 2
    pub cell_count: u16,         // 2
    pub created_at: i64,         // 8
    pub bump: u8,                // 1
}

impl Chant {
    pub fn space(chant_id: &str, question: &str) -> usize {
        8 +   // discriminator
        32 +  // authority
        4 + chant_id.len() +  // chant_id (String)
        4 + question.len() +  // question (String)
        1 +   // cell_size
        1 +   // continuous_flow
        1 +   // phase
        1 +   // current_tier
        2 +   // idea_count
        2 +   // cell_count
        8 +   // created_at
        1     // bump
    }
}

#[account]
pub struct Idea {
    pub chant: Pubkey,           // 32
    pub index: u16,              // 2
    pub text: String,            // 4 + len
    pub author_id: String,       // 4 + len
    pub status: u8,              // 1
    pub tier: u8,                // 1
    pub total_xp: u16,           // 2
    pub created_at: i64,         // 8
    pub bump: u8,                // 1
}

impl Idea {
    pub fn space(text: &str, author_id: &str) -> usize {
        8 +   // discriminator
        32 +  // chant
        2 +   // index
        4 + text.len() +      // text
        4 + author_id.len() + // author_id
        1 +   // status
        1 +   // tier
        2 +   // total_xp
        8 +   // created_at
        1     // bump
    }
}

#[account]
pub struct Cell {
    pub chant: Pubkey,           // 32
    pub index: u16,              // 2
    pub tier: u8,                // 1
    pub batch: u8,               // 1
    pub status: u8,              // 1
    pub idea_indices: Vec<u16>,  // 4 + 2 * len
    pub voter_count: u8,         // 1
    pub created_at: i64,         // 8
    pub bump: u8,                // 1
}

impl Cell {
    pub fn space(idea_indices: &[u16]) -> usize {
        8 +   // discriminator
        32 +  // chant
        2 +   // index
        1 +   // tier
        1 +   // batch
        1 +   // status
        4 + 2 * idea_indices.len() + // idea_indices
        1 +   // voter_count
        8 +   // created_at
        1     // bump
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Allocation {
    pub idea_index: u16,
    pub points: u8,
}

#[account]
pub struct VoteRecord {
    pub cell: Pubkey,            // 32
    pub voter_id: String,        // 4 + len
    pub allocations: Vec<Allocation>, // 4 + 3 * len
    pub voted_at: i64,           // 8
    pub bump: u8,                // 1
}

impl VoteRecord {
    pub fn space(voter_id: &str, allocations: &[Allocation]) -> usize {
        8 +   // discriminator
        32 +  // cell
        4 + voter_id.len() +  // voter_id
        4 + 3 * allocations.len() + // allocations (u16 + u8 = 3 bytes each)
        8 +   // voted_at
        1     // bump
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct XpEntry {
    pub idea_index: u16,
    pub total_xp: u16,
}

#[account]
pub struct TierResult {
    pub chant: Pubkey,                // 32
    pub tier: u8,                     // 1
    pub advancing_indices: Vec<u16>,  // 4 + 2 * len
    pub xp_totals: Vec<XpEntry>,     // 4 + 4 * len
    pub completed_at: i64,            // 8
    pub bump: u8,                     // 1
}

impl TierResult {
    pub fn space(advancing: &[u16], xp_totals: &[XpEntry]) -> usize {
        8 +   // discriminator
        32 +  // chant
        1 +   // tier
        4 + 2 * advancing.len() +   // advancing_indices
        4 + 4 * xp_totals.len() +   // xp_totals (u16 + u16 = 4 bytes each)
        8 +   // completed_at
        1     // bump
    }
}

#[account]
pub struct Champion {
    pub chant: Pubkey,           // 32
    pub idea_index: u16,         // 2
    pub text_hash: [u8; 32],     // 32
    pub total_tiers: u8,         // 1
    pub total_voters: u16,       // 2
    pub declared_at: i64,        // 8
    pub bump: u8,                // 1
}

impl Champion {
    pub const SPACE: usize =
        8 +   // discriminator
        32 +  // chant
        2 +   // idea_index
        32 +  // text_hash
        1 +   // total_tiers
        2 +   // total_voters
        8 +   // declared_at
        1;    // bump
}

// ═══════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════

#[repr(u8)]
pub enum Phase {
    Submission = 0,
    Voting = 1,
    Accumulating = 2,
    Completed = 3,
}

#[repr(u8)]
pub enum IdeaStatus {
    Submitted = 0,
    InVoting = 1,
    Advancing = 2,
    Eliminated = 3,
    Winner = 4,
}

#[repr(u8)]
pub enum CellStatus {
    Voting = 0,
    Completed = 1,
}

// ═══════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════

#[event]
pub struct ChantInitialized {
    pub chant: Pubkey,
    pub chant_id: String,
    pub question: String,
}

#[event]
pub struct IdeaRecorded {
    pub chant: Pubkey,
    pub idea_index: u16,
    pub author_id: String,
}

#[event]
pub struct CellRecorded {
    pub chant: Pubkey,
    pub cell_index: u16,
    pub tier: u8,
    pub batch: u8,
}

#[event]
pub struct VoteRecorded {
    pub chant: Pubkey,
    pub cell: Pubkey,
    pub voter_id: String,
}

#[event]
pub struct TierCompleted {
    pub chant: Pubkey,
    pub tier: u8,
    pub advancing_count: u16,
}

#[event]
pub struct ChampionDeclared {
    pub chant: Pubkey,
    pub idea_index: u16,
    pub total_tiers: u8,
    pub total_voters: u16,
}

#[event]
pub struct PhaseUpdated {
    pub chant: Pubkey,
    pub old_phase: u8,
    pub new_phase: u8,
}

// ═══════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════

#[error_code]
pub enum AuditError {
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Cell size must be between 3 and 7")]
    InvalidCellSize,
    #[msg("Not authorized")]
    Unauthorized,
    #[msg("Index does not match expected sequence")]
    IndexMismatch,
    #[msg("Too many items in vector")]
    TooManyItems,
    #[msg("Vote points must sum to 10")]
    InvalidPointTotal,
    #[msg("Invalid phase value")]
    InvalidPhase,
}
