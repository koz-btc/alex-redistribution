
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.31.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

const contractName = 'alex-swapper';
const defaultDepositAssetContract = 'sip010-token';

const contractPrincipal = (deployer: Account) => `${deployer.address}.${contractName}`;

function mintFt({ chain, deployer, amount, recipient, depositAssetContract = defaultDepositAssetContract }: { chain: Chain, deployer: Account, amount: number, recipient: Account, depositAssetContract?: string }) {
	const block = chain.mineBlock([
		Tx.contractCall(depositAssetContract, 'mint', [types.uint(amount), types.principal(recipient.address)], deployer.address),
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
		const { depositAssetContract, depositAssetId } = mintFt({ chain, deployer, recipient: wallet1, amount: 100 });

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
		const { depositAssetContract } = mintFt({ chain, deployer, recipient: wallet1, amount: 100 });

        let block = chain.mineBlock([
             Tx.contractCall(contractName, 'deposit', [types.principal(depositAssetContract), types.uint(0)], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(102); // err invalid amount
    },
});
