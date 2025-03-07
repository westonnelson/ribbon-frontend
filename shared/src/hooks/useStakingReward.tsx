import { useWeb3React } from "@web3-react/core";
import { useEffect, useState } from "react";

import { RibbonStakingRewards } from "../codegen";
import { RibbonStakingRewardsFactory } from "../codegen/RibbonStakingRewardsFactory";
import {
  StakingVaultOptions,
  VaultLiquidityMiningMap,
} from "../constants/constants";
import { useWeb3Context } from "./web3Context";

export const getStakingReward = (
  library: any,
  vaultOption: StakingVaultOptions,
  useSigner = true
) => {
  const provider = useSigner ? library.getSigner() : library;

  if (!VaultLiquidityMiningMap.lm[vaultOption]) {
    return null;
  }

  return RibbonStakingRewardsFactory.connect(
    VaultLiquidityMiningMap.lm[vaultOption]!,
    provider
  );
};

const useStakingReward = (vaultOption: StakingVaultOptions) => {
  const { active, library } = useWeb3React();
  const { provider } = useWeb3Context();
  const [stakingReward, setStakingReward] =
    useState<RibbonStakingRewards | null>(null);

  useEffect(() => {
    if (provider) {
      const vault = getStakingReward(library || provider, vaultOption, active);
      setStakingReward(vault);
    }
  }, [provider, active, library, vaultOption]);

  return stakingReward;
};

export default useStakingReward;
