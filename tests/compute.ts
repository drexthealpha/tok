import type { Instruction } from '@solana/kit';
import { COMPUTE_BUDGET_PROGRAM } from '@tok/core';

export function getSetComputeUnitLimitInstruction(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}
