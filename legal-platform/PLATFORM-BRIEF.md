# Beyoot Misr Legal Support Platform — Complete Brief (version 9.2, pre-launch)

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
| Lawyer | المحامي | Only their own assignments («إسنادات») and court cases they are responsible for; sees only what was granted; drafts opinions, asks for information, a document, more time or another lawyer's help, asks the administration a question, records hearing outcomes and tasks, sees their own pay («مستحقاتي»). Since 9.1 the lawyer's home page is «اليوم» (Today), built for a phone. |
| Beneficiary / client | المستفيد/ة | No account. Uses WhatsApp, the website form, and a private follow-up page (saved on her phone, or opened with a WhatsApp code) to follow the request, answer questions, send photos and voice notes, reply to hearings and fees, and ask for a call. |

Arabic terminology was standardised across the whole product: «إسناد» = a piece of work given to a lawyer, «مهمة» = a
task inside a court case, «استشارة/ملف» = a consultation file, «قضية» only for real court cases, «مستفيد/مستفيدة» for
the people served, currency always «ج.م», correct Arabic number–noun agreement everywhere.

---

## 3. The full journey of one request (end to end)

1. **A beneficiary writes** on WhatsApp or fills the website form — since 9.1 three short steps: tell us the problem
   (a voice note or a sentence or two), photograph any papers, then name, mobile, governorate, two optional questions
   (her relation such as widow, and number of children) and consent. A one-tap button then lets her send the request
   number on WhatsApp to confirm her number. Each channel is just a "door" into one unified
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
   Since 9.1 it starts with a plain «الخلاصة» (summary) and numbered steps «تعملي إيه دلوقتي؟» (what to do now),
   with the full text folded underneath. A printable formal letter «إفادة قانونية» on the foundation's letterhead can be
   produced.
8. **A satisfaction survey** is sent automatically ~24 hours later; low ratings alert the case manager.
9. **If it goes to court**, the file becomes an ongoing **court case file** («ملف مستمر», code like `MTR-2026-00001`)
   with court, circuit, lawsuit number/year, opponent, hearings, procedural deadlines, tasks, invoices, payments,
   expenses and the responsible lawyer. Hearing reminders go to the beneficiary automatically (after staff approve any
   text a lawyer typed). Since 9.1 the lawyer records each hearing's outcome from the court corridor in three taps, and
   the beneficiary answers «هحضر / مش هقدر أحضر» (I'll attend / I can't) on her page.
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

## 6. Version 9.1 — simpler for beneficiaries and lawyers

Version 9.1 did not add new "modules". It made the two groups who use the platform on a phone — beneficiaries and
lawyers — able to do their part with fewer steps and plainer words. Usability specs and audits were written first, then six
parallel lanes built the changes (beneficiary: request form, follow-up page, website and messages; lawyer: Today home,
work on an assignment, court and pay). Each lane was reviewed by an independent reviewer and tried in a real browser at
phone widths (360 and 390 px, plus 1366 px for lawyer and staff pages). **The privacy model is unchanged.**

Language rules used everywhere: beneficiaries get very simple everyday Egyptian Arabic, addressed by the name she uses
(often a kunya such as «أم محمد»), in the feminine by default or the masculine when staff set «مذكر» for that person,
with times said the way people say them («10 الصبح»), one request number only, and no legal word without an
explanation. Lawyers get concise professional Arabic.

### 6.1 For beneficiaries
- **Request in 3 short steps** (`/intake`): «احكيلنا مشكلتك» ("tell us your problem") by voice note (up to 3, each up to
  3 minutes) or a sentence or two (10 letters are enough; the topic is optional) → «عندك ورق؟» ("any papers?") with a
  "photograph a paper" button first (up to 5 photos, shrunk on the phone before upload, with a visible progress bar;
  papers can also be sent later) → name, mobile, governorate, two optional questions, consent.
- **A draft that survives**: text, photos and recordings stay on the phone if the tab is closed or the network drops
  (for 7 days), and are cleared after sending. Re-sending after a dropped connection never creates a second request.
- **One-tap WhatsApp confirmation**: the success screen has a button that opens WhatsApp with a ready message
  containing the request number and a 6-digit code (valid 30 days). When that message arrives **from the same number**,
  the number is confirmed, she gets a WhatsApp reply with the link to her page, and staff replies reach her on WhatsApp
  from then on. Until then everything stays on her follow-up page only. The button appears only when the foundation has
  a real WhatsApp number. The same screen lets her save or send herself the link to her page.
- **A one-screen follow-up page** (`/p/<token>`): a greeting by name, one card "what we need from you now", a
  plain-words tracker «طلبك وصل لفين؟» ("where is your request?": received → our team is reviewing → the lawyer is
  studying your problem → you got the answer, plus "your case is in court" when there is one) with an approximate time,
  call and WhatsApp buttons, «اطلبي مكالمة» ("ask for a call", twice a day at most), and a "we're closed now" line outside
  office hours. Only the request number is shown (`REQ-…`, plus "request number 29" to say on the phone) — never an
  internal code or a lawyer's name.
- **Photo-first paper requests**: when staff ask for papers, each paper is its own row with a "photograph it" button
  and thumbnails of what she sent, plus «مش لاقية الورقة دي» ("I can't find this one") per item; the request stays open
  for the rest. She can also send photos and voice notes in messages.
- **An answer she can understand**: a plain summary first, then numbered steps she can tick as done, the full answer
  folded under «اقري الرد كامل», a «مش فاهمة حاجة؟ اسألينا» ("didn't understand? ask us") button tied to that answer,
  a "listen to the answer" button when the phone has an Arabic voice, and an optional voice message from the foundation.
- **Hearing card with RSVP**: day and time as spoken, place with a map button, «هاتي معاكي» (what to bring, after staff
  approve it), buttons «هحضر إن شاء الله / مش هقدر أحضر / عندي سؤال» (attend / can't / question) whose answer reaches
  staff, and "add to my phone calendar". WhatsApp reminders 3 days and 1 day before (two at most per hearing).
- **Calm money cards**: one card per amount with its reason, "the consultation itself is free", "talk to us before you
  pay anything", and buttons agree / I have a question / I can't pay. **No payment reminder is sent before she agrees**;
  "I can't pay" alerts staff with the request number; "how do I pay?" comes from a setting.
- **Getting back to the page with no dead end** (`/portal`, «تابعي طلبك»): the page saved on this phone first, then a
  WhatsApp code for confirmed numbers, then "applied on the website and lost the link?" → call or WhatsApp us; after a
  minute without a code everyone sees the phone number.
- **Every message in plain words**: reminders, paper requests, surveys and the confirmation reply use her name, at most
  one request number, a link to her page where useful, and the right gender form; no «حضرتكم» and no file codes. The 9.0 default automation
  texts are upgraded automatically unless staff had edited them.
- **Website**: the first screen says the service is free and private with one button «احكيلنا مشكلتك»; services are
  named in everyday words (inheritance, pension, alimony…) and open the form on that topic; privacy, terms and about
  start with a short «بالمختصر» ("in short") box.
- **Faster pages on a weak network**: a self-hosted Arabic font (no Google Fonts, no third-party requests), versioned
  JS/CSS cached for a year with module preloading, organisation data embedded in the page (no wait for `/api/meta`), a
  landing page that does not load the component library, a follow-up page that carries its own data and loads the camera
  and recorder only on first use, and Brotli compression.

### 6.2 For lawyers
- **«اليوم» (Today) home**: one ordered list of what to do now — hearing held without an outcome, overdue opinion,
  returned opinion, overdue task, hearing today, deadline soon, new assignment, reply from the administration, upcoming
  task — with one-tap "done" (and undo) for tasks. No beneficiary data. Cached on the device so it opens offline while
  the session is still valid.
- **Bottom navigation on phones**: Today (with a count), my assignments, my calendar, more; a back button on detail
  pages; a logout confirmation that warns about anything not yet sent.
- **Focused writing mode that never loses text** («رأيي»): every keystroke is copied to the device before any upload,
  autosaved with retries, and never silently written over newer text from another device (the server answers
  `409 draft_conflict` and the lawyer chooses). Full-screen on a phone with a bar above the keyboard; a reference panel
  beside the editor on a computer; an opinion skeleton from the numbered legal issues; and optional plain steps for the
  beneficiary (up to 8) that staff may use.
- **In-app document viewer**: images in a built-in viewer, PDFs in the browser's viewer; download is an explicit menu
  choice.
- **One request sheet «ماذا تحتاج؟»** ("what do you need?"): a document (up to 5 items, with suggestions of missing
  documents based on the legal area and what the lawyer can already see), information, **an extension** (a new date after
  the current deadline, at most 60 days; staff approval moves the deadline) or **a question to the administration**
  (answered without involving the beneficiary). "I need this too" joins an open request instead of duplicating it, and a
  line shows what was already asked of the beneficiary. With Claude enabled, document-analysis suggestions become a request
  in one tap.
- **Returned-opinion compare**: the administration's numbered notes become a checklist ("1 of 3 addressed") and "compare
  with the returned version" highlights only the changed paragraphs.
- **3-tap hearing outcome from the court corridor**: "what did the court decide?" → adjourned / reserved for judgment /
  judgment issued / not heard, with the adjournment reason and the next date (required when adjourned; same time as
  this hearing). The next hearing is created automatically **held for staff approval** before any reminder reaches the
  beneficiary; an appeal deadline entered after a judgment becomes a procedural task. Hearings held without a recorded
  outcome show in Today and the calendar, and the lawyer is reminded that afternoon and the next morning.
- **Offline outbox**: hearing outcomes and "task done" are kept on the device when there is no network and sent
  automatically, in order, exactly once, when it returns; stored per user and wiped at logout.
- **«مستحقاتي» (my pay)**: how much this month and when (the usual payout date is a staff setting), unpaid amounts from
  previous months and the last payout — no accounting jargon; volunteers see their number of contributions.
- **WhatsApp alerts without beneficiary data** (opt-in, off by default, from "my account"): new assignment, returned
  opinion, one day before a deadline, overdue, hearing without an outcome, reply from the administration, and a morning
  digest when something is due. Texts contain only codes, dates and a link; nothing is sent between 22:00 and 08:00 Cairo
  time (queued to 08:00); at most 6 a day; sent only with a dedicated WhatsApp template (`lawyer_alert`); a "test the
  alert" button. **Device notifications (Web Push)** on the installed app show only a generic lock-screen text.
- **Remembered devices**: "remember me on this device" for lawyers only — 30 days with two-step login (14 days idle),
  7 days without (3 days idle), adjustable or switchable off in the security policy; ended by "sign out other sessions",
  a password change or a 2FA reset. "Forgot password?" sends a 30-minute link on WhatsApp to lawyers who enabled alerts
  (the same reply is shown for any username).
- **First run on a phone**: accept the invitation with the confidentiality pledge, then a "set up your phone in a minute"
  card (WhatsApp alerts, add to home screen, hearings in the phone calendar, optional 2FA); 2FA can be set up on the
  same phone with an "open authenticator app" button and a copyable key instead of scanning a QR code.
- **Faster**: `/app` opens from the service-worker cache and then updates, one request brings the session and the page
  data, `/api/meta` uses ETag/304, a light login screen, and the self-hosted font.

### 6.3 For staff (what supports the above)
- The answer composer has «الخلاصة» (plain summary) and «الخطوات» (up to 8 steps, with an automatic suggestion from
  the approved opinion), plus an optional voice message.
- Paper requests with items (up to 5), «هاتي معاكي» for hearings she must attend, and an address form
  (feminine/masculine) on the client card.
- Her answers from the page reach staff: attending / can't attend, "I can't pay", "asked for a call".
- Decisions on a lawyer's extension request and answers to a lawyer's question; search by the short request number
  ("29").
- New settings: the lawyers' usual payout date and the payment instructions shown to beneficiaries; in the security
  policy, "remember me" for lawyers.

### 6.4 Privacy additions in 9.1
- **An unconfirmed website number never receives WhatsApp** and never opens the real number owner's data. Confirmation
  needs a message from that same number containing the request number and code (the code is stored as a keyed hash; after
  5 wrong codes even the right one no longer works and staff are told). On confirmation the website link issued for that
  request is revoked, so someone who typed her number sees nothing.
- **Voice notes** are never part of "all documents" when staff grant documents to a lawyer and are never pre-ticked when
  sharing a reply with a lawyer (they may contain contact details).
- In "already asked of the beneficiary", the lawyer never sees her name (unless granted), phone, page link, kunya or
  street address.
- Lawyer alerts (WhatsApp and device) carry no beneficiary data, and every WhatsApp link (beneficiary page, lawyer
  alerts, lawyer self-reset) is built only from `PUBLIC_BASE_URL` (or Render's own service URL), never from the
  request's `Host` header; without it no link is sent.
- The microphone is allowed only on `/intake` and `/p/<token>`.

---

## الإصدار 9.2 — Version 9.2: picture tiles, stories turned into requests, the foundation's colours

The user asked for three things (in Egyptian Arabic): (1) the moment people open the site they should see **squares to
pick from** — "the simplest thing in the world", assuming people who may not read well; (2) the site in **the
foundation's colours**; (3) for the administration, **AI that pulls the story a beneficiary tells on WhatsApp or on the
website, summarises it and turns it into a request** — a consultation, a court matter or whatever fits. Three lanes built
these in parallel. The privacy model is unchanged: an unconfirmed website number never receives WhatsApp, lawyers never
see phone numbers or raw conversations, and AI text is always reviewed by staff before it reaches a beneficiary or a
lawyer.

### Public site: picture tiles first

<!-- v92:public -->
- **First screen (`/`)**: one question («مشكلتك في إيه؟») and **8 picture tiles** in the order ورث، معاش، فلوس الأيتام،
  نفقة، حضانة ورؤية، سكن وإيجار، ورق رسمي، حاجة تانية (with «أو مش عارفين»), then a ways row: **«إحنا نكلمك»** (free
  call-back: one tap + the number), «واتساب» (real number only), «طلبك فين؟» (replaced in the same box by «صفحة طلبك» with
  a 48×48 ✕ when her page is saved on the phone). Tiles, the «مجاني وسرّي» badge and a header WhatsApp/phone button fit a
  360×512 visible area without scrolling. First-screen wording is gender-neutral (nouns; neutral plural when spoken);
  everything after the first tap is feminine Egyptian. Tile colours come from the brand scale through contract pairs only
  (tile edge `primary-500`, pressed `primary-700` on `primary-100`).
- **Tile-led form (`/intake`)**: 1–2 picture questions per topic (one tap; a full-width «مش عارفة» tile records `unknown`),
  then the story screen (voice first; text and photos optional), then the phone screen. **No consent checkbox**: a consent
  line above the send button (`consent_v = 1`; open decision for the legal adviser). Name optional; governorate and
  relation asked after sending («كمان سؤالين», `POST /api/portal/:token/about`, single-request links only, never touches
  the client row). Double-tap safe (450 ms guard, one recorded tap per screen). Phone back = previous screen. In
  Facebook/Instagram in-app browsers the story screen leads with «ابعتي رسالة صوتية على واتساب».
- **Call-back-only requests** (`/intake?mode=callback`): number + time (morning/noon/any) + optional topic. Stored as a canned,
  non-factual message («عايزة حد يكلمني — الصبح», or «محتاجين حد يكلمنا — …» with no name), `meta.callback_canned`,
  activity + staff notification `client.callback`. The success screen promises when and from which number we call
  (`callback_from_number` or `org_phone`, `callback_eta_days`) and how she will recognise us («طلب رقم 29»). B91-01 holds:
  the number stays unconfirmed, staff replies stay on her page.
- **Listening aid**: «بالصوت»/«اسمعي» appears only when an Arabic voice exists; once switched on, every same-document screen
  change reads itself (H1, sub-line, answers, consent line); never speaks without a tap; a voice that never starts hides
  the button.
- **Data contract**: `intakes.form_answers` = `{v, topic, answers, callback, story, entry, inferred, consent_v, about}`;
  `topics.js` is the single topic source for the browser and the server (`staffLines()` under «اختيارات ضغطت عليها في الموقع
  (قد تكون غير دقيقة)»). Lawyers never see it.
- **Budgets**: `/` ≤ 14 KB br (critical CSS ≤ 12 KB, zero render-blocking requests, zero box shift of the tiles), landing JS
  ≤ 4 KB br, `/intake` static closure ≤ 32 KB br without `recorder.js` (prefetched from `/` while she decides), `listen.js`
  ≤ 3.5 KB br. A CSS-only «الصفحة بتحمّل ببطء» block with phone/WhatsApp appears after 8 s if the form module never runs.
- **Demo**: «أم يوسف» (ورث, call-back الصبح, no story), «أم ريم» (سكن وإيجار, eviction threat, text story) and a no-name
  call-back from the home «إحنا نكلمك» tile.

### Administration: from a story to a ready request

<!-- v92:admin-ai -->
_(filled in by the admin-ai lane.)_

### The foundation's colours («ألوان المؤسسة»)

<!-- v92:colours -->
- **What the admin sees.** Settings → «ألوان المؤسسة» (admins only; direct link `#/settings?section=brand`, which
  scrolls to the card and focuses its heading). Two colours: the main colour (main buttons, page headers, staff sidebar)
  and the second colour (the «احكيلنا مشكلتك» button and highlighted tiles), each with a colour picker and a hex field
  (accepts `#abc`, upper case and Arabic-Indic digits). A live preview shows a mini public header, the «ورث» and «معاش»
  tiles with their pictures, the «ابعتي» button and a sidebar strip with a count badge.
- **Colours from the logo, without uploading it.** «اختر صورة الشعار لاقتراح الألوان» reads a picture on the admin's own
  device (shrunk to 200×200; files over 15 MB are refused) and offers up to 4 colours under each field. Nothing is
  uploaded or stored — the logo itself is not part of 9.2 (deferred).
- **Readable text for any choice.** The server and the preview generate all shades (17 steps plus 5 RGB triplets) with
  the same pure module (`public/assets/js/lib/brand-color.js`, an OKLCH ladder fitted to the 9.1 palette) and guarantee
  a 29-pair contrast contract (WCAG AA: 4.5:1 for text, 3:1 for edges and icons — including the tile border `p500` on
  white). When the admin's colour had to be darkened or lightened, a box says so with both values before saving. Tested
  on 644 colour pairs, including pure white, pure black and fluorescent yellow.
- **Where it shows.** Every public page (home and tiles, request form, follow-up page, legal pages, 404) and the staff
  and lawyer app `/app` get one inline block `<style id="bm-theme">html:root{…}</style>` (about 520 bytes) in the page
  head, so the colours are right from the first paint with no extra request; the browser bar colour follows. The
  admin's own page restyles without reloading. A lawyer whose phone has the app cached sees the new colours from the
  next open, and the service worker does not change, so no "update available" prompt appears.
- **Default unchanged.** With no setting, no block is emitted and pages render exactly as in 9.1 (teal `#0f4c5c`,
  gold `#b8862e`). «رجوع للألوان الأصلية» (with confirmation) removes the setting. A corrupted setting never breaks a
  page: the defaults are used.
- **Security.** `GET/PUT/DELETE /api/admin/brand…` are admin-only with the usual CSRF checks; every change is in the
  security log («تعديل ألوان المؤسسة» / «إرجاع ألوان المؤسسة الأصلية»). The block is inserted only after its shape is
  checked (`html:root{--name:#hex;…}`) on the server and in the browser, and written with `textContent`. The generic
  settings PATCH cannot change the colours. A launch-readiness item «ألوان المؤسسة» is informational only.
- **Stylesheets.** All brand colour literals became tokens (`--primary-*`, `--accent-*`, `rgb(var(--…-rgb) / a)`); the
  default values live only in two marked blocks (`app.css`, `public-site.css`). Text on the gold colour uses
  `--on-accent` (this fixed the white step number on gold in the follow-up page tracker, which was 3.24:1). The test
  `test/v92-colours.test.js` fails on any brand literal outside those blocks and on any text/background pair outside
  the contrast contract.

---

## 7. Privacy & security design (summary)

- All permissions are enforced on the server for every request; anything a user may not see returns "not found".
- Lawyers never see beneficiaries' phone numbers, conversations, beneficiary cards, or documents not granted to them.
- Unverified website phone numbers cannot be used to reach someone else's data; portal links can be revoked. Since 9.1
  an unconfirmed website number also receives no WhatsApp message at all until it is confirmed from that same number
  (or by staff).
- Beneficiaries never see internal data: their page shows only the `REQ-` request number — no file codes, lawyer names
  or internal notes.
- Passwords are hashed (scrypt); sessions use secure cookies; 2FA available; account lockout and rate limits.
- Protection against cross-site requests (JSON-only + origin checks), strict content security policy (since 9.1 with no
  external fonts or styles at all; the microphone is allowed only on the request form and the follow-up page).
- WhatsApp webhooks are signature-checked; integration secrets are encrypted at rest with a key kept outside the
  database.
- Uploaded files are checked by their real content (not just the file name) and stored privately.
- Nothing enters the knowledge base without human-reviewed redaction of personal data.
- Every sensitive action is recorded in the security log.
- 9.1 additions are listed in section 6.4.

---

## 8. Technology (for technical readers)

- Node.js 22, **zero runtime dependencies** (only the optional official Anthropic SDK). Built-in SQLite database
  (one file), file uploads on disk. Runs anywhere Node or Docker runs.
- Arabic right-to-left single-page web app (no framework), mobile-first: checked at 360 and 390 px wide (and 1366 px
  for staff and lawyer pages). Since 9.1 the Arabic font (IBM Plex Sans Arabic, SIL Open Font License) is served by the
  platform itself, JS/CSS are versioned and cached for a year, and responses are Brotli-compressed.
- 648 automated tests (`npm test`, all passing at version 9.1.0; 411 at version 9.0), plus the 9.0 browser tour of
  158 page views and, in 9.1, a browser usability run per lane at phone widths (including a simulated slow 3G network
  for the beneficiary pages).
- Key folders: `src/` (server: services, routes, channels/WhatsApp, ai/, schema.d/ database extensions,
  `seed-v91-*.js` demo stories), `public/` (website, staff app, portal, `assets/fonts/`), `scripts/` (admin, backup,
  restore, demo reset), `test/` (`v91-*.test.js` for the 9.1 lanes).
- Main documents in the repository: `README.md` (overview, Arabic), `DEPLOY.md` (deployment guide, Arabic), this file.

---

## 9. Demo mode

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

**Version 9.1 stories in the demo** (no new accounts; built with the real services in `src/seed-v91-*.js`). In demo mode
no WhatsApp message is really sent: outgoing messages, portal login codes and lawyer alerts appear in the outbox on the
"automations and messages" page.

| Who | What to try |
|---|---|
| `hany` | Today: a hearing held today without an outcome in `MTR-<year>-00002` (the previous hearing was recorded "adjourned"), an overdue opinion, a new co-counsel assignment in `INH-<year>-00482` due in two days, an upcoming task. He has WhatsApp alerts on (visible in the outbox, with no beneficiary data). «مستحقاتي» on a monthly agreement (EGP 8,000 this month). |
| `rania` | An opinion returned with three numbered notes in the alimony and custody-housing file, and a working draft that already addresses the first: writing mode, notes checklist and "compare with the returned version". |
| `ahmed` | In `INH-<year>-00482`: a photo opened in the in-app image viewer, "already asked of the beneficiary" (the inheritance certificate), and «قسيمة الزواج» suggested when asking for a document. |
| `01234567890` (Noha) | Log in at `/portal` with the code from the outbox: an answer with a summary and steps, a hearing with «هاتي معاكي» and RSVP buttons, and court fees waiting for her agreement with "how do I pay?". |
| `01012345678` (Samia) | A paper request with two items: one "photograph it" row per paper and "I can't find this one". |
| `01077001122` (Um Youssef) | A website request whose number was confirmed with the one-tap WhatsApp message; her reply came on WhatsApp and her number receives login codes. |
| `01093104455` (Mona) | A website request whose number was never confirmed: staff replies and the paper request stay on her page only; no login code and no WhatsApp reminder reach her number. |
| Um Yassin, Samah | Two website requests sent by voice note (the first with only a photo of a paper and no text) in the inbox. |

---

## 10. How to run and deploy

- **Try it on a computer:** install Node.js 22+, then in the `legal-platform` folder run `npm start` and open
  `http://localhost:3000/app` (staff) or `http://localhost:3000/` (public site).
- **Go live (recommended: Render):** merge the code into `main` on GitHub → Render → New → Blueprint →
  path `render.yaml` (repository root) → wait for the build → open the `/setup#token=…` link from the logs → create the
  admin → paste WhatsApp and Claude keys on the integrations page → follow the launch checklist on the system page.
  Cost: roughly $7–8/month for the server and disk, plus WhatsApp conversation fees and Claude usage.
- **WhatsApp:** requires a verified Meta Business account, a WhatsApp Business phone number, a permanent token, the
  phone number ID, the WhatsApp Business account ID, the app secret, the webhook address shown in the app, and approved
  templates (`case_update`, a login-code template, and since 9.1 `portal_update` — "there is news on your request" with
  no details — and `lawyer_alert` for lawyers' alerts). Template text is fixed by Meta and reaches men and women alike, so
  it must be written in gender-neutral wording; anything personal goes in the variables, which the platform fills in the
  right gender form.
- **`PUBLIC_BASE_URL` matters more in 9.1:** every link sent on WhatsApp (her page, lawyer alerts, lawyer password reset)
  is built from it. Without it beneficiary messages go without a link, lawyer alerts go without a link, and no reset link
  is sent; the system page shows this as a red item when WhatsApp is live.
- **Other 9.1 operations notes:** the Arabic font is self-hosted; versioned JS/CSS are cached for a year; a reverse proxy
  must not replace the platform's CSP, `Permissions-Policy` or `Cache-Control` headers (voice notes need the microphone
  permission on `/intake` and `/p/`, and HTTPS); Web Push keys are created automatically in `data/vapid.json` (included in
  the full export when "include keys" is ticked); do not set `SESSION_TTL_HOURS` if you want lawyers' "remember me"
  (`render.yaml` no longer sets it — session length is managed in the security policy).
- **Claude:** create an API key at console.anthropic.com, paste it in the integrations page, set a monthly budget.
- Full details: `DEPLOY.md`.

---

## 11. Open decisions before launch (need the foundation's input)

1. **Office hours** shown on the website and on the follow-up page (default Saturday–Thursday 10:00–16:00 is a
   placeholder guess). Since 9.1 a separate structured schedule (`office_hours_schedule`, same default) decides when
   the follow-up page says "we're closed now"; it has no settings screen yet and must match the text.
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
8. **(9.1) Approximate times promised in the tracker**: "usually within 2 working days" for staff review and "usually
   7 to 14 days" while the lawyer studies the problem are placeholders (`portal_eta_review_days`,
   `portal_eta_study_min_days`, `portal_eta_study_max_days`; no settings screen yet).
9. **(9.1) Payment instructions** for beneficiaries («إزاي أدفع؟») and the **lawyers' usual payout date** shown in
   «مستحقاتي» — both empty in production until staff fill them in Settings (the demo has sample text).
10. **(9.1) Meta templates `portal_update` and `lawyer_alert`** must be written in gender-neutral wording, submitted
    and approved, then mapped in the app; without an approved `lawyer_alert`, lawyers cannot turn on WhatsApp alerts or
    use "forgot password?" by WhatsApp.
11. **(9.1) "Remember me" for lawyers**: decide all lawyers / only with two-step login / off in the security policy.
    (Setting the `SESSION_TTL_HOURS` environment variable turns the feature off; `render.yaml` does not set it.)
12. **(9.2) The foundation's real colours.** Nothing public gave them, so the platform keeps its teal and gold. An admin
    sets them in a minute in Settings → «ألوان المؤسسة» (colour suggestions can be taken from a picture of the logo).
13. **(9.2) WhatsApp welcome list and the «وصلتنا حكايتك» acknowledgement.** Both are off by default in code (the
    acknowledgement is on in the demo); the launch-readiness page flags the acknowledgement while it is off. Decide
    decision 22 (privacy wording) first.
14. **(9.2) When a WhatsApp story counts as finished:** 10 quiet minutes, or a "done" word such as «خلاص».
15. **(9.2) Call-back requests:** who returns them, from which number (`callback_from_number`, default the foundation's
    phone) and how fast (`callback_eta_days`, default 1 day). The site now promises both, plus "if you don't answer we'll
    call again".
16. **(9.2) Tile order on the home page** is a hypothesis; review it after 3 months of `form_answers.topic` / `entry`
    data.
17. **(9.2) Outside referral bodies:** none are shipped, and no phone numbers are invented; the foundation supplies its
    own list.
18. **(9.2) Daily cap of automatic Claude runs per story** (default 6).
19. **(9.2) A recorded human voice greeting** instead of the phone's synthetic voice for «اسمعي» (not in 9.2).
20. **(9.2) Release gate for the tile home page:** a picture-recognition test (ISO 9186 style) with printed tile cards
    and at least 8 beneficiaries; every tile must reach 66% correct recognition or be redrawn before production switches
    to the tile home. Moderated usability tests (U1–U10) with 5–8 beneficiaries before launch.
21. **(9.2) Consent by action:** the foundation's legal adviser confirms that the line above the send button
    («لما تضغطي "ابعتي طلبك"، بتوافقي…», also read aloud) is sufficient consent under Law 151/2020; if not, the checkbox
    returns (`consent_v` 2).
22. **(9.2) Privacy wording:** before turning on the welcome list or the acknowledgement, privacy policy §7 («كل رد
    يصلك يراجعه شخص مختص ويعتمده قبل إرساله») must add "except fixed automatic messages such as the confirmation that
    your request arrived".
23. **(9.2) Unreachable requests:** the minimum number of failed call attempts before closing a request as
    «تعذّر الوصول إليها» (default 3 attempts on at least 2 different days).

---

## 12. How it was built (history)

- **Version 1:** the core platform — unified intake, inbox, files, lawyer network with grants, lawyer portal, review
  and approval, client answers, court cases, accounting, automations, knowledge base, marketing analytics, client portal,
  WhatsApp simulation, AI analysis — all in Arabic.
- **Review round:** an independent multi-agent review found 50 issues (3 serious privacy holes, plus business logic and
  Arabic language issues); all were fixed with regression tests.
- **Version 9.0:** the seven modules in section 5, built in parallel, each adversarially reviewed, then integrated and
  verified with a full launch rehearsal, a security review and an Arabic UX review (37 further findings, all fixed).
- **Version 9.1:** a usability release (section 6). Two specs with audits were written first — one for beneficiaries,
  one for lawyers — each with usability tasks to test against. Six lanes built them in parallel (b-forms, b-portal,
  b-site, l-home, l-work, l-court), each followed by a code review and a browser usability run at phone widths; a final
  integration and security pass fixed the remaining findings (for example: the WhatsApp confirmation can never hand
  the holder of a website-request link the phone owner's data, links are built only from `PUBLIC_BASE_URL`, the `portal_update` template text is
  gender-neutral, and the knowledge anonymiser also removes children's names) before the version became 9.1.0.
