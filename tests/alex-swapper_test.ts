
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.31.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

import { seedAccounts } from './helpers/seed-accounts.ts';

const contractName = 'alex-swapper';
const defaultDepositAssetContract = 'sip010-token';

const contractPrincipal = (deployer: Account) => `${deployer.address}.${contractName}`;

const maxNumberOfDepositors = 50;

function mintFtTx({ deployer, depositAssetContract = defaultDepositAssetContract, amount, recipientAddress }: { deployer: Account, amount: number, recipientAddress: string, depositAssetContract?: string }) {
    return Tx.contractCall(depositAssetContract, 'mint', [types.uint(amount), types.principal(recipientAddress)], deployer.address);
}

function mintFt({ chain, deployer, amount, recipientAddress, depositAssetContract = defaultDepositAssetContract }: { chain: Chain, deployer: Account, amount: number, recipientAddress: string, depositAssetContract?: string }) {
	const block = chain.mineBlock([
        mintFtTx({ deployer, depositAssetContract, amount, recipientAddress })
	]);
	block.receipts[0].result.expectOk();
	const ftMintEvent = block.receipts[0].events[0].ft_mint_event;
	const [depositAssetContractPrincipal, depositAssetId] = ftMintEvent.asset_identifier.split('::');
	return { depositAssetContractPrincipal, depositAssetId, block };
}

function mintToSeedAccounts({ chain, deployer, times = maxNumberOfDepositors, amount = 80 }: { chain: Chain, deployer: Account, times?: number, amount?: number }) {
    let mintTxs:Tx[] = [];
    for(var i = 0; i < times; i++) {
        let recipientAddress = seedAccounts[i].keyInfo.address;
        let tx = mintFtTx({ deployer, recipientAddress, amount });
        mintTxs.push(tx);
    }
    let block = chain.mineBlock(mintTxs);
    block.receipts.forEach(e => { e.result.expectOk() });

	const ftMintEvent = block.receipts[0].events[0].ft_mint_event;
	const [depositAssetContractPrincipal, depositAssetId] = ftMintEvent.asset_identifier.split('::');
	return { depositAssetContractPrincipal, depositAssetId, block };
}

function mintAndDeposit({ chain, deployer, recipient, depositAssetContract = defaultDepositAssetContract, mint = 100, deposit = 100 }: { chain: Chain, deployer: Account, recipient: Account, mint?: number, deposit?: number, depositAssetContract?: string }) {
    const { depositAssetContractPrincipal, depositAssetId } = mintFt({ chain, deployer, depositAssetContract, recipientAddress: recipient.address, amount: mint });

    let block = chain.mineBlock([
         Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(deposit)], recipient.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
	return { depositAssetContractPrincipal, depositAssetId };
}

// ******************
// change-current-fee
// ******************
Clarinet.test({
    name: "`change-current-fee` - Allows the contract owner to change the fee",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'change-current-fee', [types.uint(100)], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
    },
});

Clarinet.test({
    name: "`change-current-fee` - Does not allow anyone else to change the fee",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const memberA = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'change-current-fee', [types.uint(100)], memberA.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // not contract owner
    },
});

Clarinet.test({
    name: "`change-current-fee` - New fee has to be greater than zero",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'change-current-fee', [types.uint(0)], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(101);
    },
});

// *******
// deposit
// *******
Clarinet.test({
    name: "`deposit` - Allows deposit into the contract",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const wallet1 = accounts.get('wallet_1')!;
		const { depositAssetContractPrincipal, depositAssetId } = mintFt({ chain, deployer, recipientAddress: wallet1.address, amount: 100 });

        const depositAmount = 50;
        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(depositAmount)], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        block.receipts[0].events.expectFungibleTokenTransferEvent(depositAmount, wallet1.address, contractPrincipal(deployer), depositAssetId);
    },
});

Clarinet.test({
    name: "`deposit` - Amount has to be greater than zero",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const wallet1 = accounts.get('wallet_1')!;
		const { depositAssetContractPrincipal } = mintFt({ chain, deployer, recipientAddress: wallet1.address, amount: 100 });

        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(0)], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(102); // err invalid amount
    },
});

Clarinet.test({
    name: `\`deposit\` - Can accept ${maxNumberOfDepositors} deposits from ${maxNumberOfDepositors} different accounts`,
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;

        // mint tokens to seed accounts
        let times = maxNumberOfDepositors;
        let { depositAssetContractPrincipal } = mintToSeedAccounts({ chain, deployer, times });

        // generate max number of deposits from different accounts
        let depositTxs:Tx[] = [];
        for(var i = 0; i < times; i++) {
            let recipientAddress = seedAccounts[i].keyInfo.address;
            let tx = Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(50)], recipientAddress);
            depositTxs.push(tx);
        }
        let block = chain.mineBlock(depositTxs);
        block.receipts.forEach(e => { e.result.expectOk() });
    },

});

Clarinet.test({
    name: `\`deposit\` - Can accept more than ${maxNumberOfDepositors} deposits from just ${maxNumberOfDepositors} different accounts`,
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;

        // mint tokens to seed accounts
        let times = maxNumberOfDepositors;
        let { depositAssetContractPrincipal } = mintToSeedAccounts({ chain, deployer, times });

        // generate 2 deposits on each account
        let depositTxs:Tx[] = [];
        for(var i = 0; i < times; i++) {
            let recipientAddress = seedAccounts[i].keyInfo.address;
            let tx1 = Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(10)], recipientAddress);
            let tx2 = Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(20)], recipientAddress);
            depositTxs.push(tx1);
            depositTxs.push(tx2);
        }
        let block = chain.mineBlock(depositTxs);
        block.receipts.forEach(e => { e.result.expectOk() });
    },

});

Clarinet.test({
    name: `\`deposit\` - Cannot accept deposits from more than ${maxNumberOfDepositors} different accounts`,
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;

        // mint tokens to seed accounts
        let times = maxNumberOfDepositors + 1;
        let { depositAssetContractPrincipal } = mintToSeedAccounts({ chain, deployer, times });

        // generate 100 deposits from different accounts
        let depositTxs:Tx[] = [];
        for(var i = 0; i < times; i++) {
            let recipientAddress = seedAccounts[i].keyInfo.address;
            let tx = Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(50)], recipientAddress);
            depositTxs.push(tx);
        }
        let block = chain.mineBlock(depositTxs);

        assertEquals(block.receipts.length, times);

        // allowed depositors should be ok the after that is an error.
        block.receipts.slice(0, maxNumberOfDepositors).forEach(e => { e.result.expectOk() });
        block.receipts[maxNumberOfDepositors].result.expectErr().expectUint(105); // err too many depositors
    },
});

// *********************
// get-deposited-balance
// *********************
Clarinet.test({
    name: "`get-deposited-balance` - returns balance of deposited tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;

        mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        const parametersFromChain = chain.callReadOnlyFn(
            contractName,
            "get-deposited-balance",
            [],
            walletA.address
        );
        parametersFromChain.result.expectOk().expectUint(50);
    }
});

Clarinet.test({
    name: "`get-deposited-balance` - principals with no deposits should have no balance",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;

        mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        const parametersFromChain = chain.callReadOnlyFn(
            contractName,
            "get-deposited-balance",
            [],
            deployer.address
        );
        parametersFromChain.result.expectOk().expectUint(0);
    }
});


Clarinet.test({
    name: "`get-deposited-balance` - should return accumulated balance from multiple deposits",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;

        let { depositAssetContractPrincipal } = mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        let block = chain.mineBlock([
            Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(20)], walletA.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);

        const parametersFromChain = chain.callReadOnlyFn(
            contractName,
            "get-deposited-balance",
            [],
            walletA.address
        );
        parametersFromChain.result.expectOk().expectUint(70);
    }
});

// *********************
// withdraw
// *********************
Clarinet.test({
    name: "`withdraw` - cannot withdraw if it hasn't deposited",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;
		const walletB = accounts.get('wallet_2')!;

        let { depositAssetContractPrincipal } = mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        let block = chain.mineBlock([
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletB.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(103);

    }
});

Clarinet.test({
    name: "`withdraw` - sends back deposited tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;

        let { depositAssetContractPrincipal, depositAssetId } = mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        let block = chain.mineBlock([
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletA.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(50);
        block.receipts[0].events.expectFungibleTokenTransferEvent(50, contractPrincipal(deployer), walletA.address, depositAssetId);
    }
});

// balance should be zero after withdraw
Clarinet.test({
    name: "`withdraw` - balance should be zero after withdraw",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;

        let { depositAssetContractPrincipal, depositAssetId } = mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        let block = chain.mineBlock([
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletA.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(50);

        const parametersFromChain = chain.callReadOnlyFn(
            contractName,
            "get-deposited-balance",
            [],
            walletA.address
        );
        parametersFromChain.result.expectOk().expectUint(0);
    }
});

Clarinet.test({
    name: "`withdraw` - cannot withdraw once withdrawn",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;

        let { depositAssetContractPrincipal, depositAssetId } = mintAndDeposit({ chain, deployer, recipient: walletA, mint: 100, deposit: 50 });

        let block0 = chain.mineBlock([
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletA.address)
        ]);
        block0.receipts[0].result.expectOk().expectUint(50);

        let block1 = chain.mineBlock([
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletA.address)
        ]);
        block1.receipts[0].result.expectErr().expectUint(103);
    }
});

Clarinet.test({
    name: "`withdraw` - should remove depositors from list, releasing space for new depositors",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;
		const walletA = accounts.get('wallet_1')!;
		const walletB = accounts.get('wallet_2')!;
		const walletC = accounts.get('wallet_3')!;
		const walletD = accounts.get('wallet_4')!;
		const walletE = accounts.get('wallet_5')!;

        let { depositAssetContractPrincipal, depositAssetId } = mintAndDeposit({ chain, deployer, recipient: walletA});
        mintAndDeposit({ chain, deployer, recipient: walletB });
        mintAndDeposit({ chain, deployer, recipient: walletC });
        mintAndDeposit({ chain, deployer, recipient: walletD });
        mintAndDeposit({ chain, deployer, recipient: walletE });

        let block0 = chain.mineBlock([
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletA.address),
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletB.address),
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletC.address),
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletD.address),
            Tx.contractCall(contractName, 'withdraw', [types.principal(depositAssetContractPrincipal)], walletE.address),
        ]);
        block0.receipts.forEach(e => { e.result.expectOk().expectUint(100); });

        // generate max number of deposits from different accounts
        let times = maxNumberOfDepositors;
        mintToSeedAccounts({ chain, deployer, times });
        let depositTxs:Tx[] = [];
        for(var i = 0; i < times; i++) {
            let recipientAddress = seedAccounts[i].keyInfo.address;
            let tx = Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(50)], recipientAddress);
            depositTxs.push(tx);
        }
        let block1 = chain.mineBlock(depositTxs);
        // All deposits should work since the space from other depositors has been released.
        block1.receipts.forEach(e => { e.result.expectOk() });
    }
});

