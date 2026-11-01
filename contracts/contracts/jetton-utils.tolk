import "storage"

// Wallet addresses are plain: they depend on (owner, minter, code) and nothing else.
// There is deliberately no signer, root or epoch in the wallet's initial data, so nothing the
// project does later can ever change anybody's wallet address.
fun calcDeployedJettonWallet(
    ownerAddress: address,
    minterAddress: address,
    jettonWalletCode: cell,
): AutoDeployAddress {
    val emptyWalletStorage: WalletStorage = {
        jettonBalance: 0,
        ownerAddress,
        minterAddress,
        claimed: 0,
        claimLockedUntil: 0,
    };

    return {
        workchain: BASECHAIN,
        stateInit: { code: jettonWalletCode, data: emptyWalletStorage.toCell() },
    };
}

fun calcAddressOfJettonWallet(
    ownerAddress: address,
    minterAddress: address,
    jettonWalletCode: cell,
): address {
    val jwDeployed = calcDeployedJettonWallet(ownerAddress, minterAddress, jettonWalletCode);
    return jwDeployed.calculateAddress();
}
