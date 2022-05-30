
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.31.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

const contractName = 'alex-swapper';

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
