import {
  AccountRole,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  getU64Encoder,
  type Address,
  type Instruction,
} from '@solana/kit';
import { sha256 } from '@noble/hashes/sha2.js';
import { ATA_PROGRAM, CLAIM_PROGRAM, SYSTEM_PROGRAM } from './constants';

const enc = new TextEncoder();
const addrEnc = getAddressEncoder();
const addrDec = getAddressDecoder();

/** Anchor instruction discriminator: first 8 bytes of sha256("global:<name>"). */
export function discriminator(name: string): Uint8Array {
  return sha256(enc.encode(`global:${name}`)).slice(0, 8);
}
export const CLAIM_ACCOUNT_DISCRIMINATOR = sha256(enc.encode('account:ClaimAccount')).slice(0, 8);

export async function claimAddress(claimKey: Address, program = CLAIM_PROGRAM): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: program,
    seeds: [enc.encode('claim'), addrEnc.encode(claimKey)],
  });
  return pda;
}

export async function associatedTokenAddress(
  owner: Address,
  mint: Address,
  tokenProgram: Address,
): Promise<Address> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM,
    seeds: [addrEnc.encode(owner), addrEnc.encode(tokenProgram), addrEnc.encode(mint)],
  });
  return ata;
}

const w = (address: Address) => ({ address, role: AccountRole.WRITABLE });
const r = (address: Address) => ({ address, role: AccountRole.READONLY });
const ws = (address: Address) => ({ address, role: AccountRole.WRITABLE_SIGNER });
const rs = (address: Address) => ({ address, role: AccountRole.READONLY_SIGNER });

export interface DepositArgs {
  rentPayer: Address;
  sender: Address;
  mint: Address;
  tokenProgram: Address;
  claimKey: Address;
  amount: bigint;
  program?: Address;
}

export async function depositInstruction(a: DepositArgs): Promise<Instruction> {
  const program = a.program ?? CLAIM_PROGRAM;
  const claim = await claimAddress(a.claimKey, program);
  const vault = await associatedTokenAddress(claim, a.mint, a.tokenProgram);
  const senderTokens = await associatedTokenAddress(a.sender, a.mint, a.tokenProgram);
  const data = new Uint8Array(8 + 32 + 8);
  data.set(discriminator('deposit'), 0);
  data.set(addrEnc.encode(a.claimKey), 8);
  data.set(getU64Encoder().encode(a.amount), 40);
  return {
    programAddress: program,
    accounts: [
      ws(a.rentPayer),
      rs(a.sender),
      r(a.mint),
      w(senderTokens),
      w(claim),
      w(vault),
      r(a.tokenProgram),
      r(ATA_PROGRAM),
      r(SYSTEM_PROGRAM),
    ],
    data,
  };
}

export interface CloseArgs {
  claimKey: Address;
  rentPayer: Address;
  mint: Address;
  tokenProgram: Address;
  program?: Address;
}

export async function claimInstruction(
  a: CloseArgs & { receiverTokens: Address },
): Promise<Instruction> {
  const program = a.program ?? CLAIM_PROGRAM;
  const claim = await claimAddress(a.claimKey, program);
  const vault = await associatedTokenAddress(claim, a.mint, a.tokenProgram);
  return {
    programAddress: program,
    accounts: [
      rs(a.claimKey),
      w(claim),
      w(a.rentPayer),
      r(a.mint),
      w(vault),
      w(a.receiverTokens),
      r(a.tokenProgram),
    ],
    data: discriminator('claim'),
  };
}

export async function cancelInstruction(a: CloseArgs & { sender: Address }): Promise<Instruction> {
  const program = a.program ?? CLAIM_PROGRAM;
  const claim = await claimAddress(a.claimKey, program);
  const vault = await associatedTokenAddress(claim, a.mint, a.tokenProgram);
  const senderTokens = await associatedTokenAddress(a.sender, a.mint, a.tokenProgram);
  return {
    programAddress: program,
    accounts: [
      rs(a.sender),
      w(claim),
      w(a.rentPayer),
      r(a.mint),
      w(vault),
      w(senderTokens),
      r(a.tokenProgram),
    ],
    data: discriminator('cancel'),
  };
}

export async function returnInstruction(a: CloseArgs & { sender: Address }): Promise<Instruction> {
  const program = a.program ?? CLAIM_PROGRAM;
  const claim = await claimAddress(a.claimKey, program);
  const vault = await associatedTokenAddress(claim, a.mint, a.tokenProgram);
  const senderTokens = await associatedTokenAddress(a.sender, a.mint, a.tokenProgram);
  return {
    programAddress: program,
    accounts: [w(claim), w(a.rentPayer), r(a.mint), w(vault), w(senderTokens), r(a.tokenProgram)],
    data: discriminator('return_expired'),
  };
}

export interface ClaimRecord {
  sender: Address;
  mint: Address;
  amount: bigint;
  claimKey: Address;
  createdAt: bigint;
  expiresAt: bigint;
  rentPayer: Address;
  bump: number;
}

export const CLAIM_ACCOUNT_SIZE = 8 + 32 + 32 + 8 + 32 + 8 + 8 + 32 + 1;

export function decodeClaim(data: Uint8Array): ClaimRecord {
  if (data.length < CLAIM_ACCOUNT_SIZE) throw new Error('Not a claim account');
  for (let i = 0; i < 8; i++) {
    if (data[i] !== CLAIM_ACCOUNT_DISCRIMINATOR[i]) throw new Error('Not a claim account');
  }
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const a = () => {
    const x = addrDec.decode(data.slice(o, o + 32));
    o += 32;
    return x;
  };
  const u64 = () => {
    const x = v.getBigUint64(o, true);
    o += 8;
    return x;
  };
  const i64 = () => {
    const x = v.getBigInt64(o, true);
    o += 8;
    return x;
  };
  const sender = a();
  const mint = a();
  const amount = u64();
  const claimKey = a();
  const createdAt = i64();
  const expiresAt = i64();
  const rentPayer = a();
  const bump = data[o]!;
  return { sender, mint, amount, claimKey, createdAt, expiresAt, rentPayer, bump };
}
