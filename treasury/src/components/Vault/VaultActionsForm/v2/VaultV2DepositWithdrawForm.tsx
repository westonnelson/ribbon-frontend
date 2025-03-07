import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useWeb3React } from "@web3-react/core";
import { parseUnits } from "@ethersproject/units";
import { useLocation } from "react-router-dom";

import colors from "shared/lib/designSystem/colors";
import {
  isEarnVault,
  isNoApproveToken,
  VaultAddressMap,
  VaultAllowedDepositAssets,
  VaultMaxDeposit,
  VaultOptions,
} from "shared/lib/constants/constants";
import { ACTIONS } from "webapp/lib/components/Vault/VaultActionsForm/Modal/types";
import useVaultActionForm from "webapp/lib/hooks/useVaultActionForm";
import { Title } from "shared/lib/designSystem";
import useTokenAllowance from "shared/lib/hooks/useTokenAllowance";
import {
  useV2VaultData,
  useAssetBalance,
} from "shared/lib/hooks/web3DataContext";
import { ERC20Token } from "shared/lib/models/eth";
import { isVaultFull } from "shared/lib/utils/vault";
import { formatBigNumber, isPracticallyZero } from "shared/lib/utils/math";
import VaultApprovalForm from "webapp/lib/components/Vault/VaultActionsForm/common/VaultApprovalForm";
import VaultBasicAmountForm from "../common/VaultBasicAmountForm";
import { getAssetDisplay } from "shared/lib/utils/asset";
import { VaultValidationErrors } from "../../types";
import VaultV2WithdrawForm from "./VaultV2WithdrawForm";
import {
  minDeposit,
  TreasuryVaultOptions,
} from "../../../../constants/constants";
import useVaultPriceHistory from "shared/lib/hooks/useVaultPerformanceUpdate";
import { BigNumber } from "ethers";

const FormTabContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-evenly;
  position: relative;

  &:before {
    display: block;
    position: absolute;
    height: 100%;
    width: 100%;
    content: " ";
    z-index: -1;
  }
`;

const FormTab = styled.div<{ active: boolean }>`
  width: 100%;
  padding: 24px 0;
  background-color: ${(props) =>
    props.active ? "none" : "rgba(255,255,255,0.04)"};
  cursor: pointer;

  &:after {
    background-color: white;
  }

  &:first-child {
    border-top-left-radius: 8px;
  }

  &:last-child {
    border-top-right-radius: 8px;
  }
`;

const FormTabTitle = styled(Title)<{ active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 24px;
  text-transform: uppercase;
  color: ${(props) => (props.active ? "#f3f3f3" : "rgba(255, 255, 255, 0.64)")};
`;

const FormInfoText = styled(Title)`
  font-size: 14px;
  line-height: 24px;
  text-align: center;
  color: ${(props) => (props.color ? props.color : colors.text)};
`;

interface VaultV2DepositWithdrawFormProps {
  vaultOption: VaultOptions;
  onFormSubmit: () => void;
}

const VaultV2DepositWithdrawForm: React.FC<VaultV2DepositWithdrawFormProps> = ({
  vaultOption,
  onFormSubmit,
}) => {
  /**
   * Primary hooks
   */
  const { handleActionTypeChange, vaultActionForm, handleMaxClick } =
    useVaultActionForm(vaultOption);
  const {
    data: {
      asset,
      cap,
      decimals,
      depositBalanceInAsset,
      lockedBalanceInAsset,
      round,
      totalBalance,
      withdrawals,
    },
    loading,
  } = useV2VaultData(vaultOption);
  const { balance: userAssetBalance } = useAssetBalance(
    vaultActionForm.depositAsset || asset
  );
  const vaultVersion = isEarnVault(vaultOption) ? "earn" : "v2";
  const vaultBalanceInAsset = depositBalanceInAsset.add(lockedBalanceInAsset);
  const { priceHistory } = useVaultPriceHistory(vaultOption, vaultVersion);
  const { active } = useWeb3React();

  const vaultMaxDepositAmount = VaultMaxDeposit[vaultOption];
  const isInputNonZero = parseFloat(vaultActionForm.inputAmount) > 0;
  const canCompleteWithdraw = useMemo(() => {
    return (
      vaultActionForm.withdrawOption !== "instant" &&
      !withdrawals.shares.isZero() &&
      withdrawals.round !== round
    );
  }, [round, vaultActionForm.withdrawOption, withdrawals]);
  const withdrawalAmount = useMemo(
    () =>
      withdrawals.shares
        .mul(
          priceHistory.find((history) => history.round === withdrawals.round)
            ?.pricePerShare || BigNumber.from(0)
        )
        .div(parseUnits("1", decimals)),
    [decimals, priceHistory, withdrawals.round, withdrawals.shares]
  );

  /**
   * Side hooks
   */
  const tokenAllowance = useTokenAllowance(
    isNoApproveToken(vaultActionForm.depositAsset || asset)
      ? undefined
      : ((vaultActionForm.depositAsset?.toLowerCase() ||
          VaultAllowedDepositAssets[
            vaultOption
          ][0].toLowerCase()) as ERC20Token),
    VaultAddressMap[vaultOption][vaultVersion]
  );

  /**
   * Default to initial state and process initial state
   */
  const [processedInitialState, setProcessedInitialState] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (processedInitialState) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    try {
      switch (searchParams.get("initialAction")) {
        case "completeWithdraw":
          if (canCompleteWithdraw) {
            handleActionTypeChange(ACTIONS.withdraw, vaultVersion, {
              withdrawOption: "complete",
            });
            handleMaxClick();
            onFormSubmit();
            setProcessedInitialState(true);
          }
          break;
        default:
          handleActionTypeChange(ACTIONS.deposit, vaultVersion);
          setProcessedInitialState(true);
      }
    } catch {
      handleActionTypeChange(ACTIONS.deposit, vaultVersion);
      setProcessedInitialState(true);
    }
  }, [
    canCompleteWithdraw,
    handleActionTypeChange,
    handleMaxClick,
    location.search,
    onFormSubmit,
    processedInitialState,
    vaultVersion,
  ]);

  /**
   * Check if approval needed
   */
  const showTokenApproval = useMemo(() => {
    if (vaultActionForm.actionType === ACTIONS.deposit) {
      return (
        !isNoApproveToken(
          vaultActionForm.depositAsset ||
            VaultAllowedDepositAssets[vaultOption][0]
        ) &&
        tokenAllowance &&
        isPracticallyZero(tokenAllowance, decimals)
      );
    }

    return false;
  }, [
    decimals,
    tokenAllowance,
    vaultActionForm.actionType,
    vaultActionForm.depositAsset,
    vaultOption,
  ]);

  const error = useMemo((): VaultValidationErrors | undefined => {
    switch (vaultActionForm.actionType) {
      case ACTIONS.deposit:
        /** Vault full */
        if (isVaultFull(totalBalance, cap, decimals)) {
          return "vaultFull";
        }

        /** Max Deposited */
        if (vaultMaxDepositAmount.lt(vaultBalanceInAsset)) {
          return "maxDeposited";
        }
        break;
    }

    try {
      /** Check block with input requirement */
      if (isInputNonZero && !loading && active) {
        const amountBigNumber = parseUnits(
          vaultActionForm.inputAmount,
          decimals
        );

        switch (vaultActionForm.actionType) {
          case ACTIONS.deposit:
            if (amountBigNumber.gt(userAssetBalance)) {
              return "insufficientBalance";
            }

            if (
              amountBigNumber.gt(vaultMaxDepositAmount.sub(vaultBalanceInAsset))
            ) {
              return "maxExceeded";
            }

            if (amountBigNumber.gt(cap.sub(totalBalance))) {
              return "capacityOverflow";
            }

            if (
              amountBigNumber.lt(
                minDeposit[vaultOption as TreasuryVaultOptions]
              ) &&
              lockedBalanceInAsset.isZero()
            ) {
              return "minNotReached";
            }

            break;

          case ACTIONS.withdraw:
            switch (vaultActionForm.withdrawOption) {
              case "instant":
                if (amountBigNumber.gt(depositBalanceInAsset)) {
                  return "withdrawLimitExceeded";
                }

                break;
              case "standard":
                if (amountBigNumber.gt(lockedBalanceInAsset)) {
                  return "withdrawLimitExceeded";
                }

                if (canCompleteWithdraw) {
                  return "existingWithdraw";
                }

                break;
              case "complete":
                if (amountBigNumber.gt(withdrawalAmount)) {
                  return "withdrawLimitExceeded";
                }
                break;
            }
        }
      }
    } catch (err) {
      // Assume no error because empty input unable to parse
    }

    return undefined;
  }, [
    vaultOption,
    active,
    canCompleteWithdraw,
    cap,
    decimals,
    depositBalanceInAsset,
    isInputNonZero,
    loading,
    lockedBalanceInAsset,
    totalBalance,
    userAssetBalance,
    vaultActionForm.actionType,
    vaultActionForm.inputAmount,
    vaultActionForm.withdrawOption,
    vaultBalanceInAsset,
    vaultMaxDepositAmount,
    withdrawalAmount,
  ]);

  const formContent = useMemo(() => {
    /**
     * Approval before deposit
     */
    if (showTokenApproval) {
      return (
        <VaultApprovalForm
          vaultOption={vaultOption}
          version={vaultVersion}
          showDepositAssetSwap={
            VaultAllowedDepositAssets[vaultOption].length > 1
          }
        />
      );
    }

    switch (vaultActionForm.actionType) {
      case ACTIONS.deposit:
        return (
          <VaultBasicAmountForm
            vaultOption={vaultOption}
            error={error}
            formExtra={
              lockedBalanceInAsset.isZero()
                ? [
                    {
                      label: "Wallet Balance",
                      amount: userAssetBalance,
                      unitDisplay: getAssetDisplay(
                        vaultActionForm.depositAsset || asset
                      ),
                      error: error === "insufficientBalance",
                    },
                    {
                      label: "Min. Initial Deposit",
                      amount: minDeposit[vaultOption as TreasuryVaultOptions],
                      unitDisplay: getAssetDisplay(
                        vaultActionForm.depositAsset || asset
                      ),
                      error: error === "minNotReached",
                    },
                  ]
                : [
                    {
                      label: "Wallet Balance",
                      amount: userAssetBalance,
                      unitDisplay: getAssetDisplay(
                        vaultActionForm.depositAsset || asset
                      ),
                      error: error === "insufficientBalance",
                    },
                  ]
            }
            showSwapDepositAsset={
              VaultAllowedDepositAssets[vaultOption].length > 1
            }
            onFormSubmit={onFormSubmit}
            actionButtonText="Preview Deposit"
          />
        );
      case ACTIONS.withdraw:
        return (
          <VaultV2WithdrawForm
            vaultOption={vaultOption}
            error={error}
            onFormSubmit={onFormSubmit}
            depositBalanceInAsset={depositBalanceInAsset}
            lockedBalanceInAsset={lockedBalanceInAsset}
            initiatedWithdrawAmount={withdrawalAmount}
            canCompleteWithdraw={canCompleteWithdraw}
          />
        );
    }
  }, [
    asset,
    canCompleteWithdraw,
    depositBalanceInAsset,
    error,
    lockedBalanceInAsset,
    onFormSubmit,
    showTokenApproval,
    userAssetBalance,
    vaultActionForm.actionType,
    vaultActionForm.depositAsset,
    vaultOption,
    vaultVersion,
    withdrawalAmount,
  ]);

  const formInfoText = useMemo(() => {
    switch (error) {
      case "vaultFull":
        return (
          <FormInfoText color={colors.red}>
            The Vault is currently full
          </FormInfoText>
        );
      case "maxDeposited":
        return (
          <FormInfoText color={colors.red}>
            This vault has a max deposit of{" "}
            {formatBigNumber(vaultMaxDepositAmount, decimals)} $
            {getAssetDisplay(asset)} per depositor
          </FormInfoText>
        );
    }
  }, [asset, decimals, error, vaultMaxDepositAmount]);

  return (
    <>
      <FormTabContainer>
        <FormTab
          active={vaultActionForm.actionType === ACTIONS.deposit}
          onClick={() => handleActionTypeChange(ACTIONS.deposit, vaultVersion)}
        >
          <FormTabTitle active={vaultActionForm.actionType === ACTIONS.deposit}>
            Deposit
          </FormTabTitle>
        </FormTab>
        <FormTab
          active={vaultActionForm.actionType === ACTIONS.withdraw}
          onClick={() => handleActionTypeChange(ACTIONS.withdraw, vaultVersion)}
        >
          <FormTabTitle
            active={vaultActionForm.actionType === ACTIONS.withdraw}
          >
            Withdraw
          </FormTabTitle>
        </FormTab>
      </FormTabContainer>

      <div className="d-flex flex-column p-4 w-100">
        {formContent}
        {formInfoText}
      </div>
    </>
  );
};

export default VaultV2DepositWithdrawForm;
