import { useState, useRef, useEffect } from "react";

const DOC_CONTENT = {
  getting_started: [
    { h: `Getting Started Guide`, b: `From registration to your first sale in under 30 minutes\nWelcome to ProfitTrack POS. This guide walks you through setting up your account and making your first sale. Follow each step in order and you will be fully operational within 30 minutes.` },
    { h: `Step 1 — Register your business (5 minutes)`, b: `• Go to profittrack.ng and click 'Start free trial'\n• Select the plan that matches your business size (you can upgrade later)\n• Enter your business name, phone number, and address\n• Create your admin username and password — write these down and keep them safe\n• Click 'Start free trial' — your account is created immediately\n• Log in with your new credentials\n\nYour 30-day free trial starts immediately. No payment required yet.` },
    { h: `Step 2 — Set up your branding (3 minutes)`, b: `• Go to Branding & Settings in the left sidebar\n• Upload your business logo (JPG, PNG, or SVG — max 2MB)\n• Select your brand colour — this appears on every PDF invoice\n• Confirm your business name, address, and phone number\n• Click Save — all future invoices will use your branding` },
    { h: `Step 3 — Add your products (10 minutes)`, b: `You can add products one by one or in bulk using a CSV file.\n\nOption A — Add products one by one\n• Go to Products in the sidebar\n• Click 'Add product'\n• Enter product name, selling price, and cost price\n• For the barcode: scan the product's physical barcode, or click 'Generate' to create one\n• Assign a category and supplier if applicable\n• Click 'Add product'\n\nOption B — Bulk import from CSV/Excel\n• Go to Products, then click the 'Import' tab\n• Download the template — it has the correct column format\n• Fill in your products: name, barcode, selling price, cost price, quantity\n• Save as .csv or .xlsx and upload the file\n• Review the import summary — check for any errors or warnings` },
    { h: `Step 4 — Add stock to inventory (5 minutes)`, b: `Adding products does not automatically add stock. You must receive stock separately.\n\n• Go to Inventory in the sidebar\n• Click the 'Receive stock' tab\n• Scan a product barcode (or type it) — the product name appears\n• Enter the quantity you are adding\n• Add the expiry date if the product has one (leave blank for clothing, accessories)\n• Click Confirm — the stock is added to your inventory immediately\n• Scan the next product and repeat` },
    { h: `Step 5 — Add your staff (3 minutes)`, b: `• Go to Users in the sidebar\n• Click 'Add user'\n• Enter the staff member's name, choose a username, and set a password\n• Assign a role: Manager (can view reports) or Cashier (POS only)\n• Assign them to a branch\n• Click Save — they can log in immediately\n\nGive each staff member their own login. Shared logins make the audit trail useless.` },
    { h: `Step 6 — Make your first sale`, b: `• Go to POS in the sidebar (or log in as a cashier)\n• Scan a product barcode — it appears in the cart\n• Add more products as needed\n• Select the payment method: Cash, Transfer, Card, or Credit\n• Click 'Complete sale'\n• A PDF receipt is generated — click 'Print invoice' to open it\n\nThe sale is recorded immediately in Sales history, inventory is deducted, and the audit log is updated.` },
    { h: `Step 7 — Check your dashboard`, b: `• Go to Dashboard — today's sales, profit, and top products are shown\n• Go to Analytics for deeper insights: revenue trends, peak hours, best sellers\n• Go to Reports for a detailed profit and loss breakdown\n\nWhatsApp daily reports: Available on Business and Enterprise plans. During your 30-day free trial, you will receive the report regardless of plan, so you can experience it firsthand. If you choose Business or Enterprise when you subscribe, reports continue automatically. If you choose Starter, reports stop when your trial ends. You will automatically receive a summary every evening at 8:00 PM Lagos time, including total sales, profit, top products, low stock alerts, and expiry warnings.\n\nRecommended next steps\n• Add your suppliers (Suppliers page) and link them to your products\n• Set reorder levels on your inventory (Inventory > Stock levels > Settings button)\n• Set up customer accounts for regular buyers who buy on credit or earn loyalty points\n• Add your first expense category to start tracking operating costs\n• Before your trial ends: go to Plan & Billing and add your payment details\n\nNeed help?\n• WhatsApp: +234 901 298 4122 — fastest response\n• Email: support@profittrack.ng\n• Website: profittrack.ng` },
  ],
  privacy: [
    { h: `Privacy Policy`, b: `Effective date: May 2026 | Last updated: May 2026` },
    { h: `1. Introduction`, b: `ProfitTrack operates the ProfitTrack POS platform available at profittrack.ng. This Privacy Policy explains how we collect, use, store, and protect personal information when you use our service. We are committed to compliance with the Nigeria Data Protection Regulation (NDPR) 2019 and the Nigeria Data Protection Act (NDPA) 2023.` },
    { h: `2. Data Controller`, b: `Trading name: Profit Apps Enterprises\nContact email: support@profittrack.ng\nWebsite: profittrack.ng\nWhatsApp: +234 901 298 4122` },
    { h: `3. Information We Collect`, b: `3.1 Information you provide directly\n• Business name, address, phone number, and email address\n• Admin account username and encrypted password\n• Staff names, usernames, and role assignments\n• Product catalog: names, prices, barcodes, categories\n• Customer names, phone numbers, and purchase history\n• Supplier names and contact details\n• Sales transactions, expense records, and inventory data\n\n3.2 Information collected automatically\n• Login timestamps and session activity\n• Device type and browser information\n• IP address for security and fraud prevention\n• Audit logs of all actions taken within the system\n\n3.3 Payment information: Payment processing is handled by Paystack. ProfitTrack does not store card numbers or bank account details.` },
    { h: `4. How We Use Your Information`, b: `• To provide and operate the ProfitTrack POS service\n• To process subscription payments via Paystack\n• To send automated WhatsApp daily business reports\n• To send service notifications (payment failures, trial expiry reminders)\n• To generate PDF invoices and receipts for your sales\n• To improve the platform based on usage patterns\n• To respond to support requests and customer service enquiries\n• To comply with legal obligations under Nigerian law` },
    { h: `5. Third-Party Data Processors`, b: `• Neon (neon.tech) — Database hosting — All business and user data — United States\n• Render (render.com) — Backend server hosting — All application data — United States\n• Cloudinary — Business logo storage — Logo images only — Global CDN\n• Paystack — Payment processing — Email, payment amount — Nigeria / Ireland\n• Twilio — WhatsApp reports — Phone number, report text — United States\n• Resend (resend.com) — Transactional email delivery — Name, email address, billing and account notices — United States` },
    { h: `6. Data Retention`, b: `• Active account data: retained for as long as your subscription is active\n• Cancelled accounts: data retained for 90 days, then permanently deleted\n• Audit logs: retained for 12 months for security purposes\n• Payment records: retained as required by Nigerian financial regulations` },
    { h: `7. Your Rights Under NDPR/NDPA`, b: `• Right of access: Request a copy of all personal data we hold about you\n• Right to rectification: Request correction of inaccurate data\n• Right to erasure: Request deletion of your data\n• Right to data portability: Request your data in a machine-readable format\n• Right to object: Object to processing of your personal data\n\nTo exercise any of these rights, contact us at support@profittrack.ng. We will respond within 30 days.` },
    { h: `8. Data Security`, b: `• All data transmitted between your browser and our servers is encrypted using TLS 1.2+\n• Passwords are hashed using bcrypt — we never store plain-text passwords\n• Database connections use SSL encryption\n• Access tokens expire and are never stored server-side\n• All user actions are logged in an immutable audit trail` },
    { h: `9. Cookies and Tracking`, b: `ProfitTrack uses browser localStorage to store your authentication token and user preferences. We do not use third-party tracking cookies or advertising pixels. We do not sell your data to advertisers.` },
    { h: `10. Children's Privacy`, b: `ProfitTrack is a business management tool intended for adults operating commercial businesses. We do not knowingly collect data from persons under 18 years of age.` },
    { h: `11. Changes to This Policy`, b: `We may update this Privacy Policy as our service evolves. We will notify registered users of material changes via email or WhatsApp at least 14 days before changes take effect.` },
    { h: `12. Contact Us`, b: `• Email: support@profittrack.ng\n• WhatsApp: +234 901 298 4122\n• Website: profittrack.ng\n\nIf you are not satisfied with our response, you may lodge a complaint with the Nigeria Data Protection Commission (NDPC) at ndpc.gov.ng.\n\nProfitTrack | profittrack.ng | Privacy Policy v1.0 | May 2026` },
  ],
  terms: [
    { h: `Terms of Service`, b: `Effective date: May 2026 | Last updated: May 2026` },
    { h: `1. Acceptance of Terms`, b: `By registering for and using ProfitTrack ('the Service'), you agree to be bound by these Terms of Service. If you are registering on behalf of a business, you represent that you have authority to bind that business to these terms.` },
    { h: `2. Description of Service`, b: `ProfitTrack is a cloud-based point-of-sale and business management platform designed for Nigerian retail businesses. The Service includes inventory management, sales tracking, staff management, customer loyalty programmes, expense tracking, analytics, WhatsApp reporting, and related features as described at profittrack.ng.` },
    { h: `3. Account Registration`, b: `• You must provide accurate and complete information when registering\n• You are responsible for maintaining the confidentiality of your login credentials\n• You are responsible for all activity that occurs under your account\n• You must notify us immediately of any unauthorised use of your account\n• One account per business. Creating multiple accounts to circumvent plan limits is prohibited` },
    { h: `4. Free Trial`, b: `New accounts receive a 30-day free trial with full access to the features of their selected plan. No payment method is required to start the trial. At the end of the trial period, access is suspended until a valid subscription payment is made. Trial data is retained for 30 days after trial expiry.` },
    { h: `5. Subscription and Payment`, b: `5.1 Plans — ProfitTrack offers three plans: Starter, Business, and Enterprise. Plan features and pricing are described at profittrack.ng.\n\n5.2 Billing — Subscriptions are billed monthly or annually in advance in Nigerian Naira (NGN) via Paystack.\n\n5.3 Plan upgrades — Take effect immediately upon payment.\n\n5.4 Plan downgrades — Scheduled for end of current billing period. No refund issued for the difference.\n\n5.5 No refunds — All payments are final and non-refundable. The 30-day free trial exists to allow evaluation before paying.\n\n5.6 Payment failures — 3-day grace period to update payment method. After 3 days, access is suspended.` },
    { h: `6. Cancellation`, b: `You may cancel your subscription at any time from the Plan & Billing section. Upon cancellation:\n• Access continues until the end of your current paid billing period\n• No further charges are made\n• Your data is retained for 90 days from the end of your paid period\n• After 90 days, all data is permanently deleted and cannot be recovered\n\nTo reactivate within the 90-day retention window, simply subscribe again and all data will be restored.` },
    { h: `7. Acceptable Use`, b: `You agree not to use ProfitTrack to:\n• Process transactions for illegal goods or services\n• Evade taxes or misrepresent financial records\n• Circumvent plan limits through technical means\n• Share account credentials with persons outside your business\n• Reverse engineer, decompile, or copy any part of the Service\n• Upload malicious code or attempt to compromise system security` },
    { h: `8. Data Ownership`, b: `You own all business data you enter into ProfitTrack — products, sales records, customer data, and inventory. ProfitTrack does not claim ownership of your data.` },
    { h: `9. Service Availability`, b: `We aim for 99% uptime but do not guarantee uninterrupted access. ProfitTrack is not liable for losses caused by service outages or interruptions beyond our reasonable control.` },
    { h: `10. Limitation of Liability`, b: `To the maximum extent permitted by Nigerian law, ProfitTrack's total liability for any claim is limited to the amount you paid in the 30 days preceding the claim. We are not liable for indirect, incidental, consequential, or punitive damages.` },
    { h: `11. Intellectual Property`, b: `ProfitTrack, its logo, design, code, and all related materials are the intellectual property of ProfitTrack and are protected by applicable Nigerian and international copyright law.` },
    { h: `12. Modifications to Terms`, b: `We may update these Terms of Service. Material changes will be communicated via email or WhatsApp at least 14 days before taking effect.` },
    { h: `13. Governing Law`, b: `These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Nigeria.` },
    { h: `14. Contact`, b: `• Email: support@profittrack.ng\n• WhatsApp: +234 901 298 4122\n• Website: profittrack.ng\n\nProfitTrack | profittrack.ng | Terms of Service v1.0 | May 2026` },
  ],
  security: [
    { h: `Security Overview`, b: `How ProfitTrack protects your business data | May 2026` },
    { h: `1. Our Security Commitment`, b: `Your business data is one of your most valuable assets. ProfitTrack is built with security as a core requirement, not an afterthought. This document explains the technical and operational measures we use to protect your data from unauthorised access, loss, and misuse.` },
    { h: `2. Data Encryption`, b: `In transit: All communication between your browser or device and ProfitTrack servers is encrypted using TLS 1.2 or higher (HTTPS). All data is encrypted while travelling across the internet and cannot be intercepted in plain text.\n\nAt rest: Your data is stored in a PostgreSQL database hosted on Neon (neon.tech), which encrypts all data at rest using AES-256. Database connections require SSL and are not publicly accessible.` },
    { h: `3. Authentication and Access Control`, b: `• Passwords: Hashed using bcrypt with a salt factor of 12. We never store plain-text passwords.\n• JWT tokens: Login sessions use signed JSON Web Tokens (JWT) with expiry. Tokens are never stored server-side.\n• Role-based access: Every user is assigned a role (Admin, Manager, or Cashier) with strictly defined permissions.\n• Multi-tenant isolation: Each business's data is logically isolated. A user from Business A cannot access any data from Business B.\n• Automatic session expiry: Authentication tokens expire and users must log in again.` },
    { h: `4. Audit Logging`, b: `Every significant action within ProfitTrack is recorded in an immutable audit log:\n• Every sale, refund, and void — with cashier name, timestamp, and branch\n• Every product created, edited, or deleted\n• Every restock and inventory adjustment\n• Every user created, deactivated, or password changed\n• Every login attempt (successful and failed)\n\nAudit logs cannot be deleted by any user, including admins. Retained for 12 months.` },
    { h: `5. Infrastructure Security`, b: `Backend — Render.com: Isolated containers, automatic security patching, DDoS protection, automatic HTTPS enforcement, environment variables encrypted at rest.\n\nDatabase — Neon.tech: Managed PostgreSQL with automatic daily backups, point-in-time recovery, database not publicly accessible, automatic failover.\n\nFile storage — Cloudinary: Business logos on secure CDN, access controlled via signed API credentials, images served over HTTPS only.` },
    { h: `6. Payment Security`, b: `ProfitTrack does not process, store, or transmit card numbers or bank account details. All payment processing is handled by Paystack, which is:\n• PCI-DSS Level 1 compliant — the highest level of payment security certification\n• Licensed by the Central Bank of Nigeria (CBN)\n\nWhen you pay for a ProfitTrack subscription, your card details go directly to Paystack and never pass through our servers.` },
    { h: `7. Offline Mode Security`, b: `ProfitTrack supports offline sales when internet connectivity drops. Offline transactions are stored temporarily in your browser's local storage and synchronised to the server when connectivity is restored. Offline data is not encrypted on the device — we recommend using the system on dedicated business devices with screen lock enabled.` },
    { h: `8. Vulnerability Management`, b: `• Dependencies are regularly updated to patch known security vulnerabilities\n• We follow secure coding practices including input validation and parameterised queries (no SQL injection risk)\n• API endpoints validate authentication and authorisation on every request\n• CORS headers restrict which origins can call our API` },
    { h: `9. Incident Response`, b: `In the event of a data breach or security incident:\n• We will notify affected users within 72 hours of becoming aware, as required by the NDPA 2023\n• We will investigate the scope and cause of the incident\n• We will take immediate steps to contain and remediate the breach\n• We will cooperate with the Nigeria Data Protection Commission (NDPC) as required` },
    { h: `10. Your Responsibilities`, b: `• Use strong, unique passwords for your ProfitTrack admin account\n• Do not share login credentials between staff members — create individual accounts\n• Log out of ProfitTrack on shared or public devices\n• Keep your registered phone number and email address up to date\n• Report any suspicious activity immediately to support@profittrack.ng` },
    { h: `11. Contact Our Security Team`, b: `• Email: support@profittrack.ng (subject: Security)\n• WhatsApp: +234 901 298 4122\n\nWe take all security reports seriously and commit to responding within 24 hours.\n\nProfitTrack | profittrack.ng | Security Overview v1.0 | May 2026` },
  ],
  dpa: [
    { h: `Data Processing Agreement`, b: `Between ProfitTrack (Data Processor) and each subscribing Business (Data Controller)\n\nThis Data Processing Agreement ('DPA') is entered into between ProfitTrack ('Processor') and the business entity that subscribes to ProfitTrack services ('Controller'). This DPA forms part of the ProfitTrack Terms of Service and governs the processing of personal data by ProfitTrack on behalf of the Controller. It is issued in compliance with the Nigeria Data Protection Act (NDPA) 2023.` },
    { h: `1. Definitions`, b: `Personal Data — Any information relating to an identified or identifiable natural person processed through the ProfitTrack platform, including customer names, phone numbers, purchase history, and staff account details.\n\nData Controller — The subscribing business entity that determines the purposes and means of processing personal data through ProfitTrack.\n\nData Processor — ProfitTrack, which processes personal data on behalf of the Controller.\n\nProcessing — Any operation performed on personal data including collection, storage, use, disclosure, deletion, or retrieval.\n\nSub-processor — Any third party engaged by ProfitTrack to process personal data on its behalf.` },
    { h: `2. Scope and Purpose of Processing`, b: `Subject matter: Processing of personal data necessary to provide the ProfitTrack POS and business management service.\n\nDuration: For the duration of the Controller's active subscription plus the 90-day data retention period following cancellation.\n\nNature: Storage, retrieval, display, and deletion of customer data, staff data, and transaction data.\n\nPurpose: To enable the Controller to manage sales, inventory, staff, and customer relationships through the ProfitTrack platform.\n\nTypes of data: Customer names and phone numbers; staff names, usernames, and roles; sales transactions; product and inventory data; expense records.` },
    { h: `3. Obligations of the Processor (ProfitTrack)`, b: `Processing on instruction: ProfitTrack processes personal data only on documented instructions from the Controller.\n\nConfidentiality: All personnel authorised to process personal data are bound by confidentiality obligations.\n\nSecurity: ProfitTrack implements TLS encryption in transit, AES-256 encryption at rest, bcrypt password hashing, and role-based access controls.\n\nBreach notification: ProfitTrack notifies the Controller without undue delay and within 72 hours of becoming aware of a personal data breach.\n\nDeletion: Upon termination, ProfitTrack retains Controller data for 90 days then permanently deletes it.` },
    { h: `4. Obligations of the Controller`, b: `Lawful basis: The Controller ensures it has a lawful basis for processing personal data through ProfitTrack.\n\nData subject information: The Controller is responsible for informing its own customers and staff that their data is processed through ProfitTrack.\n\nAccuracy: The Controller is responsible for the accuracy and completeness of personal data it enters into ProfitTrack.` },
    { h: `5. Sub-processors (Schedule A)`, b: `• Neon (neon.tech) — Database hosting — United States — PostgreSQL storage of all business and user data\n• Render (render.com) — Backend server hosting — United States — API processing layer\n• Cloudinary — Image storage — Global CDN — Business logo storage only\n• Paystack — Payment processing — Nigeria/Ireland — Email address and payment amounts for subscription billing\n• Twilio — WhatsApp messaging — United States — Phone numbers and report text for daily reports and alerts\n• Resend (resend.com) — Transactional email delivery — United States — Name, email address, and email content for account and billing notifications` },
    { h: `6. Governing Law`, b: `This DPA is governed by the laws of the Federal Republic of Nigeria, in particular the Nigeria Data Protection Act 2023. Both parties agree to comply with applicable Nigerian data protection law and to cooperate with the Nigeria Data Protection Commission (NDPC) as required.` },
    { h: `7. Acceptance`, b: `This DPA is accepted by the Controller upon registration for a ProfitTrack account. Electronic acceptance (clicking 'Start free trial' or 'Subscribe') constitutes binding agreement to the terms of this DPA. For Enterprise customers requiring a signed copy, contact support@profittrack.ng.\n\nProfitTrack · profittrack.ng · Data Processing Agreement v1.0 — NDPA 2023 Compliant · May 2026` },
  ],
  refund: [
    { h: `Refund & Dispute Policy`, b: `Effective May 2026 · Applies to all ProfitTrack subscription payments\n\nThis policy governs refund requests and payment disputes for ProfitTrack subscription payments processed via Paystack. It is a standalone document that supplements the ProfitTrack Terms of Service.` },
    { h: `1. No-Refund Policy`, b: `ProfitTrack subscription payments are non-refundable. By subscribing, customers acknowledge that they have evaluated the product during the 30-day free trial and are satisfied that it meets their needs.\n\nThe free trial period exists specifically to allow full evaluation before any payment is required.` },
    { h: `2. The 30-Day Free Trial`, b: `All ProfitTrack plans include a 30-day free trial with full access to the features of the selected plan. No payment method is required to start a trial. Requests for refunds citing dissatisfaction that could have been identified during the trial period will not be approved.` },
    { h: `3. Exceptions — When a Refund May Be Considered`, b: `Refunds may be considered at ProfitTrack's sole discretion only in the following circumstances:\n\n• Technical failure: ProfitTrack was completely inaccessible for more than 72 consecutive hours due to a fault on ProfitTrack's side.\n• Duplicate charge: The customer was charged more than once for the same billing period due to a processing error.\n• Charge after cancellation: The customer was charged after properly cancelling their subscription.\n• Plan upgrade error: The customer was charged for a higher plan than they selected due to a system error.` },
    { h: `4. How to Request a Refund`, b: `To request a refund, contact ProfitTrack within 48 hours of the payment:\n\n• WhatsApp or email ProfitTrack with: your registered email address, business name, Paystack transaction reference, reason for request.\n• ProfitTrack will investigate and respond within 48 hours.\n• If approved, refund is processed via Paystack and may take 3–5 business days to appear.\n• Refunds are issued to the original payment method only.` },
    { h: `5. Paystack Chargebacks`, b: `If a customer initiates a chargeback with their bank or card issuer, ProfitTrack will respond with this policy document and evidence of service delivery. Chargebacks initiated for services that were fully delivered will be disputed. Customers who initiate unjustified chargebacks may have their account permanently suspended.` },
    { h: `6. Duplicate Payments`, b: `If a customer is charged twice for the same subscription period due to a technical error, ProfitTrack will issue a full refund for the duplicate charge within 5 business days. Contact billing@profittrack.ng with the Paystack transaction references.` },
    { h: `7. Subscription Cancellation`, b: `Cancellation of a subscription does not entitle the customer to a refund for the current paid period. Access continues until the end of the current period. The customer's data is retained for 90 days after the period ends.` },
    { h: `8. Contact`, b: `For all refund requests and payment disputes:\n• Email: billing@profittrack.ng\n• WhatsApp: +234 901 298 4122\n\nResponse within 48 hours on business days.\n\nProfitTrack · profittrack.ng · Refund & Dispute Policy v1.0 · May 2026` },
  ],
  hardware: [
    { h: `Hardware Guide`, b: `What to buy · Where to buy · How to test · Nigerian market edition 2026\n\nProfitTrack works on any device with a web browser. You do not need to buy any hardware to start — a phone or laptop is enough. Hardware adds speed and professionalism to your POS setup.\n\nQuick summary\n• Budget setup (from ₦35,000): USB barcode scanner + thermal receipt printer\n• Professional setup (₦80,000–₦120,000): USB scanner + printer + cash drawer + monitor/tablet\n• None of this is required — you can run ProfitTrack on just a laptop or phone` },
    { h: `1. Barcode Scanners`, b: `A barcode scanner connects to your laptop or tablet and sends scanned barcodes as keyboard input. ProfitTrack supports any scanner that outputs keyboard input (HID-compatible). Plug-and-play — no drivers needed.\n\nUSB wired (1D) — ₦8,000–18,000 — Honeywell, Symbol — Most shops\nUSB wired (1D+2D) — ₦15,000–28,000 — Zebra, Honeywell — For QR codes\nWireless Bluetooth — ₦18,000–40,000 — Socket Mobile — Mobile cashiers\nWireless 2.4GHz — ₦12,000–25,000 — Honeywell — Fixed counter\n\nWhere to buy\n• Computer Village, Ikeja Lagos — widest selection, negotiate price\n• Slot Systems (slot.ng) — physical stores across Nigeria\n• Jumia.com.ng — search 'USB barcode scanner'\n• Konga.com.ng — good for delivery outside Lagos\n• Local electronics markets — Wuse Market Abuja, Trans Amadi Port Harcourt\n\nHow to test before buying\n1. Plug the USB scanner into your laptop — auto-detected, no installation needed\n2. Open a plain text editor (Notepad on Windows, Notes on Mac)\n3. Scan any product barcode — the number should appear instantly\n4. If it works in the text editor, it will work with ProfitTrack` },
    { h: `2. Thermal Receipt Printers`, b: `ProfitTrack generates PDF receipts that can be printed on any printer. A thermal printer is standard for POS — prints in 2 seconds, no ink needed, just paper rolls.\n\n58mm USB thermal — ₦18,000–30,000 — Small shops, tight counter space\n80mm USB thermal — ₦22,000–40,000 — Most shops\n80mm USB+Bluetooth — ₦30,000–55,000 — Mobile POS, tablets\n80mm LAN network — ₦35,000–60,000 — Multiple cashiers, shared printer\n\nRecommended brands\n• Xprinter — most popular in Nigeria, good value (₦20,000–₦40,000)\n• Epson TM-T20 — premium quality, longer lifespan (₦60,000–₦90,000)\n• iDPRT — good mid-range option, available on Jumia\n\nHow to print from ProfitTrack\n1. Complete a sale → click 'Print invoice'\n2. A PDF opens in your browser\n3. Press Ctrl+P (or Cmd+P on Mac)\n4. Select your thermal printer → set paper size to 58mm or 80mm\n5. Set margins to zero → click Print\n\nPaper rolls: 58mm — ₦1,500–₦3,000 per pack of 10. 80mm — ₦2,000–₦4,000 per pack.` },
    { h: `3. Devices to Run ProfitTrack`, b: `ProfitTrack runs in any web browser.\n\n• Laptop (recommended) — Any Windows laptop with Chrome — ₦150,000–₦350,000\n• Android tablet — 8–10 inch + Chrome — ₦60,000–₦120,000\n• iPad — Safari — ₦200,000–₦400,000\n• Android phone — Chrome — Existing device — Mobile cashier, backup\n• iPhone — Safari — Existing device — PWA installable\n• Desktop PC — Windows + Chrome — ₦120,000–₦250,000\n\nBrowser recommendation: Use Chrome on all devices. Safari for iOS. Avoid Internet Explorer.` },
    { h: `4. Complete Setup Recommendations`, b: `Starter Setup — ₦35,000–₦55,000\n• USB barcode scanner (generic, 1D): ₦8,000–₦15,000\n• Xprinter 58mm USB thermal printer: ₦18,000–₦28,000\n• Paper rolls (pack of 10): ₦2,000–₦3,000\n• Your existing laptop or phone to run ProfitTrack\n\nProfessional Counter Setup — ₦80,000–₦130,000\n• USB barcode scanner (Honeywell or Zebra): ₦15,000–₦25,000\n• Xprinter 80mm USB thermal printer: ₦25,000–₦40,000\n• Cash drawer (connects to printer, opens on sale): ₦12,000–₦20,000\n• Dedicated laptop or Android tablet: ₦60,000–₦120,000\n\nMulti-Cashier Setup — ₦200,000+\n• One scanner + printer per cashier station\n• Each cashier logs in with their own ProfitTrack account\n• All sales tracked per cashier automatically in analytics` },
    { h: `5. Where to Buy in Nigeria`, b: `Online\n• Jumia Nigeria — jumia.com.ng — Search: barcode scanner, thermal printer\n• Konga — konga.com — Good delivery outside Lagos\n• Slot Nigeria — slot.ng — Reliable, has physical stores\n\nPhysical Markets\n• Computer Village — Ikeja, Lagos — Largest selection, negotiate price\n• Wuse Market — Abuja — Electronics section, Zone 5\n• Trans Amadi — Port Harcourt — Electronics/computer market\n• Ogbete Market — Enugu — Electronics section\n• Sabon Gari Market — Kano — Electronics traders\n\nBuying tips\n• Always test the scanner before paying\n• Ask the vendor to print a test receipt before buying\n• Negotiate — Computer Village prices are rarely fixed\n• Buy from sellers who offer exchange if faulty\n\nNeed help with hardware setup?\n• WhatsApp: +234 901 298 4122 (Mon–Sat, 9AM–6PM Lagos time)\n• Email: support@profittrack.ng\n\nProfitTrack POS · profittrack.ng · Hardware Guide v2.0 · 2026` },
  ],
};

const DOCS = [
  { id: "getting_started", name: "Getting Started Guide",      shortName: "Getting Started", tag: "Guide", icon: "📖", color: "#3B6D11", colorBg: "#EAF3DE" },
  { id: "privacy",         name: "Privacy Policy",             shortName: "Privacy",         tag: "Legal", icon: "🔒", color: "#185FA5", colorBg: "#E6F1FB" },
  { id: "terms",           name: "Terms of Service",           shortName: "Terms",           tag: "Legal", icon: "📄", color: "#185FA5", colorBg: "#E6F1FB" },
  { id: "security",        name: "Security Overview",          shortName: "Security",        tag: "Legal", icon: "🛡️", color: "#854F0B", colorBg: "#FAEEDA" },
  { id: "dpa",             name: "Data Processing Agreement",  shortName: "DPA",             tag: "Legal", icon: "🤝", color: "#185FA5", colorBg: "#E6F1FB" },
  { id: "refund",          name: "Refund & Dispute Policy",    shortName: "Refund Policy",   tag: "Legal", icon: "💳", color: "#A32D2D", colorBg: "#FCEBEB" },
  { id: "hardware",        name: "Hardware Guide",             shortName: "Hardware",        tag: "Guide", icon: "🖥️", color: "#3B6D11", colorBg: "#EAF3DE" },
];

const AMBER = "#C8820A";
const DARK  = "#111111";

function PTIcon({ size = 28 }) {
  return (
    <div style={{ width: size, height: size, background: AMBER, borderRadius: Math.round(size * 0.22), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 64 64" fill="none">
        <path d="M14 16h14c5 0 8 3 8 7.5S33 31 28 31h-6v13h-8V16z" fill="white" />
        <path d="M12 50l9-8 8 5.5 13-11" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="48" cy="36" r="2.5" fill="rgba(255,255,255,0.7)" />
      </svg>
    </div>
  );
}

function renderBody(text) {
  return text.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} style={{ height: 8 }} />;
    if (t.startsWith('•') || t.startsWith('–')) {
      return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
          <span style={{ color: AMBER, flexShrink: 0, marginTop: 2, fontWeight: 700 }}>•</span>
          <span style={{ fontSize: 14, color: "#444", lineHeight: 1.75 }}>{t.replace(/^[•–]\s*/, '')}</span>
        </div>
      );
    }
    if (/^\d+\.\s/.test(t) && t.length < 120) {
      const m = t.match(/^(\d+)\.\s(.+)/);
      if (m) return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
          <span style={{ color: AMBER, flexShrink: 0, fontWeight: 600, fontSize: 13, minWidth: 18 }}>{m[1]}.</span>
          <span style={{ fontSize: 14, color: "#444", lineHeight: 1.75 }}>{m[2]}</span>
        </div>
      );
    }
    return <p key={i} style={{ fontSize: 14, color: "#444", lineHeight: 1.8, margin: "0 0 5px" }}>{t}</p>;
  });
}

export default function DocsPage() {
  const [current,     setCurrent]     = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile,    setIsMobile]    = useState(window.innerWidth < 700);
  const contentRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const openDoc = (i) => {
    setCurrent(i);
    setSidebarOpen(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  const doc      = DOCS[current];
  const sections = DOC_CONTENT[doc.id] || [];

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#F9F5EE" }}>

      {/* Topbar */}
      <div style={{ height: 52, background: DARK, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid rgba(200,130,10,0.2)", flexShrink: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isMobile && (
            <button onClick={() => setSidebarOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 18, padding: "2px 8px 2px 0", lineHeight: 1 }}>☰</button>
          )}
          <PTIcon size={28} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>ProfitTrack</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Document Library</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isMobile && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>7 documents · May 2026</span>}
          <a href="https://www.profittrack.ng" style={{ fontSize: 11, color: AMBER, textDecoration: "none", fontWeight: 500, border: "1px solid rgba(200,130,10,0.35)", padding: "5px 10px", borderRadius: 6 }}>
            profittrack.ng →
          </a>
        </div>
      </div>

      {/* Quick access pills */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(200,130,10,0.15)", padding: "7px 14px", display: "flex", alignItems: "center", gap: 5, overflowX: "auto", flexShrink: 0, WebkitOverflowScrolling: "touch" }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a09080", marginRight: 4, whiteSpace: "nowrap", flexShrink: 0 }}>Quick access</span>
        {DOCS.map((d, i) => (
          <button key={d.id} onClick={() => openDoc(i)} style={{
            padding: "4px 11px", borderRadius: 20,
            border: `1px solid ${i === current ? AMBER : "rgba(200,130,10,0.2)"}`,
            background: i === current ? AMBER : "transparent",
            color: i === current ? "#fff" : "#7a7060",
            fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
            fontFamily: "inherit", transition: "all 0.12s", flexShrink: 0,
          }}>
            {d.shortName}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 30 }} />
        )}

        {/* Sidebar */}
        <div style={{
          width: 228, flexShrink: 0, background: DARK,
          borderRight: "1px solid rgba(200,130,10,0.15)",
          display: "flex", flexDirection: "column",
          ...(isMobile ? {
            position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 40,
            transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.22s ease",
          } : {}),
        }}>
          <div style={{ padding: "13px 13px 9px", borderBottom: "1px solid rgba(200,130,10,0.12)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: AMBER, marginBottom: 2 }}>All documents</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Select to read</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
            {DOCS.map((d, i) => (
              <div key={d.id} onClick={() => openDoc(i)} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "9px 10px",
                borderRadius: 8, cursor: "pointer", marginBottom: 1,
                border: `1px solid ${i === current ? "rgba(200,130,10,0.35)" : "transparent"}`,
                background: i === current ? "rgba(200,130,10,0.13)" : "transparent",
                transition: "all 0.12s",
              }}>
                <div style={{ width: 28, height: 32, background: i === current ? "rgba(200,130,10,0.22)" : "rgba(200,130,10,0.07)", border: "1px solid rgba(200,130,10,0.18)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>
                  {d.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: i === current ? "#fff" : "rgba(255,255,255,0.6)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: i === current ? "rgba(200,130,10,0.8)" : "rgba(200,130,10,0.38)", marginTop: 1 }}>{d.tag}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 13px", borderTop: "1px solid rgba(200,130,10,0.1)", fontSize: 9, color: "rgba(255,255,255,0.18)", textAlign: "center" }}>
            Profit Apps Enterprises · profittrack.ng
          </div>
        </div>

        {/* Document viewer */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Doc header bar */}
          <div style={{ padding: "10px 18px", background: "#fff", borderBottom: "1px solid rgba(200,130,10,0.13)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, background: doc.colorBg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
              {doc.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
              <div style={{ fontSize: 10, color: "#a09080", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{doc.tag} · ProfitTrack</div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => current > 0 && openDoc(current - 1)} disabled={current === 0}
                style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(200,130,10,0.22)", background: "none", fontSize: 11, cursor: current === 0 ? "default" : "pointer", opacity: current === 0 ? 0.3 : 1, color: "#7a7060", fontFamily: "inherit" }}>←</button>
              <span style={{ fontSize: 10, color: "#ccc", minWidth: 32, textAlign: "center" }}>{current + 1}/{DOCS.length}</span>
              <button onClick={() => current < DOCS.length - 1 && openDoc(current + 1)} disabled={current === DOCS.length - 1}
                style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(200,130,10,0.22)", background: "none", fontSize: 11, cursor: current === DOCS.length - 1 ? "default" : "pointer", opacity: current === DOCS.length - 1 ? 0.3 : 1, color: "#7a7060", fontFamily: "inherit" }}>→</button>
            </div>
          </div>

          {/* Scrollable content */}
          <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "24px 22px 56px", WebkitOverflowScrolling: "touch" }}>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>

              {/* Title block */}
              <div style={{ marginBottom: 28, paddingBottom: 18, borderBottom: "2px solid rgba(200,130,10,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <PTIcon size={20} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: AMBER }}>ProfitTrack</span>
                  <span style={{ fontSize: 11, color: "#ddd" }}>·</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: doc.color, background: doc.colorBg, padding: "2px 8px", borderRadius: 20 }}>{doc.tag}</span>
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: DARK, margin: "0 0 4px", lineHeight: 1.25 }}>{doc.name}</h1>
                <div style={{ fontSize: 11, color: "#a09080" }}>ProfitTrack · Profit Apps Enterprises · May 2026</div>
              </div>

              {/* Sections */}
              {sections.map((sec, i) => (
                <div key={i} style={{ marginBottom: 26 }}>
                  {i === 0 ? (
                    <p style={{ fontSize: 14, color: "#666", fontStyle: "italic", lineHeight: 1.75, margin: 0 }}>{sec.b}</p>
                  ) : (
                    <>
                      {sec.h && (
                        <h2 style={{ fontSize: 15, fontWeight: 700, color: DARK, margin: "0 0 10px", paddingBottom: 8, borderBottom: "1px solid rgba(200,130,10,0.13)", display: "flex", alignItems: "center", gap: 8 }}>
                          {(/^\d+\./.test(sec.h) || /^Step \d+/.test(sec.h)) && (
                            <span style={{ width: 21, height: 21, background: AMBER, color: "#fff", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                              {(/^Step (\d+)/.exec(sec.h) || /^(\d+)\./.exec(sec.h))[1]}
                            </span>
                          )}
                          <span>{sec.h.replace(/^\d+\.\s*/, '').replace(/^Step \d+ — /, '').replace(/^Step \d+ — /, '')}</span>
                        </h2>
                      )}
                      <div>{renderBody(sec.b)}</div>
                    </>
                  )}
                </div>
              ))}

              {/* Bottom nav */}
              <div style={{ marginTop: 36, paddingTop: 18, borderTop: "1px solid rgba(200,130,10,0.13)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <PTIcon size={16} />
                  <span style={{ fontSize: 11, color: "#a09080" }}>profittrack.ng · support@profittrack.ng</span>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {current > 0 && (
                    <button onClick={() => openDoc(current - 1)} style={{ padding: "6px 13px", borderRadius: 6, border: "1px solid rgba(200,130,10,0.22)", background: "none", fontSize: 11, cursor: "pointer", color: "#7a7060", fontFamily: "inherit" }}>
                      ← {DOCS[current - 1].shortName}
                    </button>
                  )}
                  {current < DOCS.length - 1 && (
                    <button onClick={() => openDoc(current + 1)} style={{ padding: "6px 13px", borderRadius: 6, border: "none", background: AMBER, fontSize: 11, cursor: "pointer", color: "#fff", fontFamily: "inherit", fontWeight: 500 }}>
                      {DOCS[current + 1].shortName} →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}