/** Reads the `cycle=YYYY-MM` query of Home: the current cycle when absent; null when invalid or in the future. */
import { isIsoMonth } from '../dates';
import { cycleOf, cycleStartingIn, shiftCycle, type Cycle } from '../cycle';

export interface CycleChoice {
  cycle: Cycle;
  previousCycle: Cycle;
  /** The cycle containing today. */
  current: Cycle;
}

export function chooseCycle(param: string | null, startDay: number, today: string): CycleChoice | null {
  const current = cycleOf(today, startDay);
  if (param !== null && !isIsoMonth(param)) return null;
  const cycle = param === null ? current : cycleStartingIn(param, startDay);
  if (cycle.start > current.start) return null;
  return { cycle, previousCycle: shiftCycle(cycle, -1, startDay), current };
}
