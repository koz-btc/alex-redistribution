
;; alex-swapper
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
;; depositor can withdraw their ALEX, the contract owner or any other principal cannot withdraw. 

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

;; constants
;;
(define-constant contract-owner tx-sender)

(define-constant err-not-contract-owner (err u100))
(define-constant err-invalid-fee (err u101))
(define-constant err-invalid-amount (err u102))
(define-constant err-unknown-depositor (err u103))

;; data maps and vars
;;
(define-data-var deposited-balance uint u0)
(define-data-var current-stx-fee uint u500000) ;; fee value set in mSTX
(define-map deposits principal { amount: uint, fee: uint })

;; private functions
;;
(define-private (transfer-ft (token-contract <ft-trait>) (amount uint) (sender principal) (recipient principal))
	(contract-call? token-contract transfer amount sender recipient none)
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

;; Get the deposited balance of any principal.
(define-private (get-deposited-balance-of (depositor principal))
    (default-to u0 (get amount (map-get? deposits depositor)))
)

;; Public read only function to get the balance of the tx sender.
(define-read-only (get-deposited-balance)
    (ok (get-deposited-balance-of tx-sender))
)

;; deposit token
;; TODO: assert address deposit token contract principal is equal to the whitelisted deposit token
;; TODO: will probably need to add a list of depositors, to be able to interate at redistribution time.
(define-public (deposit (deposit-token-contract <ft-trait>) (amount uint))
    (begin 
        (asserts! (> amount u0) err-invalid-amount)
        (try! (transfer-ft deposit-token-contract amount tx-sender (as-contract tx-sender)))
        (map-set deposits tx-sender (tuple (amount (+ (get-deposited-balance-of tx-sender) amount)) 
                                             (fee (var-get current-stx-fee))))
        (var-set deposited-balance (+ (var-get deposited-balance) amount))
        (ok true)
    )
)

;; Withdraw deposited amount.
;; Check if the sender has actually deposited something.
;; Send deposited amount back to the depositor.
;; Remove deposit from map
;; TODO: Remove depositor from list (list not really implemented yet)
;; TODO: Check deposit-token-contract from whitelisted list
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