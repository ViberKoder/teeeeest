enum Errors {
    BalanceError = 47
    NotEnoughGas = 48
    InvalidMessage = 49
    InvalidOp = 72
    NotOwner = 73
    NotValidWallet = 74
    WrongWorkchain = 333

    // governance / publication
    NotAdmin = 80
    SupplyExceeded = 84
    GrowthLimit = 85
    LimitsLoosened = 87
    BadSignature = 88
    LegacyCap = 89
    Equivocation = 79
    ZeroKey = 78
    KeyFrozen = 77
    WalletRate = 76
    NoFraud = 75

    // claims
    ProofMismatch = 91
    ProofTooDeep = 92
    ClaimInProgress = 93
    NotMinter = 94
}
