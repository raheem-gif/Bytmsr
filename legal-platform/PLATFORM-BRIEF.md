# Beyoot Misr Legal Support Platform — Complete Brief (version 9.0, pre-launch)

> **Purpose of this file.** This is a full, plain-language description of a software platform that was built for
> «مؤسسة بيوت مصر لدعم الأرامل والأيتام» (Beyoot Misr Foundation for Supporting Widows and Orphans).
> It is written so that a person — or an AI assistant they are talking to — can understand everything the platform
> does, why it was designed that way, how it is used day to day, and what is still left to decide before going live.
> You can paste this whole file into an AI chat and ask it questions about the platform.

---

## 1. The organisation and the problem

**Who:** مؤسسة بيوت مصر لدعم الأرامل والأيتام — an Egyptian non-profit civil society foundation, registered under
No. 11108 of 2020, supervised by the Ministry of Social Solidarity. Headquarters: 44 شارع المحكمة العسكرية، بجوار
مدرسة الزهراء، الحي العاشر، مدينة نصر، القاهرة. Phone 01211114662. Facebook: https://www.facebook.com/Beyootmisr/.
The foundation already runs programmes such as نجاح (education), المائدة (food), سلامة (health), الكسوة (clothing),
أفراح (orphan brides), صك الإيواء (housing repair) and نماء (zakat).

**What this platform is:** the operating system for the foundation's **legal support programme** («الدعم القانوني»).
Widows, guardians of orphans and their families have legal problems — inheritance (المواريث وإعلام الوراثة),
alimony (النفقة), custody (الحضانة والرؤية), guardianship over orphans' money (الولاية على المال والنيابة الحسبية),
pensions (المعاشات وتكافل وكرامة), housing and rent, labour, and getting official documents. They contact the
foundation by WhatsApp or the website. The platform turns those messages into organised files, lets staff decide what
to do, routes the legal work to volunteer / CSR / paid lawyers under strict privacy control, sends the answer back to the
beneficiary, tracks court cases, pays lawyers correctly, and reports the impact to the board, donors and the Ministry.

**The core principle:** «ما تراه الإدارة ليس بالضرورة ما يراه المحامي» — *what the administration sees is not
necessarily what the lawyer sees.* Lawyers never see the beneficiary's phone number or conversation; they see only the
facts, questions and documents that the administration explicitly grants them. Every request from a lawyer (more
information, a document, help from another lawyer) goes through the administration. Only the administration talks to
the beneficiary and only the administration closes a file.

---

## 2. Who uses it (roles)

| Role | Arabic | What they can do |
|---|---|---|
| System admin | إدارة النظام | Everything, including accounting, settings, integrations (WhatsApp/AI keys), users, security log, backups. |
| Case manager | إدارة الحالات | Daily operations: inbox, triage, files, lawyers, messages, court cases, calendar, programmes (view), impact. No accounting or system settings. |
| Lawyer | المحامي | Only their own assignments («إسنادات») and court cases they are responsible for; sees only what was granted; drafts opinions, asks for information or another lawyer's help, records hearings and tasks, sees their own fee statement. |
| Beneficiary / client | المستفيد/ة | No account. Uses WhatsApp, the website form, and a private portal link (or WhatsApp-code login) to follow their request, answer questions and upload documents. |

Arabic terminology was standardised across the whole product: «إسناد» = a piece of work given to a lawyer, «مهمة» = a
task inside a court case, «استشارة/ملف» = a consultation file, «قضية» only for real court cases, «مستفيد/مستفيدة» for
the people served, currency always «ج.م», correct Arabic number–noun agreement everywhere.

---

## 3. The full journey of one request (end to end)

1. **A beneficiary writes** on WhatsApp or fills the website form (optionally with social details: widow/guardian,
   number of children, income band, housing, foundation file number). Each channel is just a "door" into one unified
   **Intake Engine**: the same person and the same story are recognised across channels; the source (e.g. a Facebook ad,
   Google, a referral partner) is tracked separately from the channel.
2. **It lands in the unified inbox** («صندوق الوارد الموحد») as a request with a code like `REQ-2026-00024`.
   The AI assistant summarises it, classifies the legal area, lists missing information/documents, suggests the legal
   issues, and warns "this resembles N past cases". A priority score is suggested from the beneficiary's situation.
3. **Staff triage** it: reply (with ready-made replies or AI-suggested replies), handle it internally if it is simple,
   archive it, or **convert it into a file** with an independent code like `INH-2026-00482` linked to the client code
   `CL-00881`. During conversion a **conflict-of-interest check** runs and the file can be linked to a **funding
   programme**.
4. **Staff assign lawyers** («إسناد»): a lead lawyer, and if needed a specialist, a second opinion or a reviewer, each
   with a role, a precise question, a deadline, a fee rule, and exactly which facts/issues/documents they may see.
   The system suggests the best lawyers (specialty, workload, performance).
5. **The lawyer works** in the lawyer portal: opens the file, drafts the opinion (optionally starting from an AI draft
   informed by approved past cases), asks for more information/documents or for another lawyer's help — every such
   request goes to the administration first.
6. **The administration reviews** the submitted opinion: approves it or returns it with notes (new draft version).
   Approval automatically creates the correct fee entry for the lawyer.
7. **The administration writes the client version** (simpler language) and sends it by WhatsApp or the portal.
   A printable formal letter «إفادة قانونية» on the foundation's letterhead can be produced.
8. **A satisfaction survey** is sent automatically ~24 hours later; low ratings alert the case manager.
9. **If it goes to court**, the file becomes an ongoing **court case file** («ملف مستمر», code like `MTR-2026-00001`)
   with court, circuit, lawsuit number/year, opponent, hearings, procedural deadlines, tasks, invoices, payments,
   expenses and the responsible lawyer. Hearing reminders go to the beneficiary automatically (after staff approve any
   text a lawyer typed).
10. **Only the administration closes** the file, recording the outcome and the **value of rights recovered**
    (one-time amount, monthly amount such as alimony or pension, or non-monetary outcomes like an inheritance
    certificate issued). The closed case — after personal data is removed and a human approves — becomes part of the
    foundation's **knowledge base**, which improves future AI suggestions.
11. **Impact** shows up in the impact report: families served, children benefited, rights recovered, volunteer value,
    response times, satisfaction.

---

## 4. Everything that was built — by module

### 4.1 Unified intake & inbox
- One engine receives messages from WhatsApp, the website, the client portal, and manual entries (phone call, walk-in,
  email) entered by staff.
- Duplicate protection, automatic client matching, continuation of the same story across channels (e.g. website →
  WhatsApp using the request code).
- Source / campaign tracking (Facebook/Instagram click-to-WhatsApp ads, Google, referrals, UTM tags).
- Inbox with tabs by status, filters (channel, source, legal area, priority), search across messages, unread counts,
  first-response-time tracking.
- Actions: reply, ask the client for more, handle internally, archive, reopen, convert to a file, link to an existing
  client, merge duplicate clients.
- **Privacy protections built after an adversarial security review:** a phone number typed into the website form is
  treated as *unverified*. It never gives access to the real phone owner's files, WhatsApp messages from the real owner
  never flow into that unverified request, request codes typed into the website are not followed, staff see a clear
  identity warning and can **confirm identity** or **revoke portal links**.

### 4.2 Consultation files («ملفات الاستشارات»)
- Independent codes per legal area (`INH-`, `FAM-`, `GRD-`, `PEN-`, `PRP-`, `CIV-`, `LAB-`, `CRM-`, `COM-`, `TAX-`,
  `ADM-`, `GEN-`) and client codes (`CL-…`).
- Facts split into *internal facts* (staff only) and *shared facts* (what lawyers may see).
- Legal issues list (numbered), documents, info requests, counsel requests, team, opinions, client answers, activity
  timeline, cost of the file.
- Close / reopen with outcome; reopening sends the knowledge record back for review; approved lawyers can be
  "re-engaged" for follow-up work without being paid twice.
- Parties (opponent, related, witness) with automatic conflict-of-interest warnings.
- Linking to a funding programme.

### 4.3 Lawyer network & fine-grained visibility
- Lawyer profiles: specialties, bar registration, capacity, agreement, performance metrics (response time, quality
  score, on-time rate, client satisfaction).
- Assignments with roles: lead, specialist, second opinion, reviewer, co-counsel.
- **Grants:** per assignment, staff choose exactly which facts, issues, documents, other lawyers' opinions and info
  requests the lawyer can see. Anything not granted returns "not found" to the lawyer.
- Lawyer requests that always go through admin: **Request Information / Document** and **Request Counsel Assistance**
  (second opinion, specialist input, document review, co-counsel).
- Decision queue «بانتظار قرار الإدارة» collecting everything waiting for staff: lawyer requests, client replies,
  submitted opinions, approved-but-unanswered files, identity conflicts.

### 4.4 Ongoing court case files («الملفات المستمرة»)
- Court data (court, circuit, lawsuit number and year, opponent), responsible lawyer.
- Hearings and appointments, procedural deadlines and tasks, invoices, payments with receipt numbers
  (`RCPT-YYYY-NNNNN`), expenses (paid by the foundation or the client), lawyer fees, messages, documents.
- Client attachments are visible to the responsible lawyer only if staff explicitly share them.
- Text a lawyer types for an appointment is never sent to the client until staff approve it.

### 4.5 Accounting for lawyers
- Agreement types per lawyer: per approved consultation (e.g. 500 EGP), monthly fixed, monthly with a quota and an
  overage price, prepaid package, fully pro bono (volunteer), CSR (provided by a law firm under a corporate commitment),
  plus per-assignment custom fees (e.g. lead 500 / specialist 250 / reviewer pro bono).
- Fees are generated automatically when an opinion is approved (or when a file closes, depending on the agreement),
  once per assignment.
- Monthly closing, adjustments, expense reimbursements, voiding, payouts, a ledger, per-lawyer statements (the lawyer
  sees and can print their own), real cost per file, value of volunteer contributions.
- Protections: no monthly fees after a lawyer is deactivated, a partial month when an agreement changes.

### 4.6 Automations
- Hearing reminders to the beneficiary by WhatsApp (e.g. 3 days before; "your presence is required"), invoice
  reminders, reminders about documents the beneficiary still owes, procedural deadline alerts to lawyers and staff,
  overdue assignment alerts, satisfaction survey, response-time alerts.
- Each rule can be enabled/disabled and its timing and text edited; an outbox shows every automated message.

### 4.7 Knowledge base & AI quality loop
- When a file closes, a knowledge record is built automatically (facts, issues, documents requested, specialists used,
  final answer, the journey, AI corrections).
- Personal data is removed automatically (names, phones, national IDs, addresses) and a human must confirm the
  redaction before approval. Records can be used for lawyer reference, AI training, both, or excluded.
- AI performance is measured from every staff/lawyer correction (accepted / corrected / rejected / missed).

### 4.8 Marketing analytics
- Funnel by source, campaign and channel: requests → files → answered → court cases.
- Ad spend per month/source/campaign, cost per request and cost per file.
- Weekly volume, distribution by legal area.

---

## 5. What version 9.0 added (the "pre-launch" release)

Version 9 turned the working system into something the foundation can actually host and start using. It was built by
seven parallel teams of AI engineers, each followed by an adversarial reviewer, then integrated, then tested by a full
"real first launch" rehearsal plus a security review and an Arabic user-experience review.

### 5.1 Launch readiness & operations
- **First-run setup wizard** (`/setup`): on a fresh production server the system prints a one-time secret link in the
  server log. Opening it lets the owner set the organisation profile (pre-filled with Beyoot Misr's real details),
  create the first real admin account with a strong password, and optionally paste WhatsApp and Claude keys. The link
  works once and the page disappears forever afterwards.
- **Admin recovery from the server:** `npm run admin -- --username …` creates or resets an admin account, ends their
  sessions and can reset two-step login.
- **Integrations page** (`/integrations`): paste WhatsApp Business and Claude AI keys inside the app. Secrets are stored
  **encrypted** and never shown again (only the last 4 characters). Each integration has a **"test connection"**
  button. The page shows the exact webhook address to give Meta and step-by-step Arabic guides.
- **Backups:** automatic daily database backup (keeps the last 14), "back up now", download (logged), a **full export**
  (database + uploaded files + manifest with checksums) for moving to another server, `npm run backup` and
  `npm run restore` commands. A first backup is taken immediately after setup.
- **System health page** (`/system`): a launch-readiness checklist, version, uptime, database and storage size, free
  disk, scheduled jobs with "run now", failed messages, integration status, last backup age.
- **Deployment files:** `render.yaml` (one-click Render deployment with a persistent disk), `docker-compose.yml`
  (any server, with optional automatic HTTPS via Caddy), hardened `Dockerfile`, complete `.env.example`, and a long
  Arabic deployment guide `DEPLOY.md` with a go-live checklist.
- Files are stored privately (data folder and database readable only by the app).

### 5.2 Accounts & security
- **Invite links** for new lawyers and staff (valid 72 hours) — the admin doesn't need to know their password; can be
  sent via WhatsApp.
- **Password reset links** generated by the admin; forced password change on next login; self-service password change.
- **Two-step login (2FA)** with any authenticator app (Google Authenticator, etc.), a QR code generated inside the
  app, and 10 single-use recovery codes. The admin can require it for all admins.
- **Sessions page** for every user: see active devices and sign out of any or all others; automatic logout after idle
  time.
- **Account lockout** after repeated wrong passwords; rate limits per address and per account.
- **Security log** (`/audit`): logins, failures, lockouts, 2FA changes, password resets, invites, user changes,
  portal links, exports, backups, settings and integration changes, prints — with filters and CSV export; admins are
  alerted on critical events.
- **Bulk downloads** of personal data use one-time, 60-second download links tied to the user's session, so another
  website cannot trigger them.

### 5.3 WhatsApp Business (real Meta Cloud API)
- Runs on the keys entered in the integrations page (no restart needed). Without keys it runs in a safe
  **simulation mode** (messages are recorded but not sent) — useful for training.
- Incoming messages via a signed webhook (unsigned messages are refused in production).
- Read receipts when staff open a conversation.
- **Send documents to the beneficiary** (by WhatsApp inside the 24-hour window, otherwise through the portal).
- **Template sync** from the WhatsApp Business account and mapping of approved templates to purposes (case updates,
  login code, survey, each reminder) — required by WhatsApp outside the 24-hour window.
- **Ready-made replies** («الردود الجاهزة») with categories, `/` shortcuts and variables (name, file code, request
  code, organisation name) — available in every conversation box.
- **Beneficiary portal login by WhatsApp code** (`/portal`): enter a mobile number, receive a 6-digit code (only for
  verified numbers; the response never reveals whether a number exists), get into the personal portal.
- **Satisfaction survey** with WhatsApp buttons (ممتاز / جيد / غير راضٍ) or a 1–5 reply; ratings appear on the file,
  on the lawyer's performance and in reports.

### 5.4 Foundation-specific tools (social work + legal practice)
- **Beneficiary card** («بطاقة المستفيد / البحث الاجتماعي»): relation (widow, guardian of orphans, divorced/head of
  family, wife, other), number of children (birth years and gender only), income band, housing, employment, disability,
  foundation file number, whether verified by staff — with a transparent **priority score** and the reasons for it.
  Lawyers never see it.
- **Impact report** (`/impact`): families served, widows, children, files closed by outcome, **value of rights
  recovered** (one-time, monthly, annualised), volunteer lawyers' value, average time to first response, satisfaction,
  by area / governorate / month; printable for the board, donors and the Ministry; CSV export.
- **Conflict-of-interest check**: parties (opponents etc.) on files and court cases are compared against all clients
  and other parties (with Arabic name normalisation and national ID); warnings with links; a search page
  (`/conflicts`).
- **Calendar** (`/calendar` for staff, `/my/calendar` for lawyers): hearings, procedural deadlines, assignment due
  dates, invoice due dates; month and agenda views; **subscribe from a phone calendar** (iPhone / Google) with a private
  link (lawyers' feeds never contain client contact details).
- **Data import/export** (`/data`): Excel-friendly CSV exports of clients/beneficiaries, requests, files, court cases,
  lawyers and the ledger; CSV import of lawyers and beneficiaries with a preview that validates every row.
- **Response-time target (SLA):** first-response time is measured; staff are alerted when a new request waits longer
  than the target (default 4 hours); dashboard shows the average and the overdue count.
- **Global search** (Ctrl/⌘+K) across clients, requests, files, court cases and lawyers; lawyers search only their
  own work.

### 5.5 Claude AI (Anthropic)
- Uses the key entered in the integrations page; without a key, a built-in rule-based analyser still works (summaries,
  classification, missing-information checklists, issue suggestions, draft templates).
- **Usage and cost tracking** per feature with a **monthly budget cap**; when exceeded, the system automatically falls
  back to the built-in analyser and notifies admins.
- **Suggested replies** for staff in every conversation — short, WhatsApp-ready, grounded only in the conversation and
  approved material; never reveals lawyer names or internal notes.
- **Document analysis**: inheritance certificates, contracts, court rulings, death certificates, ID cards, marriage /
  divorce certificates, birth certificates → document type, key facts, what it proves, red flags, missing related
  documents. Lawyers can analyse only documents granted to them.
- **Drafting informed by approved past cases** (with citations to the anonymised knowledge records used).
- Two new legal areas for the foundation's typical cases: **pensions & social insurance / Takaful and Karama (PEN)**
  and **guardianship over minors' money / النيابة الحسبية (GRD)**, with Egyptian-specific checklists.
- Prompts tuned for Egyptian personal-status and inheritance law and a careful, dignified tone for widows and orphans.

### 5.6 Public website
- Rebuilt as «الدعم القانوني — مؤسسة بيوت مصر»: who we help, services by legal area, how it works in 3 steps,
  free service and eligibility explanation, privacy promise (lawyers don't see your number), FAQ, contact (address,
  phone, office hours, map, Facebook), links to the foundation's other programmes. No invented testimonials or
  statistics.
- Request form with the optional beneficiary section, attachments, consent, and a success page with the request number
  and a private follow-up link.
- **Legal pages Meta requires** for WhatsApp approval: privacy policy, terms of use, data deletion instructions, plus
  an "about the programme" page.
- SEO (search and social-sharing tags, structured data, sitemap, robots), icons and a social preview image.
- **Install as a phone app** (PWA) for staff and lawyers.
- The beneficiary portal uses the same branded header and footer; WhatsApp buttons appear only once a real number is
  set.

### 5.7 Funding programmes & printing
- **Programmes** (`/programs`): grants, zakat (نماء), CSR partners, donors, internal funds — with funder, dates, budget,
  eligible areas and governorates. Files are linked to a programme; spend is computed from lawyer fees and
  foundation-paid expenses; budget vs. spend, burn rate, runway, families served, outcomes; alerts at 80% and 100%;
  printable funder report (no beneficiary names).
- **Printable documents on the foundation's letterhead** (A4, page numbers, print or save as PDF): client invoice
  (amount in Arabic words), payment receipt, formal legal answer letter «إفادة قانونية» (signed by the foundation, not a
  lawyer), lawyer statement, internal case summary, programme report. Each respects the same permissions as the data.

---

## 6. Privacy & security design (summary)

- All permissions are enforced on the server for every request; anything a user may not see returns "not found".
- Lawyers never see beneficiaries' phone numbers, conversations, beneficiary cards, or documents not granted to them.
- Unverified website phone numbers cannot be used to reach someone else's data; portal links can be revoked.
- Passwords are hashed (scrypt); sessions use secure cookies; 2FA available; account lockout and rate limits.
- Protection against cross-site requests (JSON-only + origin checks), strict content security policy.
- WhatsApp webhooks are signature-checked; integration secrets are encrypted at rest with a key kept outside the
  database.
- Uploaded files are checked by their real content (not just the file name) and stored privately.
- Nothing enters the knowledge base without human-reviewed redaction of personal data.
- Every sensitive action is recorded in the security log.

---

## 7. Technology (for technical readers)

- Node.js 22, **zero runtime dependencies** (only the optional official Anthropic SDK). Built-in SQLite database
  (one file), file uploads on disk. Runs anywhere Node or Docker runs.
- Arabic right-to-left single-page web app (no framework), mobile-first, works at phone width.
- 411 automated tests, plus a browser tour of 158 page views (staff, lawyers, public site, portal at phone and desktop
  sizes) with no errors.
- Key folders: `src/` (server: services, routes, channels/WhatsApp, ai/, schema.d/ database extensions),
  `public/` (website, staff app, portal), `scripts/` (admin, backup, restore, demo reset), `test/`.
- Main documents in the repository: `README.md` (overview, Arabic), `DEPLOY.md` (deployment guide, Arabic), this file.

---

## 8. Demo mode

Running locally with `npm start` loads a realistic demo (fictional people) so everything can be explored:

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@2026` | System admin (كريم منصور) |
| `manager` | `Manager@2026` | Case manager (منى السيد) |
| `ahmed` | `Lawyer@2026` | Lawyer — inheritance (lead) |
| `mohamed` | `Lawyer@2026` | Lawyer — tax specialist |
| `salwa` | `Lawyer@2026` | Lawyer — final reviewer (volunteer) |
| `heba` | `Compliance@2026` | Admin with two-step login (authenticator key `BEYOOTMISRDEMOTWOFACTORKEYSECRET`) |

Other lawyers in the demo: rania, hany, yasmine, tarek, amr (password `Lawyer@2026`). The main story to explore is
file **INH-2026-00482** for client **CL-00881** (an inheritance dispute with property, a flat and minors' rights).
The demo also includes court cases with hearings, an unverified website request to show the identity warning,
funding programmes, surveys, quick replies and backups.

---

## 9. How to run and deploy

- **Try it on a computer:** install Node.js 22+, then in the `legal-platform` folder run `npm start` and open
  `http://localhost:3000/app` (staff) or `http://localhost:3000/` (public site).
- **Go live (recommended: Render):** merge the code into `main` on GitHub → Render → New → Blueprint →
  path `render.yaml` (repository root) → wait for the build → open the `/setup#token=…` link from the logs → create the
  admin → paste WhatsApp and Claude keys on the integrations page → follow the launch checklist on the system page.
  Cost: roughly $7–8/month for the server and disk, plus WhatsApp conversation fees and Claude usage.
- **WhatsApp:** requires a verified Meta Business account, a WhatsApp Business phone number, a permanent token, the
  phone number ID, the WhatsApp Business account ID, the app secret, the webhook address shown in the app, and approved
  templates (`case_update`, a login-code template).
- **Claude:** create an API key at console.anthropic.com, paste it in the integrations page, set a monthly budget.
- Full details: `DEPLOY.md`.

---

## 10. Open decisions before launch (need the foundation's input)

1. **Office hours** shown on the website (default Saturday–Thursday 10:00–16:00 is a placeholder guess).
2. **Contact email** (not set yet, so hidden).
3. **WhatsApp number** for the public buttons (hidden until a real WhatsApp Business number is set; it was not assumed
   that 01211114662 is on WhatsApp).
4. **Privacy policy commitments** to confirm: deletion within 30 days of a request, data kept at most 5 years after a
   file closes, only AI providers that do not train on the foundation's data. Deletion is currently done manually by
   staff.
5. **Satisfaction survey** is on by default; right after launch it may survey beneficiaries answered in the previous
   week.
6. **Demo passwords** are for demo only — production starts empty and uses the setup wizard.
7. The Docker image was not test-built in the development environment (no Docker there); the first Render build will be
   its first real build.

---

## 11. How it was built (history)

- **Version 1:** the core platform — unified intake, inbox, files, lawyer network with grants, lawyer portal, review
  and approval, client answers, court cases, accounting, automations, knowledge base, marketing analytics, client portal,
  WhatsApp simulation, AI analysis — all in Arabic.
- **Review round:** an independent multi-agent review found 50 issues (3 serious privacy holes, plus business logic and
  Arabic language issues); all were fixed with regression tests.
- **Version 9.0:** the seven modules in section 5, built in parallel, each adversarially reviewed, then integrated and
  verified with a full launch rehearsal, a security review and an Arabic UX review (37 further findings, all fixed).
