// Which running processes are a Next dev server — the one rule, in one place.
//
// ⚑ A MODULE OF ITS OWN BECAUSE THE FIRST VERSION KILLED THE WRONG THINGS. Inside
// `dev-guard.mts` this was the inline regex /next-server|next dev|[/ ]next\b/, which
// matches any command line containing the word "next". Run from the project
// directory — which the guard requires, and which is where the founder runs
// everything — that included `grep -rn next lib/`, an editor with a file called
// `next-steps.tsx` open, and any script whose name merely starts with "next-". An
// adversarial review caught it; the inline version had passed every hand-written
// test because none of them looked like ordinary work.
//
// Two things must be true for a process to qualify, and this file owns the first:
// the command is a Next SERVER, or a literal `next dev` invocation. The second — that
// its working directory is this project — stays in the guard, because only the guard
// knows which project it is.
//
// ⚑ IT IS DELIBERATELY NARROW. A false negative leaves a stray server running and the
// founder sees the old ENOENT until they quit it by hand; a false positive kills
// something of theirs with no warning. Those costs are not symmetrical.
export const NEXT_PROCESS = /(?:^|[/\s])next-server(?:\s|$|\()|(?:^|[/\s])next\s+dev(?:\s|$)/;

export function isNextDevCommand(command: string): boolean {
  return NEXT_PROCESS.test(command);
}
