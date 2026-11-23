import { getAddress, isAddress, maxUint256, zeroAddress, type Address, type Hex } from "viem";

export interface GovernanceAction {
  target: Address;
  value: string;
  calldata: Hex;
}

export function parseGovernanceActions(input: string): GovernanceAction[] {
  const items: unknown = JSON.parse(input);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Enter at least one proposal action as a JSON array.");
  }
  return items.map((item, index) => {
    const action = item as Partial<GovernanceAction> | null;
    if (!action || typeof action.target !== "string" || !isAddress(action.target, { strict: false }) ||
        action.target.toLowerCase() === zeroAddress || typeof action.value !== "string" ||
        !/^\d{1,78}$/.test(action.value) || BigInt(action.value) > maxUint256 ||
        typeof action.calldata !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(action.calldata)) {
      throw new Error(`Action ${index + 1} requires a valid target, wei amount string, and hex calldata.`);
    }
    return { target: getAddress(action.target), value: action.value, calldata: action.calldata };
  });
}
