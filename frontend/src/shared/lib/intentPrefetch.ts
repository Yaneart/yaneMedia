export function claimIntentPrefetch(claimedKeys: Set<string>, key: string): boolean {
  if (claimedKeys.has(key)) return false;

  claimedKeys.add(key);
  return true;
}
