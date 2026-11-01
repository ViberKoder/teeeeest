import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@contracts/messages"
import "@wrappers/EggMinter.gen"
import "@wrappers/EggWallet.gen"
import "test-utils"

// What explorers (tonviewer, tonscan), DEXes (ston.fi) and wallets rely on. If these hold, the jetton is
// displayed and traded like any other TEP-74 jetton — no special handling is needed anywhere.

get fun `test standard: get_jetton_data and get_wallet_address are TEP-74 shaped and consistent`() {
    val env = setupMinter();
    val data = env.minter.getJettonData();
    expect(data.totalSupply).toEqual(0);
    expect(data.jettonContent.hash() != 0).toBeTrue();

    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    expect(env.minter.getWalletAddress(env.alice.address)).toEqual(wallet.address);

    val wd = wallet.getWalletData();
    expect(wd.ownerAddress).toEqual(env.alice.address);
    expect(wd.minterAddress).toEqual(env.minter.address);
    expect(wd.jettonBalance).toEqual(0);
}

get fun `test standard TEP-89: the minter discovers a user's wallet address on request`() {
    val env = setupMinter();
    val res = env.minter.sendRequestWalletAddress(env.bob.address, 0, env.alice.address, true, { value: grams("0.05") });
    expect(res).toHaveSuccessfulTx<RequestWalletAddress>({ to: env.minter.address });
    expect(res).toHaveSuccessfulTx<ResponseWalletAddress>({ from: env.minter.address, to: env.bob.address });
}
