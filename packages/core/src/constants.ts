import { address, type Address } from '@solana/kit';

/** Tok claim program on devnet. */
export const CLAIM_PROGRAM: Address = address('2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH');
/** Swig smart wallet program (devnet and mainnet). */
export const SWIG_PROGRAM: Address = address('swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB');
/** Circle's devnet USDC. */
export const USDC_MINT: Address = address('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const USDC_DECIMALS = 6;

export const TOKEN_PROGRAM: Address = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM: Address = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const ATA_PROGRAM: Address = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM_PROGRAM: Address = address('11111111111111111111111111111111');
export const COMPUTE_BUDGET_PROGRAM: Address = address('ComputeBudget111111111111111111111111111111');
export const MEMO_PROGRAM: Address = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const SECP256R1_PROGRAM: Address = address('Secp256r1SigVerify1111111111111111111111111');

export const DEVNET_CHAIN_ID = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const DEVNET_RPC = 'https://api.devnet.solana.com';

/** Seven days, in seconds. Must match the program. */
export const EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/**
 * Programs the makers' fee payer signs for. A transaction that calls any
 * other program is refused by Tok's server and by Kora.
 */
export const ALLOWED_PROGRAMS: readonly Address[] = [
  CLAIM_PROGRAM,
  SWIG_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  ATA_PROGRAM,
  SYSTEM_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  MEMO_PROGRAM,
  SECP256R1_PROGRAM,
];
