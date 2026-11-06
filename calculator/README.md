# LobsterCalc — Interac e-Transfer edition

Price: CAD $3.00 total, tax included.
Recipient / seller contact: junhapark2010@gmail.com
Unlock: permanent on that Windows installation.

CURRENT STATUS
The Windows app and a Clik2pay integration have been prepared and tested locally with a simulated payment provider. No bank or payment-provider account is connected. No live e-transfer was made or received. Automatic unlocking is NOT live yet.

Do not ask buyers to send money to the email address manually while automatic checkout is inactive. A personal e-transfer email address alone does not give software access to verified bank deposits. The panel says not to send money and disables checkout until a payment server is configured.

USING THE APP
1. Extract the Windows ZIP and open LobsterCalc.exe. It includes the .NET runtime.
2. Enter a calculation, then press Enter or click =.
3. A small panel appears inside the calculator. No separate popup window is created. The title, instruction banner, and price footer have been removed from the main calculator. The total price is shown before the buyer chooses to pay.
4. After the seller activates checkout, Continue with e-Transfer opens the hosted checkout page in the browser. The buyer enters their name and email, then completes the provider's official bank payment flow.
5. The calculator waits for verified payment, saves a signed computer-bound license, and then shows the result. Later calculations work offline.

Supported math: +, -, multiplication, division, decimals, keyboard brackets, powers with ^, scientific notation, and percent as division by 100. Arithmetic uses floating-point numbers. Escape or AC clears the entry; Escape also dismisses the payment panel.

AUTOMATIC CONFIRMATION
The provided server integration uses Clik2pay Payment Requests, which collect Interac e-Transfer payments. This is a merchant integration, not permission to read a personal bank account or Gmail inbox. Funds settle through the merchant account approved by the provider; an email address printed in the app does not independently determine that settlement account.

The service fixes the customer amount at CAD 3.00. It creates a request tied to the calculator's session and computer. Webhook requests require the configured Basic authentication. A webhook is only a notification: the server re-fetches the canonical provider request and issues an unlock only when its status is PAID, its amount is exactly 3.00, and its request ID, merchant ID, and internal transaction reference match the stored checkout.

The EXE verifies an RSA signature and checks version 2, live mode, CAD, amount 3.00, Interac payment method, seller email, and its computer identifier. Sandbox licenses, old USD/PayPal licenses, fake local paid flags, changed signatures, and licenses copied to another computer are rejected. There is no I-sent-it button that grants access.

The server stores payment references and pseudonymous computer IDs. It does not store the buyer's banking password, card details, or bank credentials. The hosted checkout sends the buyer's name and email to the payment provider, as disclosed on that page. The raw Windows installation ID is not sent to the service.

SELLER SETUP — STILL REQUIRED
1. Contact your bank about Interac e-Transfer Business Request Money, or apply for a Clik2pay merchant account and API access. Do not send credentials in chat. Account approval, identity checks, banking setup, and agreement acceptance must be completed by the account owner.
2. Clik2pay's published standard price checked on November 5, 2026 is 1.4% + CAD 0.50 per successful transaction, approximately CAD 0.54 for a CAD 3 payment. Confirm current fees and eligibility directly with the provider. No account was opened and no hosting or provider fees were paid for this build.
3. Host server/ on a Node.js 24+ server with HTTPS and durable storage. GitHub Pages cannot run this payment backend. Install an HTTPS reverse proxy or use a host that terminates HTTPS on port 443.
4. Copy server/.env.example to server/.env on the private server. Obtain sandbox credentials, API key and merchant ID from Clik2pay. Choose strong webhook credentials and register https://YOUR-HOST/webhooks/clik2pay with the provider using those same credentials. Use different sandbox and live credentials.
5. The private signing key for the current EXE is kept only in D:\github\lobsterloll\calculator\server\private\license-private.pem. Transfer it to the private server securely. Never include it in a buyer download or public repository. Alternatively set LICENSE_PRIVATE_KEY_PEM through your host's secret settings. The current app embeds the matching public key.
6. Keep the SQLite database on persistent storage and back it up securely. Start the current service with npm start in server/. Its /health endpoint reports whether the required configuration is present. The old server.mjs and server.test.mjs files are retained as legacy PayPal reference code; npm start and the current EXE do not use them.
7. Complete the provider's sandbox and integration checks before switching INTERAC_MODE to live. The release EXE intentionally rejects sandbox checkouts and licenses; local automated tests exercise the verification and license checks without taking real money. Production provider behavior has not been verified without an approved account.
8. Set interacPaymentServer in calculator-config.json beside the EXE to the HTTPS ORIGIN, such as https://payments.your-domain.com. Do not add a path, query string, PayPal settings, or secret keys. Distribute that public config beside the EXE after activation.
9. Test a controlled live checkout only after the account owner explicitly authorizes it. It must complete, reach provider status PAID, unlock this computer, and stay unlocked after restarting the app. No live checkout has been authorized or performed here.

The current implementation is specifically for Clik2pay. A different bank or provider requires its own adapter; changing an API hostname is not sufficient.

REBUILDING
Requirements: Windows, .NET 8 SDK, Node.js 24+.
Run ./build.ps1. It prepares the public verification key, runs the calculator/license and current Interac service tests, and publishes a self-contained Windows x64 EXE. It does not connect a bank account or activate payments.
The source ZIP excludes secrets, private signing keys, databases and build caches. Running setup after extracting source on another computer creates a new key pair, so you must rebuild the EXE if you use that new key. Existing buyers need a seller-managed license recovery process if the Windows installation ID changes. Permanent offline licenses do not automatically revoke after refunds or disputes. Locally executed software is not tamper-proof DRM.

REFERENCES
Interac Business Request Money: https://www.interac.ca/en/payments/business/interac-e-transfer-business-request-money/
Clik2pay pricing: https://clik2pay.com/pricing/
Clik2pay onboarding and integration: https://docs.clik2pay.com/docs/integration-steps
Clik2pay API: https://docs.clik2pay.com/reference/introduction
