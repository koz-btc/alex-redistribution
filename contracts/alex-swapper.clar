
;; alex-swapper
;; Allows to trustfully swap ALEX tokens for STX.
;; The AlexGo swap has a bug that doesn't allow to swap tokens if the results of the exchange
;; is lower than 15 STX. The objective of this contract is to accumulate STX tokens from different
;; principals and do a swap for the whole pot.

;; Contract owner needs to initialize with whitelisted SIP010 token principals (to receive and retrieve, 
;; ALEX and STX in this case).

;; Any account can deposit as many ALEX as they want the times they way. The contract will track
;; the amount each principal has deposited.

;; Accounts can withdraw their deposited ALEX at any time, opting out of the redistribution. This
;; is to allow them to get out if the quota needed for an exchange is not met. Only the original 
;; depositor can withdraw their ALEX, the contract owner or any other principal cannot withdraw. 

;; Any principal can call the redistribute function at any time, which will call the AlexGo swap contract
;; to swap ALEX to STX. If the swap succeeds, the obtained STX will be redistributed to each depositor 
;; proportionally to the ALEX amount they sent, minus a STX fee which will be kept on the contract.
;; The amount will be available on the contract, allowing users to claim their STX whenever they want.

;; Depositors can claim their exchanged STX. Once the STX is available depositors can call the claim
;; function and receive their part for the exchanged ALEX minus the fee.

;; The contract owner can set and change the fee at any time. 

;; The contract owner can withdraw the collected STX at any time.


;; constants
;;
(define-constant contract-owner tx-sender)

;; data maps and vars
;;

;; private functions
;;

;; public functions
;;
