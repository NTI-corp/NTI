/** One stable color per narrative id, so a sector looks the same on every chart, tile and table. */
export const SECTOR_COLORS: Record<number, string> = {
  // Restrained palette: lime is the only hue; everything else is a neutral or a muted olive.
  1: "#CCFF00", // Privacy / ZK
  2: "#F4F4F5", // AI Agents
  3: "#9AAA2E", // RWA
  4: "#A1A1AA", // Stablecoins
  5: "#E6FF6B", // DePIN
  6: "#71717A", // Prediction Markets
  7: "#B6CC2B", // Perp DEX
  8: "#D4D4D8", // DeFi
  9: "#7B8A22", // Memecoin
  10: "#8A8A93", // Gaming
};

export function sectorColor(id: number): string {
  return SECTOR_COLORS[id] ?? "#A1A1AA";
}
