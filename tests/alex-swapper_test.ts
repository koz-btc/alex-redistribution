
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.31.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

import { dummyAccounts } from './helpers/dummy-accounts.ts';

const contractName = 'alex-swapper';
const defaultDepositAssetContract = 'sip010-token';

const contractPrincipal = (deployer: Account) => `${deployer.address}.${contractName}`;

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
	return { depositAssetContract: depositAssetContractPrincipal, depositAssetId, block };
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
		const { depositAssetContract, depositAssetId } = mintFt({ chain, deployer, recipientAddress: wallet1.address, amount: 100 });

        const depositAmount = 50;
        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContract), types.uint(depositAmount)], wallet1.address)
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
		const { depositAssetContract } = mintFt({ chain, deployer, recipientAddress: wallet1.address, amount: 100 });

        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContract), types.uint(0)], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(102); // err invalid amount
    },
});

Clarinet.test({
    name: "`deposit` - Can accept 100 deposits from 100 different accounts",
    async fn(chain: Chain, accounts: Map<string, Account>) {
		const deployer = accounts.get('deployer')!;

        // generate 100 different accounts and mint some tokens to each
        let times = 100;
        let mintTxs:Tx[] = [];
        for(var i = 0; i < times; i++) {
            let recipientAddress = dummyAccounts[i].keyInfo.address;
            let tx = mintFtTx({ deployer, recipientAddress, amount: 100 });
            mintTxs.push(tx);
        }
        let block0 = chain.mineBlock(mintTxs);
        block0.receipts.forEach(e => { e.result.expectOk() });

        const ftMintEvent = block0.receipts[0].events[0].ft_mint_event;
        const [depositAssetContractPrincipal, depositAssetId] = ftMintEvent.asset_identifier.split('::');

        // generate 100 deposits from different accounts
        let depositTxs:Tx[] = [];
        for(var i = 0; i < times; i++) {
            let recipientAddress = dummyAccounts[i].keyInfo.address;
            let tx = Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContractPrincipal), types.uint(50)], recipientAddress);
            depositTxs.push(tx);
        }
        let block1 = chain.mineBlock(depositTxs);
        block1.receipts.forEach(e => { e.result.expectOk() });
    },

});

// TODO `deposit` - Can accept more than 100 deposits from 100 different accounts

// TODO `deposit` - Cannot accept deposits from more than 100 different accounts
