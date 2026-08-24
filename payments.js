/* payments.js — shared across cart.html, chat-thread.html, swift.html, wallet.html
   Requires on the page:
     <script src="https://js.paystack.co/v1/inline.js"></script>
     window.sb            -> supabase client (already set up on every page)
     window.CP_PAYSTACK_PUBLIC_KEY -> your pk_test_/pk_live_ key (safe to expose)
   Talks to the Vercel functions in /api — those hold the secret key, this file never does. */

window.CPPay = (function () {
  const API = ''; // same-origin Vercel functions, e.g. '' -> '/api/paystack-initialize'

  async function post(path, body) {
    const r = await fetch(`${API}/api/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let data;
    try {
      data = await r.json();
    } catch {
      // The response wasn't JSON at all — almost always means the /api function
      // isn't deployed/reachable (Vercel returned its own HTML 404/500 page
      // instead of our code running). Check: env vars set in Vercel? did the
      // last deploy include the /api folder? check Vercel's function logs.
      throw new Error(`Server didn't return a valid response from /api/${path} (status ${r.status}). The API function likely isn't deployed or crashed before running — check Vercel's deployment logs.`);
    }
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function nairaToKobo(naira) { return Math.round(Number(naira) * 100); }

  // Opens the Paystack popup for an amount that was already fixed server-side
  // (via /api/paystack-initialize), then verifies server-side before resolving.
  async function collectPayment({ email, amountKobo, orderType, orderId }) {
    const init = await post('paystack-initialize', {
      email, amount_kobo: amountKobo, order_type: orderType, order_id: orderId,
    });
    return new Promise((resolve, reject) => {
      const handler = PaystackPop.setup({
        key: window.CP_PAYSTACK_PUBLIC_KEY,
        email,
        amount: amountKobo,
        ref: init.reference,
        onClose: () => reject(new Error('Payment window closed')),
        // NOTE: this must be a plain function, not `async`. Paystack's inline.js
        // rejects async functions here with "Attribute callback must be a valid
        // function" because it checks the function's string form, and async
        // functions serialize differently. The async work happens inside an
        // IIFE instead so the outer callback stays a plain function.
        callback: (response) => {
          (async () => {
            try {
              const verify = await post('paystack-verify', { reference: response.reference, order_type: orderType, order_id: orderId });
              if (!verify.ok) return reject(new Error('Payment could not be verified'));
              resolve(verify);
            } catch (e) { reject(e); }
          })();
        },
      });
      handler.openIframe();
    });
  }

  // --- Escrow (haggled marketplace items + Swift deliveries) ---
  async function payEscrowOrder({ escrowOrderId, amountKobo, email }) {
    return collectPayment({ email, amountKobo, orderType: 'escrow', orderId: escrowOrderId });
  }
  async function confirmReceived(escrowOrderId) {
    return post('paystack-release', { order_type: 'escrow', order_id: escrowOrderId });
  }
  async function cancelAndRefundEscrow(escrowOrderId) {
    return post('paystack-refund', { order_type: 'escrow', order_id: escrowOrderId });
  }
  // Called the moment a Swift runner enters the buyer's delivery PIN correctly —
  // auto-releases to the runner, no buyer tap needed.
  async function swiftAutoRelease(escrowOrderId) {
    return post('paystack-release', { order_type: 'escrow', order_id: escrowOrderId });
  }

  // --- Food quick-order (Uber-Eats style, no chat) ---
  async function payFoodOrder({ foodOrderId, amountKobo, email }) {
    return collectPayment({ email, amountKobo, orderType: 'food', orderId: foodOrderId });
  }
  async function releaseFoodOrder(foodOrderId) {
    return post('paystack-release', { order_type: 'food', order_id: foodOrderId });
  }
  async function cancelAndRefundFood(foodOrderId) {
    return post('paystack-refund', { order_type: 'food', order_id: foodOrderId });
  }

  // --- Bank account / payout setup (seller, runner, or vendor) ---
  async function resolveAccount(accountNumber, bankCode) {
    return post('paystack-resolve-account', { account_number: accountNumber, bank_code: bankCode });
  }
  async function saveBankAccount({ userId, accountNumber, bankCode, bankName }) {
    return post('paystack-create-recipient', { user_id: userId, account_number: accountNumber, bank_code: bankCode, bank_name: bankName });
  }

  // --- Wallet + P2P ---
  async function getWalletBalance(userId) {
    const { data, error } = await window.sb.from('wallets').select('balance_kobo').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message || 'Could not load wallet balance');
    return data?.balance_kobo || 0;
  }
  async function p2pSend({ senderId, receiverId, amountKobo, note }) {
    return post('wallet-p2p-send', { sender_id: senderId, receiver_id: receiverId, amount_kobo: amountKobo, note });
  }
  async function withdraw({ userId, amountKobo }) {
    return post('wallet-withdraw', { user_id: userId, amount_kobo: amountKobo });
  }
  async function getTransactions(userId, limit = 30) {
    const { data, error } = await window.sb.from('wallet_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message || 'Could not load wallet transactions');
    return data || [];
  }

  function fmtNaira(kobo) {
    return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return {
    nairaToKobo, fmtNaira,
    payEscrowOrder, confirmReceived, cancelAndRefundEscrow, swiftAutoRelease,
    payFoodOrder, releaseFoodOrder, cancelAndRefundFood,
    resolveAccount, saveBankAccount,
    getWalletBalance, p2pSend, withdraw, getTransactions,
  };
})();
