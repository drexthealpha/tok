//! Tok claim program.
//!
//! A sender locks tokens in a claim account tied to a fresh claim key.
//! Whoever signs with that claim key can claim them. The sender can cancel
//! before a claim, and after the expiry anyone can send the tokens back to
//! the sender. Every close returns the account rent to the recorded rent
//! payer only.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH");

/// Seven days, in seconds.
#[cfg(not(feature = "short-expiry"))]
pub const EXPIRY_SECONDS: i64 = 7 * 24 * 60 * 60;
/// Test build: sixty seconds.
#[cfg(feature = "short-expiry")]
pub const EXPIRY_SECONDS: i64 = 60;

pub const CLAIM_SEED: &[u8] = b"claim";

#[program]
pub mod tok_claim {
    use super::*;

    /// Lock `amount` tokens of `mint` from the sender under `claim_key`.
    pub fn deposit(ctx: Context<Deposit>, claim_key: Pubkey, amount: u64) -> Result<()> {
        require!(amount > 0, TokError::ZeroAmount);
        let now = Clock::get()?.unix_timestamp;
        let claim = &mut ctx.accounts.claim;
        claim.sender = ctx.accounts.sender.key();
        claim.mint = ctx.accounts.mint.key();
        claim.amount = amount;
        claim.claim_key = claim_key;
        claim.created_at = now;
        claim.expires_at = now
            .checked_add(EXPIRY_SECONDS)
            .ok_or(TokError::Overflow)?;
        claim.rent_payer = ctx.accounts.rent_payer.key();
        claim.bump = ctx.bumps.claim;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.sender_tokens.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.sender.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        emit!(Deposited {
            claim: claim.key(),
            sender: claim.sender,
            amount,
            expires_at: claim.expires_at,
        });
        Ok(())
    }

    /// Claim with a signature from the claim key. Tokens go to any token
    /// account of the same mint that the receiver names.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let claim = &ctx.accounts.claim;
        require_keys_eq!(
            ctx.accounts.claim_key.key(),
            claim.claim_key,
            TokError::WrongClaimKey
        );
        let to = ctx.accounts.receiver_tokens.to_account_info();
        payout_and_close(
            claim,
            &ctx.accounts.vault,
            to,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            &ctx.accounts.rent_payer,
        )?;
        emit!(Claimed {
            claim: claim.key(),
            receiver: ctx.accounts.receiver_tokens.owner,
        });
        Ok(())
    }

    /// The sender takes the tokens back before anyone claims them.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let claim = &ctx.accounts.claim;
        let to = ctx.accounts.sender_tokens.to_account_info();
        payout_and_close(
            claim,
            &ctx.accounts.vault,
            to,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            &ctx.accounts.rent_payer,
        )?;
        emit!(Cancelled { claim: claim.key() });
        Ok(())
    }

    /// After the expiry, anyone may send the tokens back to the sender.
    /// The caller receives nothing.
    pub fn return_expired(ctx: Context<ReturnExpired>) -> Result<()> {
        let claim = &ctx.accounts.claim;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= claim.expires_at, TokError::NotExpired);
        let to = ctx.accounts.sender_tokens.to_account_info();
        payout_and_close(
            claim,
            &ctx.accounts.vault,
            to,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            &ctx.accounts.rent_payer,
        )?;
        emit!(Returned { claim: claim.key() });
        Ok(())
    }
}

fn payout_and_close<'info>(
    claim: &Account<'info, ClaimAccount>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    to: AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    rent_payer: &UncheckedAccount<'info>,
) -> Result<()> {
    let key = claim.claim_key;
    let seeds: &[&[u8]] = &[CLAIM_SEED, key.as_ref(), &[claim.bump]];
    let signer = &[seeds];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to,
                authority: claim.to_account_info(),
            },
            signer,
        ),
        vault.amount,
        mint.decimals,
    )?;
    token_interface::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_payer.to_account_info(),
            authority: claim.to_account_info(),
        },
        signer,
    ))?;
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct ClaimAccount {
    pub sender: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub claim_key: Pubkey,
    pub created_at: i64,
    pub expires_at: i64,
    pub rent_payer: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(claim_key: Pubkey)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub rent_payer: Signer<'info>,
    pub sender: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
        token::token_program = token_program,
    )]
    pub sender_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = rent_payer,
        space = 8 + ClaimAccount::INIT_SPACE,
        seeds = [CLAIM_SEED, claim_key.as_ref()],
        bump,
    )]
    pub claim: Account<'info, ClaimAccount>,
    #[account(
        init,
        payer = rent_payer,
        associated_token::mint = mint,
        associated_token::authority = claim,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    pub claim_key: Signer<'info>,
    #[account(
        mut,
        close = rent_payer,
        has_one = mint,
        has_one = rent_payer,
        seeds = [CLAIM_SEED, claim.claim_key.as_ref()],
        bump = claim.bump,
    )]
    pub claim: Account<'info, ClaimAccount>,
    /// CHECK: checked against the recorded rent payer by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = claim,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub receiver_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    pub sender: Signer<'info>,
    #[account(
        mut,
        close = rent_payer,
        has_one = sender @ TokError::NotSender,
        has_one = mint,
        has_one = rent_payer,
        seeds = [CLAIM_SEED, claim.claim_key.as_ref()],
        bump = claim.bump,
    )]
    pub claim: Account<'info, ClaimAccount>,
    /// CHECK: checked against the recorded rent payer by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = claim,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
        token::token_program = token_program,
    )]
    pub sender_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ReturnExpired<'info> {
    #[account(
        mut,
        close = rent_payer,
        has_one = mint,
        has_one = rent_payer,
        seeds = [CLAIM_SEED, claim.claim_key.as_ref()],
        bump = claim.bump,
    )]
    pub claim: Account<'info, ClaimAccount>,
    /// CHECK: checked against the recorded rent payer by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = claim,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = claim.sender,
        token::token_program = token_program,
    )]
    pub sender_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct Deposited {
    pub claim: Pubkey,
    pub sender: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct Claimed {
    pub claim: Pubkey,
    pub receiver: Pubkey,
}

#[event]
pub struct Cancelled {
    pub claim: Pubkey,
}

#[event]
pub struct Returned {
    pub claim: Pubkey,
}

#[error_code]
pub enum TokError {
    #[msg("Amount must be above zero")]
    ZeroAmount,
    #[msg("This link has a different claim key")]
    WrongClaimKey,
    #[msg("Only the sender can cancel")]
    NotSender,
    #[msg("The link has not expired yet")]
    NotExpired,
    #[msg("Number overflow")]
    Overflow,
}
