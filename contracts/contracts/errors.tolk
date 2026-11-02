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
    NotPublisher = 81
    EpochOutOfOrder = 82
    TotalDecreased = 83
    SupplyExceeded = 84
    GrowthLimit = 85
    PublishTooSoon = 86
    LimitsLoosened = 87

    // claims
    UnknownEpoch = 90
    ProofMismatch = 91
    ProofTooDeep = 92
    ClaimInProgress = 93
    NotMinter = 94
}
