
;; alex-swapper
;; TODO: Rename to alex-redistribution

;; Allows to trustfully swap ALEX tokens for STX.
;; The AlexGo swap has a bug that doesn't allow to swap tokens if the results of the exchange
;; is lower than 15 STX. The objective of this contract is to accumulate STX tokens from different
;; principals and do a swap for the whole pot.

;; Contract owner needs to initialize with whitelisted SIP010 token principals (to receive and retrieve, 
;; ALEX and STX in this case).

;; Any account can deposit as many ALEX as they want the times they way. The contract will track
;; the amount each principal has deposited.

;; Depositors can query their deposited balance

;; Accounts can withdraw their deposited ALEX at any time, opting out of the redistribution. This
;; is to allow them to get out if the quota needed for an exchange is not met. Only the original 
;; depositor can withdraw their ALEX. The contract owner or any other principal cannot withdraw. 

;; Any principal can call the redistribute function at any time, which will call the AlexGo swap contract
;; to swap ALEX to STX. If the swap succeeds, the obtained STX will be redistributed to each depositor 
;; proportionally to the ALEX amount they sent, minus a STX fee which will be kept on the contract.
;; The amount will be available on the contract, allowing users to claim their STX whenever they want.

;; Depositors can query the STX available to claim.

;; Depositors can claim their exchanged STX. Once the STX is available depositors can call the claim
;; function and receive their part for the exchanged ALEX minus the fee.

;; The contract owner can set and change the fee at any time. 

;; The contract owner can withdraw the collected STX at any time.

(use-trait ft-trait .sip010-ft-trait.sip010-ft-trait)
(use-trait swap-helper-trait .swap-helper-trait.swap-helper-trait)

;; constants
;;
(define-constant contract-owner tx-sender)

(define-constant err-not-contract-owner (err u100))
(define-constant err-invalid-fee (err u101))
(define-constant err-invalid-amount (err u102))
(define-constant err-unknown-depositor (err u103))
(define-constant err-can-only-be-called-once (err u104))
(define-constant err-there-is-no-balance (err u105))
(define-constant err-too-many-depositors (err u105))

;; data maps and vars
;;
(define-data-var total-deposited-balance uint u0)
(define-data-var current-stx-fee uint u500000) ;; fee value set in mSTX
(define-map deposits principal { amount: uint, fee: uint, swapped-amount: uint })
(define-data-var depositors (list 100 principal) (list))

;; principals needed to call swap-helper method
(define-map whitelisted-swap-helper-contracts principal bool)
(define-map whitelisted-token-contracts principal bool)


;; private functions
;;
(define-private (transfer-ft (token-contract <ft-trait>) (amount uint) (sender principal) (recipient principal))
    (contract-call? token-contract transfer amount sender recipient none)
)

;; Get the deposited balance of any principal.
(define-private (get-deposited-balance-of (depositor principal))
    (default-to u0 (get amount (map-get? deposits depositor)))
)

;; public functions
;;

;; Setting STX fee to use for redistributions.
;; Can only be changed by the contract owner.
;; Has to be greater than zero.
(define-public (change-current-fee (new-fee-mstx uint)) 
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-contract-owner)
        (asserts! (> new-fee-mstx u0) err-invalid-fee)
        (ok (var-set current-stx-fee new-fee-mstx))
    )
)

;; @desc Adds valid contract principal to execute swaps.
(define-public (whitelist-swap-helper-contract (contract-principal principal) (allowed bool))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-contract-owner)
        (map-set whitelisted-swap-helper-contracts contract-principal allowed)
        (ok true)
    )
)

;; @desc Adds valid token addresses to swap coins
(define-public (whitelist-token-contract (contract-principal principal) (allowed bool))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-not-contract-owner)
        (map-set whitelisted-token-contracts contract-principal allowed)
        (ok true)
    )
)

;; @desc Public read only function to get the balance of the tx sender.
(define-read-only (get-deposited-balance)
    (ok (get-deposited-balance-of tx-sender))
)


;; @desc Adds a new depositor to the list if is not included. Check limits and return custom error before adding it.
(define-private (depositors-list-with-new-sender (new-depositor principal))
    (let (
        (depositors-list (var-get depositors))
        )
        (ok (if (is-none (index-of depositors-list new-depositor))
            (unwrap! (as-max-len? (append depositors-list tx-sender) u100) err-too-many-depositors)
            depositors-list
            )
    )

    )
)

;; @desc Deposit token. Allows users to send tokens to the smart contract. 
;; TODO: assert address deposit token contract principal is equal to the whitelisted deposit token
;; TODO: Test overflowing the list of depositors
(define-public (deposit (deposit-token-contract <ft-trait>) (amount uint))
    (begin 
        (asserts! (> amount u0) err-invalid-amount)
        (try! (transfer-ft deposit-token-contract amount tx-sender (as-contract tx-sender)))
        (map-set deposits tx-sender (tuple (amount (+ (get-deposited-balance-of tx-sender) amount)) 
                                           (fee (var-get current-stx-fee))
                                           (swapped-amount u0)))
        (var-set total-deposited-balance (+ (var-get total-deposited-balance) amount))
        (var-set depositors (unwrap-panic (depositors-list-with-new-sender tx-sender)))

        (ok true)
    )
)

;; Withdraw deposited amount.
;; Check if the sender has actually deposited something.
;; Send deposited amount back to the depositor.
;; Remove deposit from map
;; TODO: Remove depositor from list (list not really implemented yet)
;; TODO: Check deposit-token-contract from whitelisted list
;; TODO: Include test for multiple deposits
(define-public (withdraw (deposit-token-contract <ft-trait>))
    (let (
        (deposit-info (unwrap! (map-get? deposits tx-sender) err-unknown-depositor))
        (amount (get amount deposit-info))
        (depositor tx-sender)
        )
        (map-delete deposits tx-sender)
        (try! (as-contract (transfer-ft deposit-token-contract amount tx-sender depositor)))
        (ok true)
    )
)

;; @desc Performs swap, exchanges all the deposited tokens and assign proportionally the received tokens to each of the depositors.
;; TODO: Testing needs to include calling this two times and having deposits for the same depositor in between calls
(define-public (redistribute (swap-trait <swap-helper-trait>) (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (amount uint) (min-dy (optional uint)))
    (begin
        (asserts! (> (var-get total-deposited-balance) u0) err-there-is-no-balance)
        ;; It should probably get the min-dy first.
        (let ((ustx-result
                (contract-call? swap-trait swap-helper
                    token-x-trait
                    token-y-trait
                    (var-get total-deposited-balance)
                    min-dy)))
            (match ustx-result
                ustx (redistribute-swapped-tokens ustx)
                error (err error)))
    )
)

;; @desc Calc the proportion of the total-exchanged, based on the amout and total deposited (depositor-amount * totals-exchanged / totals-deposited)
(define-read-only (get-proportional-deposit 
        (deposit-info { amount: uint, fee: uint, swapped-amount: uint })
        (totals { deposited: uint, swapped: uint}))
    (let (
        (proportional-swapped-amount (/ 
                                            (* (get amount deposit-info) (get swapped totals))
                                            (get deposited totals)))
        (accumulated-swapped-amount (+ (get swapped-amount deposit-info) proportional-swapped-amount))
    )
    accumulated-swapped-amount)
)

;; @desc Iterator function, for each depositor it:
;; Gets deposit information for depositor (uses a blank default if not found)
;; Calls private function to calc the proportional value based on the swapped value and the total deposited.
;; Updates the depositor info with the new exchanged amount and reset deposited amount
(define-private (assign-proportional (depositor principal) (totals { deposited: uint, swapped: uint}))
    (let (
        (deposit-info (default-to { amount: u0, fee: u0, swapped-amount: u0 } (map-get? deposits depositor)))
        (accumulated-swapped-amount (get-proportional-deposit deposit-info totals))
        )
        (map-set deposits depositor (merge {amount: 0, swapped-amount: accumulated-swapped-amount} deposit-info))
        (tuple (deposited (get deposited totals)) (swapped (get swapped totals)))
    )
)

;; @desc Iterate over list of depositors and update deposit info on the depositors map. Clears the deposited amount and sets the proportional swapped amount.
(define-private (redistribute-swapped-tokens (ustx uint))
    (begin
        (fold assign-proportional (var-get depositors) (tuple (deposited (var-get total-deposited-balance)) (swapped ustx)))
        (ok ustx)
    )
)