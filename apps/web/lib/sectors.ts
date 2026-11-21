/** One stable color per narrative id, so a sector looks the same on every chart, tile and table. */
export const SECTOR_COLORS: Record<number, string> = {
  1: "#A78BFA", // Privacy / ZK
  2: "#CCFF00", // AI Agents
  3: "#38BDF8", // RWA
  4: "#34D399", // Stablecoins
  5: "#FB923C", // DePIN
  6: "#EC4899", // Prediction Markets
  7: "#F59E0B", // Perp DEX
  8: "#22C55E", // DeFi
  9: "#F472B6", // Memecoin
  10: "#60A5FA", // Gaming
};

export function sectorColor(id: number): string {
  return SECTOR_COLORS[id] ?? "#A1A1AA";
}
