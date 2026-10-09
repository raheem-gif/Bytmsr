# Beyoot Misr Legal Support Platform — Complete Brief (version 10.0, pre-launch)

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
   number on WhatsApp to confirm her number. Since 9.2 the website opens straight onto 8 picture tiles: one tap on her
   problem, one or two picture questions, then her story (voice first) and her number (the name is optional, governorate
   and relation are asked after sending, and consent is a line on the send button instead of a checkbox) — or
   «إحنا نكلمك» (just the number, and the foundation calls her). On WhatsApp her consecutive messages are collected into one story until it is
   finished. Each channel is just a "door" into one unified
   **Intake Engine**: the same person and the same story are recognised across channels; the source (e.g. a Facebook ad,
   Google, a referral partner) is tracked separately from the channel.
2. **It lands in the unified inbox** («صندوق الوارد الموحد») as a request with a code like `REQ-2026-00024`.
   The AI assistant summarises it, classifies the legal area, lists missing information/documents, suggests the legal
   issues, and warns "this resembles N past cases". A priority score is suggested from the beneficiary's situation.
   Since 9.2 the summary is made once per finished story and comes with **one recommended track** (consultation, court
   matter, staff answers, refer elsewhere, or ask her first) and a ready draft; inbox triage cards show which stories
   are ready, which wait for a typed voice note, and which asked for a call.
3. **Staff triage** it (since 9.2 usually one click: «اعمله طلب» opens a prefilled sheet for the recommended track,
   which staff edit and confirm; call-back requests are handled by phone with «سجّل المكالمة»): reply (with
   ready-made replies or AI-suggested replies), handle it internally if it is simple,
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

## الإصدار 10.0 — Version 10.0: Apple-style design, royal green and gold, «Emam Legal and Consultancy», and company accounts

The user asked for two things: (1) apply an Apple-style design skill with the colours **royal green** and **gold**, and
name the website **«Emam Legal and Consultancy»** — only in the user experience, not everywhere; (2) a second kind of
account for **companies**, for which the firm acts as their outsourced in-house counsel ("Virtual In-House Counsel as a
Service"): a company legal portal where they submit legal requests and follow them, backed by the same lawyer network,
AI, knowledge and workflow engine as the beneficiary service.

### Design system, colours and the brand name
<!-- v10:experience -->
**Brand = settings, one accessor, user experience only.** `brand_name` («Emam Legal and Consultancy», ≤ 60) and
`brand_short_name` («Emam Legal», ≤ 24) live in `<settings:site>`; `brand_in_staff_app` (default on) decides whether the
`/app` chrome shows them. Server code reads them only through `app.brand.displayName()` / `shortName()` /
`wordmarkParts()` / `staffChromeName()` (`src/brand.js`); names are validated with `isPlainName()` (no `\p{Cc}\p{Cf}`,
no `<>`), which the company lane reuses for company, entity and user names. `/api/meta.brand = {name, short,
staff_chrome:{name, short}}`; `fmt.orgName()` returns the brand first, so every client-facing `{org_name}` fill (quick
replies, automation previews, call script, OTP, portal texts) carries it. HTML isolates the Latin name in `<bdi dir="ltr"
lang="en">`; WhatsApp texts never carry isolate characters — a signature line «— Emam…» gets a leading U+200F in
`engine.fillClientText()` so it stays right-aligned. Where it shows: public header/footer lockup (stacked, system font),
public `<title>` «… — Emam Legal and Consultancy», share tags, JSON-LD `WebSite`/`LegalService`, `/p/…` and `/portal`,
the PWA names (`/manifest.webmanifest`, `/company.webmanifest`, served dynamically with ETag), the offline page, and the
`/app` login, sidebar wordmark and tab title «… — Emam Legal». Never: the legal entity (© line, privacy, terms,
`Organization.name`, printed letterheads) stays on `org_legal_name`, and staff/lawyer body copy is unchanged. Turning
`brand_in_staff_app` off restores the exact 9.2 names in `/app` only (J6). TOTP issuer for new enrolments: «Emam Legal».

**Colours.** Defaults `#0b5a3c` / `#c9a14a` through the unchanged generator: the X10-C1 scale verbatim, 0 adjustments,
29/29 contrast pairs; `LEGACY` now holds that scale, so a fresh install has no `bm-theme` block and a saved custom colour
still wins. Category badges are outlined and status badges filled; scrims use `--scrim` (brand p900 at 48 %); the
«إحنا نكلمك» tile is gold. Gold is never body text (gold text = `--accent-700`); the audit found gold only on icons,
stars and list markers. One mark everywhere: the scales glyph (favicon.svg/ico, 192/512/maskable/apple-touch PNGs,
og-image 1200×630, 233 KB, rendered once with Playwright from `scratchpad/v10-pw-experience/icons-render.mjs`).

**Shared kit (frozen API, used by the company lanes).** `lib/spring.js` (closed-form springs with Apple's
damping/response, `project()`, `rubberband()`, reduced motion forces damping 1), `lib/sheet-motion.js`
(`attachSheet({panel, scrim, handles, canDismiss, onDismissed})` → `{enter, exit(reason,{velocity, interruptible}),
destroy}`: 1:1 finger tracking with a 6 px slop, rubber band upward, flick ≥ 800 px/s dismisses, reversal ≤ −150 px/s
stays, otherwise `y + project(v) > H/2`; a finger that rested > 100 ms before lifting carries no momentum; a grab
freezes any running motion), `lib/haptics.js` (`haptic('commit'|'success'|'warning'|'error')`, silent no-op without
`navigator.vibrate`). `lib/ui.js` adds `wordmark()`, `brandEl()`, `stepTracker()` (0-based `current`, `waiting`
state), `kRow()` (`<a>`/`<button>`/`<div>`), `confirmDiscard()`/`discardGuard()`, 14 icons, and `v10-experience.css`
(tokens `--press-*`, `--ease-*`, `--dur-*`, `--mat-chrome`, `--t-*`; `.k-chrome`, `.k-tabbar`, `.k-row`, `.k-list`,
`.step-tracker`, `.wordmark*`, `.num`, the ready `.k-solid-chrome` fallback; no colour literals).

**Motion semantics.** `ui.modal()` keeps its signature. Phone sheets (≤ 640 px) use `attachSheet` (grip 44 px + header
are the handles, `touch-action:none`); desktop dialogs materialise from their trigger (`scale(.94→1)` + opacity, origin
= the trigger's centre) and return to it. The dimming is its own layer (`.modal-scrim`, `.bp-sheet-scrim`).
**Programmatic closes** (`handle.close()`, action buttons, form submit, `closeAllModals()`) run the logical close at once
(focus, `inert`, `onClose`, scroll-lock counter) while the leaving node is `inert`, `aria-hidden`, `.is-leaving`
(`pointer-events:none`); **user dismissals** (✕, Escape, backdrop, swipe) run `beforeClose` (may be async) and are
interruptible: a grab during the exit cancels it. Toasts enter and leave along their anchored edge (top for staff,
bottom for the lawyer phone shell and the portal) and are removed on `transitionend`. `ui.form()` validates on blur once
a field holds a value and re-checks on input while an error shows; the intake phone field does the same. The
beneficiary sheet (`portal-ui.js`) opens instantly as in 9.1 and, on the first idle moment after paint, imports
`sheet-motion.js` + `haptics.js` dynamically (never with `saveData` or a `2g`/`slow-2g` connection, CS-32), so the
`/p/` static closure stays `h.js, portal-ui.js, portal.js, words.js`; while it is open the page behind it is `inert`
(aria-modal alone is not honoured by older Safari).

**Press, materials, type, accessibility.** Press feedback starts on pointer-down (`:active` scale .97, dim-only for
full-width rows; one passive `touchstart` listener per surface so iOS applies `:active`): `/app` and company selectors
in `v10-experience.css`, the home tiles in the critical CSS (their transitions in the non-critical part), the rest of the
public site, `/intake` (`v91-b-forms.css`) and the portal (`v91-portal.css`). Frosted chrome (`--mat-chrome` + `saturate
blur(20px)`) on the public header, `/app` topbar, lawyer bottom bar and portal bar, with an opaque `@supports` fallback;
the header edge appears only after scrolling (`animation-timeline: scroll()`, non-critical). **With custom colours
(a `#bm-theme` block) every chrome bar is solid white** (`html:has(#bm-theme) …`): the generator guarantees p700 on white
(4.5:1), not on translucent chrome over dark content — a hostile but contract-valid pair fell to 3.9:1 there; the royal
green default keeps 5.97:1 worst case and stays frosted. For the same reason the gold second line of the `/app` login
lockup (a300 on p700: 4.6:1 by default, down to 3.3:1 for custom colours) turns white with custom colours. Reduced motion keeps
opacity/colour cross-fades at 150 ms and snaps transforms (9.2's «kill everything» rule replaced in `app.css` and in the
non-critical public CSS); reduced transparency and more contrast make the chrome opaque; forced colours add borders.
Inputs are 16 px on touch; `.sidebar-version` has no letter-spacing; counters, codes and amounts use tabular numbers.
Haptics only on real commits: intake send success/error (`haptics.js` loaded after the first screen, so a cold
`/intake` still needs ≤ 6 new files), portal reply/RSVP/«موافقة», hearing outcome saved, «اعمله طلب», lawyer task «تم»
and opinion submitted.

**Budgets (measured).** Critical CSS 12,183 B of 12,288 (EXP-8 fallback steps 1–2 applied: both tile press transitions
moved out of the critical block); `/` 10.8 KB br; landing closure 3.1 KB br; `/intake` closure 29.3 KB br; `/p/`
closure 27.8 KB gzip with the same 4 files; `spring.js` ≤ 1 KB br, `sheet-motion.js` ≤ 1.8 KB br, `haptics.js` ≤ 0.3 KB
br, `v10-experience.css` ≤ 4 KB br; no motion module in the `/` or `/intake` static closures.

**Verification (Playwright, `scratchpad/v10-pw-experience/`).** V1 press: first changed frame 14–17 ms, scale 0.97
within 100 ms, back within 200 ms, a 30 px drag cancels the click (headless Chromium never sets `:active` from CDP touch
events, so the press itself is a pointer press). V2 sheets (lawyer logout sheet, a `beforeClose` sheet, the portal
call-back sheet after the idle import): 0.00 px tracking error, rubber band on the formula, flick dismissed in ~305 ms,
reversal stays, slow drag past half dismisses, grabs during enter and ✕-exit freeze, `beforeClose → false` springs back.
V3 reduced motion: no transform on any frame. V4/V5: opaque chrome, `currentColor` badge outline. V6 contrast walk on
`/`, `/intake`, `/p/`, `/app#/inbox`, `/app#/my`: 0 failures and 0 regressions against a 9.2 baseline server. V7 slow 3G
(2000 ms RTT, 50 KB/s, 4× CPU): tiles visible in ~2.4 s at 390×844 and 360×640, zero tile shift. V8 haptics: exactly
one `success` per intake send, 0 on typing/scrolling/sheets, 0 console errors without the API. V9: the lockup never
wraps, the RLM signature renders right-aligned, 200 % zoom at 360 px has no horizontal scroll on `/`, `/intake`, `/p/`,
`/app#/my`. V10 (4× CPU): `/privacy` scroll, an `/app` sheet drag and an `/app#/inbox` touch scroll at 390: p95
16.7–16.8 ms (a mouse-wheel run with the pointer resting over the cards measures 33 ms on 9.2 and 10.0 alike — `:hover`
restyle, which a phone never does). Review step: the V6 walk repeated with two hostile custom pairs on both servers
(0 regressions), keyboard/screen-reader checks of the three sheet kinds (role, labelled title, named ✕, hidden grip,
inert background, Tab trapped, Escape closes, focus returns), tap targets at 360/390 (no new target < 44 px), J6.
<!-- /v10:experience -->

### Company accounts, requests, legal memory, SLA and e-mail (server)
<!-- v10:b2b-server -->
**Architecture.** A third principal next to staff/lawyers and beneficiaries: `company_users` (never `users`), session
cookie `bm_csid` scoped to `Path=/api/company` (HttpOnly, SameSite=Strict, idle 12 h / max 72 h; "remember this
device" is P1 and not shipped in 10.0 — its two settings exist but nothing reads them), lockout per (account, IP) with the staff policy (5 → 15 min doubling to 4 h; CS-3), TOTP + recovery codes
encrypted with `.secret-key`. `src/company-auth.js` is the only door: every `/api/company/*` handler except the nine
auth/meta routes runs `companyAuth.require(ctx, {roles, write})`, takes `company_id` from the session, never reads
`ctx.user`, and a company cookie alone gets 401 on every `/api/admin|lawyer|account|notifications|documents|print`
route (route scan in both directions). Reads of requests, memory and counterparties go only through
`visibleRequestSql(cu)`, `readableMemorySql(cu)`, `visibleCounterpartySql(cu)` (L-51) and downloads through the L-52
rule; a foreign or invisible id is 404 with the body of "does not exist". Company actions are written with
`companyActor()`/`SYSTEM_ACTOR` — no company id ever lands in a staff FK column (L-19, runtime test with a lawyer whose
`users.id` equals a company user id). Services: `companies.js` (companies, entities, users, plans, subscriptions, team,
lifecycle, overview, B2B settings), `company-requests.js` (staged uploads, 12 request types, submit/list/search,
triage, accept → shadow-client case + assignments, clarifications, quotes, deliverables + doc gate, close/reopen/
auto-close, SLA engine on `company-sla.js`), `company-billing.js` (quota per usage cycle, overage, charges, CSV — no
invoices), `company-memory.js` (memory items, counterparties, reminders, purge), `company-notify.js` (portal
notifications, `b2b.cleanup`), `email.js` (outbox + hardened SMTP), `company-doc-gate.js` (lawyer names in text and in
Word/PDF author metadata). One voice both ways: every staff text that reaches the company after acceptance
(messages, deliverables, clarifications incl. an approved lawyer info request, due-date reason, close note, decline reason,
deliverable withdrawal reason, the acceptance note) is refused with 409 `lawyer_names` when it names a lawyer of the case;
every string a lawyer sees on a company case — brief, issues, shared replies, document titles, the case title and the
per-assignment brief (stored redacted at acceptance, on generic assignment and on title edits, and redacted again when
read) — passes the company-user redactor (names, e-mails, phones, request codes). Schema `schema.d/80`–`85` is additive and idempotent (G-4 rehearsed in the suite on a real
9.2 demo database: two starts, `foreign_key_check` empty, saved TOTP issuer kept, no message or AI call caused).

**B2C guards.** The company's shadow client and company cases are invisible to B2C paths: client lists/search/export,
portal tokens, identities, merge, intake link, beneficiary card (404), WhatsApp (automated sends skipped and logged
once; interactive 409 `company_client`), client answers/case messages/document sends/programme links/invoices (409
`company_case_use_*`), automations (hearing/invoice/document reminders, surveys) and every aggregate in analytics,
practice impact and accounting (guards #1–#30; paid company work is always `payable`, never CSR or pro bono). INV-B7 is
a byte-identical snapshot test of impact, funnel, areas, spend, dashboard (incl. `month`), clients, intakes, SLA, the
accounting summary (CSR usage, `pro_bono_events`, closed-case costs) and `cases?line=b2c` before and after adding a
third company with accepted work.

**Company API (`/api/company/*`, cookie `bm_csid`; A = portal admin, W = admin or member, R = any role incl. viewer).**

| Area | Endpoints |
|---|---|
| Public | `GET meta` (ETag; `email_enabled`, `terms_url`, limits, hours text) · `POST auth/login`, `auth/login/2fa`, `auth/logout` · `GET auth/session` · `POST auth/link` (inspect invite/reset), `auth/invite/accept`, `auth/forgot` (same answer always), `auth/reset` |
| Me (R) | `GET/PATCH me` · `POST me/password` · `POST me/2fa/setup|enable|disable|recovery-codes` · `GET me/sessions` · `POST me/sessions/revoke-others` · `DELETE me/sessions/:sid` |
| Home (R) | `GET home`, `plan` (prices to A/billing contacts only), `usage`, `colleagues`, `search?q=` (requests + memory + documents, Arabic-normalised), `GET charges` (A or billing contact) |
| Requests | `POST uploads` (W; one file, 12 MB, 4 in flight) · `GET requests?state=&q=&cursor=` (R) · `POST requests` (W; `client_ref` replay-safe) · `GET requests/:code` (R) · `POST requests/:code/messages`, `/documents` (W) · `POST requests/:code/clarifications/:messageId/reply` (W) · `POST requests/:code/cancel`, `/escalate` (W) · `PUT requests/:code/watchers` (W) · `POST requests/:code/quotes/:number/approve|reject` (A) · `POST requests/:code/deliverables/:id/accept|request-changes` (W) · `GET documents/:id/download` (R, L-52) |
| Memory | `GET memory?kind=&status=&q=&due_within_days=` (R) · `GET memory/:id` (R) · `POST memory` (A any kind; member contract/template/licence/key_date; 100/day) · `PATCH memory/:id` (A, member own) · `POST memory/:id/documents {upload_ids}` (≤ 5 per call, ≤ 10 per item) · `POST memory/:id/archive` · `GET key-dates?from=&to=&kind=` · `GET counterparties?q=` |
| Company | `GET/POST entities`, `PATCH entities/:id` (A) · `GET/PATCH profile` (A) · `GET team`, `POST team/invite`, `PATCH team/:uid`, `POST team/:uid/invite|reset-link|sessions/revoke` (A; 20 invites+links/day) · `GET notifications`, `POST notifications/read-all`, `POST notifications/:id/read` (R) |

**Staff API (`/api/admin/*`; S = admin or case manager, A = admin only, L-60).** Companies: `GET companies` S,
`GET companies/prefix-check` A, `POST companies` A, `GET companies/:id` S, `PATCH companies/:id` A,
`POST companies/:id/status` A, `GET companies/:id/usage` S (counts; the overage price for A only), `POST companies/:id/entities` S,
`PATCH company-entities/:id` S, `GET|POST companies/:id/users` S, `PATCH company-users/:uid` S (e-mail change and
promotion to portal admin: A), `POST company-users/:uid/invite` S, `POST company-users/:uid/reset-link|2fa/reset|unlock|
sessions/revoke` A, `GET company-plans` S (terms without prices for a case manager), `POST company-plans`, `PATCH company-plans/:id`, `PUT companies/:id/subscription`
A, `GET|PUT companies/:id/team` S, `GET companies/:id/charges` S, `POST companies/:id/charges`, `POST company-charges/:id/void`,
`POST company-charges.csv` (one-time download) A. Requests: `GET company-requests` S, `GET|PATCH company-requests/:id` S,
`GET|POST company-requests/:id/triage` S, `POST …/accept|clarify|messages|decline|close|reopen|escalation/ack` S,
`GET …/suggest-lawyers` S, `PUT …/memory-links` S, `POST …/memory` S, `POST …/quote` A, `POST company-quotes/:id/withdraw` A,
`POST …/deliverables`, `POST …/deliverables/prefill`, `POST …/ai/deliverable` S, `PATCH company-deliverables/:id`,
`GET company-deliverables/:id/precheck`, `POST company-deliverables/:id/release` S, `POST company-deliverables/:id/withdraw` A,
`PUT assignments/:id/memory-grants` S. Memory: `GET|POST companies/:id/memory` S, `GET|PATCH company-memory/:mid` S,
`POST company-memory/:mid/documents|archive` S, `DELETE company-memory/:mid?purge=1` A, `GET|POST companies/:id/counterparties` S,
`PATCH company-counterparties/:cid` S. Operations: `GET b2b/overview` S (`mrr_minor` A only), `GET email-outbox` A,
`GET|PUT b2b/settings` A, plus `PUT integrations/email` and `POST integrations/email/test` A. Lawyers:
`POST /api/lawyer/assignments/:id/work-files`, `DELETE /api/lawyer/work-files/:docId` (company cases only, never visible
to the company); granted memory documents download through `/api/documents/:id/download` until 7 days after the case closes.

**Jobs.** `b2b.triage` 5 min (≤ 3 automatic runs per request per 24 h, from `ai_usage`), `b2b.sla` 5 min (at risk /
late once per phase+state+due in `company_request_alerts`; late also e-mails the case manager, account manager and
admins with code + company only), `b2b.reminders` 60 min (clarification/quote reminders after `b2b_reminder_after_hours`
business hours, ≤ `b2b_max_reminders`; expired quotes; auto-close; trial ending in ≤ 3 days once, trial end → read-only,
manual subscription past `ends_on` → ended), `b2b.memory` daily after 08:00 Cairo (day read from `job_runs`; one
transaction per item; every due offset recorded in `company_memory_reminders`, only the newest sent, at most one
notification per item per run; auto-renew rolls with compare-and-swap on `end_date`; licences/people expire; key dates
recur), `b2b.cleanup` 15 min (expired staged uploads + files, read notifications, outbox), `email.flush` 1 min with SMTP
(≤ 50 messages, 20 s budget, one connection + RSET, back-off 1/10/60 min, stale `sending` rows recovered at start-up).

**E-mail.** Provider `outbox` (default; nothing leaves) or `smtp` (`INTEGRATION_SPEC.email`: host, port 25/465/587/2525,
`starttls`|`tls`, user, password (encrypted), from address, from name; env `EMAIL_PROVIDER`, `EMAIL_FROM`,
`EMAIL_FROM_NAME`). Zero-dependency client on `node:net`/`node:tls`: STARTTLS mandatory (refused before AUTH),
`rejectUnauthorized` + TLS ≥ 1.2, RFC 2047 subject/from name, base64 UTF-8 body, address-only `To:`, CR/LF/NUL refused
in every header input. Secret links live in memory only (`{link}` placeholder stored; lost on restart → `failed`), and
bodies carry an event line, the request code and a portal link — never a request title, counterparty or legal text.
Without `PUBLIC_BASE_URL` rows are `skipped` and `meta.email_enabled` is false. Readiness (System page) turns red for
e-mail, `PUBLIC_BASE_URL` and the contracting entity once a non-ended company exists.

**Settings (`PUT /api/admin/b2b/settings`, A, validated and audited as `company.settings_updated`).** `b2b_enabled`,
`b2b_business_hours` (null = office hours), `b2b_holidays`, `b2b_urgent_hours`, `b2b_auto_close_days` 7,
`b2b_revision_window_days` 30, `b2b_reminder_after_hours` 16, `b2b_max_reminders` 2, `b2b_quote_valid_days` 14,
`b2b_trial_days` 14, `b2b_ended_readonly_days` 90, `b2b_memory_remind_days`, `b2b_terms_url` (https), `b2b_storage_mb`
2048, `b2b_files_per_day` 200, `b2b_outbox_retention_days` 90, `b2b_notifications_retention_days` 180,
`company_session_idle_hours` 12, `company_session_max_hours` 72, `company_remember_days` 14/`_2fa` 30 (reserved for P1),
`company_invite_valid_hours` 72, `company_reset_valid_minutes` 60, `company_email_max_per_hour` 20.

**Demo.** Stage 1: plans Starter/Growth/Enterprise, Nile Foods (Growth, active; mariam admin + billing contact,
hossam member, dina viewer) and TechSol (Starter trial ending in 10 days; sherif admin, omar member), password
`Company@2026`. Stage 2: NFD-0001 contract review closed with rating 5 and the Delta contract confirmed in memory
(notice in 25 days) + a recorded position; NFD-0002 private employment request in progress after a signed
clarification reply; NFD-0003 urgent legal notice in final review; NFD-0004 awaiting the company; NFD-0005 dispute
with a fixed 45,000 EGP quote; NFD-0006 new and triaged; TSL-0001 delivered, TSL-0002 in progress, TSL-0003
auto-closed; an overage charge in the previous cycle; lawyers tarek/yasmine/amr with Latin names, skills and B2B rates.

**Tests.** `test/v10-b2b-server.test.js` (auth, requests, memory, AI context, knowledge, billing, e-mail against
in-process fake TLS/STARTTLS servers, jobs, the journey, §7.3 items 3–17, G-4), `test/v10-b2b-server-isolation.test.js`
(route scan, cross- and intra-tenant matrices on the demo, lawyer memory-grant expiry, shadow-client guards, CS-8
automations, INV-B7 snapshot), `test/v10-b2b-server-sla.test.js` (calendars, business-time arithmetic, DST, pauses,
preview parity incl. real submits at Thursday 15:59/16:01 and a holiday eve, usage cycles) — 140 tests.
<!-- /v10:b2b-server -->

### The Company Legal Portal `/company`
<!-- v10:b2b-portal -->
**Front door.** `/company` serves `public/company.html` (platform CSP, no inline script, `noindex`, manifest
`/company.webmanifest`, no service worker). `company/main.js` boots: storage hygiene, plural error copy
(`setErrorCopy`), `GET /api/company/meta` ∥ `GET /api/company/auth/session` (and `/home` fired from `company/early.js`),
then sign-in screens (`pages/login.js`, `pages/link.js`), the restricted gate (`pages/gate.js`) or the routed shell
(`company/shell.js`: `.k-chrome`, phone `.k-tabbar`, light desktop side nav, bell, user menu, one-search box, the single
gold «طلب جديد» control). Routes (`company/routes.js`, U10-08 minus billing/activity) lazy-load page modules; build-2
pages also load `v10-company-pages.css` and show page-shaped skeletons (slow notice after 10 s). Unknown hashes end on
catch-all routes that render the same U10-82 screen as a forbidden one («لا يمكن عرض هذه الصفحة.»).

**What a company sees — one voice.** Everything the firm writes is authored by «فريقكم القانوني»; the only firm person
ever named is the account manager («مدير علاقتكم لدينا: …»). Company copy is MSA, plural, verbal-noun buttons, in
`company/words.js` (entry), `words-flows.js` and `words-pages.js` (lazy); e-mail promises are wrapped `⟦…⟧` and dropped
when `meta.email_enabled` is false.

| Screen | Module | Highlights |
|---|---|---|
| «المتابعة» | `pages/overview.js` | attention rows (alert/clock icons), open requests, plan meter, upcoming dates, quick tiles, setup/intro cards; first-login admins are sent once to `#/welcome` |
| «الطلبات» | `pages/requests.js` | state segments, member scope, search across all states, type filter in the hash, `before=<code>` paging |
| «طلب جديد» | `pages/new-request.js` | 12 types, staged uploads (`coUploader`), draft in `ek.co.draft:{userId}`, promise recomputed with the server's `company-sla.js`, quota/urgent lines, `client_ref` |
| Request `#/requests/<CODE>` | `pages/request.js` | promise box (first response / confirm phase / paused / late + escalate), five-step tracker from `stage`, **one action card** (clarification with per-item «إرفاق»/«غير متوفر لدينا»; quote with confirmation sheet + `haptic('commit')`, capped wording; deliverable with «اعتماد التسليم» ★1–5, pre-checked «حفظ العقد في الذاكرة القانونية», admin «تسجيل قرار الإدارة», or «طلب تعديلات» with the rounds left), versions, thread with optimistic send/retry (Ctrl/⌘+Enter, text kept across session expiry), details, documents (doc-viewer with the company `urlFor`), memory refs, escalation/watchers/cancel/copy-link menu |
| «الذاكرة القانونية» | `pages/memory*.js`, `calendar.js`, `entities.js`, `counterparties.js` | hub with counts and the 60-day strip, per-kind lists (contracts: chips, entity/counterparty/renewal filters, one badge by priority), item page (dates timeline, documents, linked requests, provenance, request shortcuts `?from=<id>`), add/edit with `coMemoryForm`, agenda calendar, entities (admin add/edit), counterparties |
| Account pages | `team.js`, `plan.js`, `company.js`, `notifications.js`, `account.js`, `more.js`, `welcome.js` | team (invite with copy-once link only when not e-mailed, `pending_review`, colleague reset by e-mail only / `ask_team`, roles, deactivate, company-wide 2FA), plan & usage (next period start, urgent per cycle, excluded work, contracting entity, SLA table, usage per cycle, approved extra costs for admins/billing), company profile, notifications, my account (2FA via `twoFactorWizard({ base: '/company/me' })`, devices) |

Every sheet with a text field goes through `company/page-kit.js textSheet()` → `beforeClose: discardGuard(dirty)`
(«تجاهل ما كتبتموه؟»). Browser storage holds only `ek.co.draft:`, `ek.co.return`, `ek.co.setup:`, `ek.co.intro:`,
`ek.co.view:` keys (L-47). Budgets as served: entry closure 59,437 B br (≤ 60 KB), entry CSS 23,084 B br (≤ 25 KB).
V10 (50 rows on `#/requests`, 4× CPU): scroll-frame p95 16.7 ms at 390.

**Roles.** «مدير البوابة» (`company_admin`) · «عضو» (`member`) · «اطلاع فقط» (`viewer`) · billing-contact flag. Write
controls follow the server's `request.can.*` / `memory.can.*`; role-forbidden routes show «هذه الصفحة لمديري البوابة في
شركتكم.», read-only companies keep downloads and explain the gold control in a sheet.

**Demo — what to try** (password `Company@2026`, `/company`): `mariam@nilefoods.example` — answer NFD-0004's
clarification (attach to item 1, mark item 2 unavailable → confirm phase), approve NFD-0005's quote (sheet), search
«الدلتا» and open the Delta file, open «الذاكرة القانونية» → «العقود» (notice badge) → «متابعة التجديد أو الإنهاء», invite
a colleague; `sherif@techsol.example` — accept TSL-0001 with ★★★★★ (saves the MSA to memory) or request changes;
`hossam@nilefoods.example` (member) sees who approves quotes and never NFD-0002; `dina@nilefoods.example` (viewer) reads
only. Tests: `test/v10-b2b-portal.test.js` (45). Playwright: `scratchpad/v10-pw-portal/` (build-1 `verify.mjs`, build-2
`b2-tasks.mjs`, `b2-sweep.mjs`; review `rv/tasks.mjs`, `rv/fixes.mjs`, `rv/clock/t3clock.mjs`).

**Typing is never lost (U10-81, L-64).** The automatic refresh (back to the tab after a minute, or back online) skips
the page while a sheet is open, a form route is shown (`keep: true` in `routes.js`: new request, memory add/edit,
account, welcome), a text field has focus, a textarea holds text or a file is staged (`state.js typingInProgress`). A
message refused with 401 returns to the composer after sign-in. Row menus («⋯») are placed in viewport coordinates so a
scrolling table never clips them; the plan page's SLA and extra-costs tables stack into cards on phones.
<!-- /v10:b2b-portal -->

### The company desk in `/app` and what lawyers see
<!-- v10:b2b-staff -->
**Navigation.** `shell.js navGroups()` adds the staff group «خدمة الشركات» right after «التشغيل اليومي» (admins and
case managers only): «طلبات الشركات» (`inboxStack`, badge = `GET /api/admin/b2b/overview .badge`, polled with the
notifications poll as a background request) and «الشركات العميلة» (`building`). Routes (`app/routes.js`, roles
`STAFF`): `/company-requests` «طلبات الشركات», `/company-requests/:id` «طلب شركة», `/companies` «الشركات العميلة»,
`/companies/:id` «شركة عميلة». `notif.js` maps every `company_request.*`, `company.*` and `email.failed` type to an icon
(escalation, SLA late and plan error → `alert`/danger; at risk → `clock`/warning; renewal → `calendarClock`). All
desk CSS is `public/assets/css/v10-desk.css` (tokens only, linked after `v10-experience.css`).

**Queue and request page (STF-1…6).** `pages/admin/company-requests.js` groups cards escalated → late → plan error →
at risk → new → needs the team → working → awaiting the company → closed, one primary action per card (`primaryActionOf`,
quotes are admin-only), list mode remembered in `localStorage bm.coq.view`, SLA chip with tabular numbers and the phase.
`pages/admin/company-request.js`: handler select (PATCH with `rev`), «المواعيد» with the company-facing promise sentence,
flag banners (`plan_error` → accept sheet prefilled from the saved plan; `memory_pending` → the shared memory sheet),
triage card + plan check, request as submitted (`coRequestFields`), submitter (staff only), conversation with the doc
gate's 409s inline, work section (case link, team, memory grants without `person` items), deliverables, quotes and
charges (A), activity. Sheets in `components/`: `company-accept-sheet.js` (every U10-S12 409 handled in place, server
redaction `warnings[]`, live employee-name detection, `haptic('success')`), `company-clarify-sheet.js`,
`company-quote-sheet.js` (fixed/capped only, start plan), `company-deliverable-sheet.js` (deterministic prefill, live
precheck debounced 600 ms incl. file-author lines, Office/PDF checkbox, send disabled until every gate passes),
`company-memory-grants.js`. Every sheet with text passes `beforeClose: discardGuard(…, {singular:true})` (L-64), and
every "as the company sees it" preview renders with the portal's own `lib/company-ui.js` (`coClarificationCard`,
`coQuoteCard`, `coDeliverableCard`, `promiseText`).

**Companies (STF-7/8).** `pages/admin/companies.js` lists companies sorted by health (late → at risk → awaiting) with
the «مدير العلاقة» column; «إضافة شركة» (A) has a live prefix check (`GET /api/admin/companies/prefix-check`, KR and
system codes reserved, preview «أول طلب: XXX-0001»), plan or custom terms through `components/company-plan-terms.js`
(`termsEditor`: included requests, **urgent requests per cycle**, users/entities, overage policy, SLA grid per
priority, size factors, second review, revision rounds — no hourly rate; minor units on the wire), the account manager
select of active admins/case managers, and the first portal admin; the result view shows name conflicts and the invite
(or the copy-once link when e-mail is not configured). `pages/admin/company-detail.js` tabs: overview (status change A,
usage meter via `coUsageMeter`, SLA health, open requests, renewals, account manager + internal notes A), requests,
users (invite, edit; **e-mail change and promotion to «مدير البوابة» are admin-only and render disabled with «للمدير
فقط» for case managers**, e-mail change confirmation «سيُرسل إشعار أمني إلى البريد القديم ويُسجَّل خروج المستخدم من
كل الأجهزة.»; security actions A), entities & counterparties (override beyond the plan A with a reason), plan & costs
(A: subscription change with the terms editor, charges add/void/replace-lower, CSV export through the one-time
download link), legal memory (`openMemoryItem`/`createMemoryItem` reuse the portal's `coMemoryForm` with
`staff: true`, internal notes, «حفظ وتأكيد» for items under review — also used from the request page for
`memory_pending` — archive, purge A with typed-name confirmation and the backups sentence), preferred team, log (A,
security events matching the company).

**Settings and e-mail (STF-9).** `components/company-b2b-settings.js`: «خدمة الشركات» (`#/settings?section=b2b`; terms
URL, business hours inherit/override, urgent hours, holidays, follow-up timings, memory reminders, storage, sessions,
retention → `PUT /api/admin/b2b/settings`) and «باقات الشركات» (`section=plans`). `components/email-settings.js`:
the integrations card «البريد الإلكتروني» (outbox or SMTP with host, port 25/465/587/2525, STARTTLS/TLS, user,
password, sender; «إرسال رسالة تجربة إلى بريدي»; red note when companies exist and the provider is the outbox) and the
automations tab «صادر البريد» (read-only, no bodies).

**Engine pages (STF-10).** `case-detail.js`: a company case shows the banner «ملف عمل لطلب شركة — {company} · {code}»
with «فتح طلب الشركة»; no «رسالة للمستفيد/ة», WhatsApp composer, beneficiary card, programme field, client-answer
composer, send-document button, or generic «إغلاق الملف»/«إعادة فتح الملف» (L-65) — opinion review stays.
`client-detail.js`: a shadow client renders one line and «فتح صفحة الشركة». `cases.js`: «شركة» badge and the
«الأفراد · الشركات» filter (`line=b2c|b2b`). `dashboard.js`: the «خدمة الشركات» strip (hidden without companies; MRR
for admins only; no overdue invoices).

**Lawyers (STF-11).** `words.js actionCopy` adds a «شركة» chip and the company name after the case code; a reviewer on
a company case reads «مراجعة نهائية: …» with «راجِع». `assignments.js`: chip and the «طلبات الشركات» filter.
`assignment.js`: «سياق الشركة» first in «الملف» (reads only the §4.7 keys; granted memory items show only
`lawyer_fields`), company privacy line, «سُئلت الشركة في {date}», the request sheet's copy switched to the company
(scoped text substitution — `request-sheet.js` is not a v10 file), and «ملفات العمل» (≤ 5, with the author-name
warning). `write.js`: company skeleton «الخلاصة التنفيذية · المخاطر الرئيسية ودرجتها · التوصيات · التحليل القانوني»
(+ «التعديلات المقترحة على البنود» for contract types — the deterministic prefill reads «الخلاصة التنفيذية»), steps
labelled «خطوات للشركة», the hint «تصيغ الإدارة التسليم النهائي للشركة…», «سياق الشركة» in the writing reference, and
no AI draft entry on company assignments (L-29). `lawyer-detail.js`: «خدمة الشركات» card — «الاسم بالإنجليزية»
(`name_latin`, checked by the doc gate), B2B skills and «سعر طلبات الشركات».

**Review fixes.** The accept sheet's employee check now finds first names and two-part names on Arabic word boundaries
(the same variants the server redacts) and removes whole words only; memory grants saved in a session reopen with the
saved items (the server does not return an assignment's grants yet); a company case hides the impact card and speaks of
«الشركة» throughout the info-request flow, and sharing a company reply never creates the automatic follow-up (it never
reaches the portal — use «سؤال للشركة»); company sheets keep their grip/header on tall phone sheets; every control on the
desk screens and sheets is ≥ 44 px on phones; the urgent clock reads «س» (not «س عمل»); the companies table fits 1366.

**Tests.** `test/v10-b2b-staff.test.js` (41 tests, incl. one regression test per review finding): routes/nav/notification icons, CSS tokens, queue grouping and
primary actions, sheet copy and discard guards, previews through `company-ui.js`, companies/plan terms/company page/
settings/e-mail copy and admin gates, case-page company branch (no B2C controls, no generic close/reopen), lawyer
pages' allow-list of `company` keys and no AI draft, plus demo-backed contract checks of every staff/lawyer response
the pages read (create company with editor terms, case-manager 403s, B2B settings, outbox, integrations, cases line
filter, shadow client, lawyer profile, lawyer view whitelist with granted memory). Playwright twins of T13–T18, T21,
T22 and the lawyer DOM privacy scans live in `scratchpad/v10-pw-staff/`.
<!-- /v10:b2b-staff -->

## الإصدار 9.2 — Version 9.2: picture tiles, stories turned into requests, the foundation's colours

The user asked for three things (in Egyptian Arabic): (1) the moment people open the site they should see **squares to
pick from** — "the simplest thing in the world", assuming people who may not read well; (2) the site in **the
foundation's colours**; (3) for the administration, **AI that pulls the story a beneficiary tells on WhatsApp or on the
website, summarises it and turns it into a request** — a consultation, a court matter or whatever fits. Three lanes built
these in parallel. The privacy model is unchanged: an unconfirmed website number never receives WhatsApp, lawyers never
see phone numbers or raw conversations, and AI text is always reviewed by staff before it reaches a beneficiary or a
lawyer.

**9.2 at a glance** (each item is detailed in the subsections below):

| # | What | Who uses it | Where |
|---|---|---|---|
| 1 | **Tile-first home page**: «مشكلتك في إيه؟» + 8 picture tiles + «إحنا نكلمك» / واتساب / «طلبك فين؟», all on one 360×512 phone screen, gender-neutral wording | beneficiaries (often low literacy; fathers, grandfathers and sons too) | `/` |
| 2 | **Picture-question request form**: 1–2 one-tap picture questions per topic (with «مش عارفة»), then a voice-first story, then the phone number; consent stated on the send button; optional «كمان سؤالين» (governorate, relation) after sending | beneficiaries | `/intake?topic=…` |
| 3 | **Call-back-only requests** («إحنا نكلمك»): number + preferred time; the success screen says when and from which number the foundation will call | beneficiaries → staff | `/intake?mode=callback` |
| 4 | **Listening aid** «بالصوت»: once tapped, every screen, answer tile and card is read aloud with the phone's own Arabic voice | beneficiaries who cannot read | `/`, `/intake` |
| 5 | **Foundation colours** «ألوان المؤسسة»: 2 colours (or suggestions from a logo picture that is never uploaded) → every shade generated with guaranteed WCAG AA contrast | admin | Settings → `#/settings?section=brand` |
| 6 | **Story → AI summary → recommended track → one-click request**: WhatsApp messages are collected into one story until it is finished, summarised once (Claude or the local analyser), given one of 5 tracks (consultation / court matter / staff answers / refer / ask her first) with a draft, and confirmed by staff in one prefilled sheet «اعمله طلب»; inbox triage cards rank what needs a decision | staff | `#/inbox`, request page |
| 7 | **Voice notes typed by staff**: no audio ever goes to Claude; an untyped voice story is never summarised by Claude | staff | under each voice note |
| 8 | **Call notes and call attempts** for call-back requests and for women WhatsApp cannot reach (unconfirmed website numbers, voice-only): «سجّل المكالمة», «لم ترد», «تعذّر الوصول إليها» after 3 attempts on 2 days | staff | inbox card, request page |
| 9 | **Split**: a new problem written inside an open case/court-file conversation becomes a new request | staff | case and matter pages |
| 10 | **New settings, automated messages OFF by default**: WhatsApp welcome list and «وصلتنا حكايتك» acknowledgement are built but off until the foundation decides (privacy-policy wording first) | admin | Settings → `#/settings?section=stories` |

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
- **A story, then one summary.** Consecutive WhatsApp messages form one story in state `collecting` («القصة لسه بتتكتب…»)
  until it is finished: 10 quiet minutes (`story_quiet_minutes`), a whole-message done word («خلاص», «بس كده»…), or staff
  «لخّصها الآن». Website, phone, walk-in and email requests are ready on arrival. A finished story is summarised **once**
  (Claude, or the local analyser) into a one-line summary, a recommended **track** (`consultation` | `matter` | `internal` |
  `refer` | `need_info`) with a reason, and a prefilled draft for every track. Greetings, thanks, stickers, codes, done words,
  list/button replies and canned call-back lines are not facts (`story_rev` does not move). Schema 78 (`story_*`
  counters, `voice_transcripts`, `call_attempts`, `clients.name_source`, `cases.brief_draft`) is additive; pre-9.2 rows are
  "ready and analysed", so an upgrade triggers no AI call and no automated message.
- **Inbox triage cards** (`#/inbox`, «طريقة العرض»: «بطاقات» by default, «قائمة» = the 9.1 list; the choice is kept in
  `localStorage` `bm.inbox.view`). Cards mode uses `sort=triage`: call-back requests first, then ready and voice-blocked
  stories together (priority, then oldest ready first), then «وصل جديد بعد الملخص», then collecting, then awaiting her.
  One SQL `CASE` (`STORY_VIEW_SQL`) drives the views, filters (`story=callback|ready|collecting|stale|awaiting|voice`),
  counts and order. Each card: state ribbon, one line, «المقترح: …», «1 لم تُكتب», «رقم غير مؤكد», «محاولات الاتصال: n»,
  and one primary action (سجّل المكالمة · اسمع الرسالة الصوتية · لخّصها الآن · حلّل الآن · اتصل بها · the track action).
  The list stays phone-free.
- **Request page.** First card «تحويل القصة إلى طلب»: summary, «المقترح: …» + «ليه؟» + confidence, warnings
  (unconfirmed number, out of the 24 h window, untyped or failed voice, voice-only, other open request, local analyser,
  stale, collecting), primary «اعمله طلب: …», «اختيار مسار آخر», «حدّث الملخص الآن», and a collapsed «قرار يدوي» with the
  9.1 options. The **story sheet** («اعمله طلب», `components/story-sheet.js`) is one prefilled form per track and one
  submit: `POST /api/admin/intakes/:id/accept` with `story_rev` (compare-and-set). A 409 `story_changed` shows «مراجعة
  الرسائل» / «متابعة رغم ذلك» (`force`) inside the sheet; every button is disabled while in flight, so double clicks never
  duplicate. Drafts with an unfilled variable or only a greeting and signature are refused before sending; names come only
  from what she typed in the website form (for that request; in WhatsApp texts only once the number is confirmed) or
  from staff («أهلًا بيكي» otherwise), never from the WhatsApp profile (see "What the integration gate fixed").
- **Phone first when WhatsApp cannot reach her.** For an unconfirmed website number (track internal/refer/need_info) or a
  voice-only story the primary action is «اتصل بها»: the call-note dialog shows the opening line («قل: معاكي … بخصوص طلب
  رقم 29…») and the drafted reply under «قل لها:»; «إرسال لصفحتها فقط» is secondary. Call-back-only requests get a «طلبت
  مكالمة» card: «سجّل المكالمة» (`POST …/call-note`: a staff-entered `phone` message, ready + summarised at once; the
  number stays unconfirmed unless staff tick «تأكيد الهوية»), «لم ترد» (`POST …/call-attempt`: لم ترد · مشغول · رقم خطأ ·
  ردّ شخص آخر), and «إغلاق: تعذّر الوصول إليها» after 3 attempts on 2 different days (`handled_internally` +
  `resolution_kind='unreachable'`, never archive). «بلّغتها في مكالمة — أغلق بدون رسالة» closes internal/refer with
  `deliver:'phone'` and a call note.
- **Voice notes are typed by staff** (`components/voice-transcript.js`): under each voice bubble and in «مستندات الطلب», a
  player with 1×/1.25×/1.5×, «اكتب ما قالته المستفيدة بكلامها», «حفظ النص» / «الرسالة مش مفهومة» (Ctrl+Enter),
  `PUT /api/admin/voice-notes/:documentId/transcript`. No audio is ever sent to Claude; an untyped voice story is never
  sent to Claude. `?focus=voice` lands in the first untyped note.
- **Split** (`components/split-dialog.js`): «اعمل منها طلب جديد» under her messages on a case or court-file conversation
  moves the chosen messages (≤ 20, ≤ 30 days) and their documents to a new summarised request
  (`POST /api/admin/messages/split`, idempotent on `client_ref`; refused when a document is visible to a lawyer, for her
  founding messages from before the file was opened, for messages of two different files, and for website messages of
  a file whose number is unconfirmed — that request would be invisible to her). The new request keeps the sender's
  verification, so it shows on her full follow-up page and staff replies reach her.
- **Settings** «القصص الواردة على واتساب» (`#/settings?section=stories`): quiet minutes, WhatsApp welcome list (8 topic
  rows), «وصلتنا حكايتك» + request number, call-back number and days. Welcome and ack are **off by default** (on in the
  demo only); a readiness item in `/system` warns when WhatsApp is connected and the ack is off and links to the toggle.
  Automated story messages are fixed texts (never AI), `session_only` (never a template, silently skipped outside the
  24 h window and not counted as failures), `keep_unread`, WhatsApp-first stories only, never to legacy conversations,
  greeting-only stories, simulated numbers or a client with another open request.
- **Simulator**: voice note, photo and «خلاص» buttons, the welcome list rows as buttons, the story state after each send.
- **Cost**: Claude once per finished story (+1 per later batch); a local preview while she writes; a daily cap of 6
  automatic runs per request (call notes count; «حلّل الآن»/«لخّصها الآن» bypass it, rate-limited); ≤ 3 attempts per
  revision 10 minutes apart; ≤ 2 concurrent automatic Claude calls.
- **Security**: every new endpoint is staff-only on the server (settings admin-only) and audited (`ai.story_accepted`
  security event; activity log for the rest); `POST …/reply` ignores client `meta`. Transcripts, call notes, call attempts,
  `form_answers` and `brief_draft` are staff-only (never in lawyer views or her page; included in the admin full export).
- **Demo stories** (phones 01092000201–206): أم مروان (pension, transcript typed by منى السيد, consultation), أم كريم
  (custody hearing at «محكمة الأسرة بالمطرية», matter, untyped voice note), سعاد (inheritance certificate, quick reply),
  أم سارة (surgery costs, referral to the foundation's programmes), منى ع. (other, ask her first), أم حسن (still
  collecting; ready a few minutes after start).
- **Open decisions (admin-ai)**: turning on the welcome and the ack (after changing the privacy wording «كل رد يصلك
  يراجعه شخص مختص» to exclude fixed automated messages); the 10-minute quiet period and done words; who returns call-backs,
  from which number and how fast; outside referral bodies (none shipped); the daily Claude cap (6); the 3-attempts / 2-days
  rule before «تعذّر الوصول إليها». Review notes: the call dialog shows her number (from the staff-only proposal,
  `identity.phone`, also when opened from an inbox card; the list itself stays phone-free); the local analyser drafts the
  «ترد الإدارة» reply from the foundation's quick reply on the same legal topic (reviewed in the sheet before sending), a
  greeting-only draft is never a call script, and the card one-liner skips greetings and request codes; `accept` requires
  `story_rev` unless forced; `callback_from_number` is stored in the local format she sees. Deferred to 9.3: speech-to-text drafts, referral and done-word editors, a dashboard
  «جاهزة للقرار» tile, merging two open requests (9.2 only warns).

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
  admin's own page restyles without reloading. Staff and lawyers whose phone has `/app` cached
  by the service worker get the new colours on the first reload: saving refreshes the cached page on the admin's
  device, and on every open the app compares its colour block (`bm-theme` `data-v`) with `brand.v` in `/api/meta` and
  swaps it when they differ (`public/assets/js/app/theme-sync.js`). The service worker itself does not change, so no
  "update available" prompt appears.
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

### Settings added in 9.2 (and which are OFF by default)

| Setting (key) | Default | Where / notes |
|---|---|---|
| Foundation colours (`brand_colors`) | not set = the 9.1 teal `#0f4c5c` and gold `#b8862e`, pages byte-identical to 9.1 | Settings → «ألوان المؤسسة» (admins only, dedicated endpoints, audited; the generic settings PATCH ignores it) |
| Quiet minutes before a WhatsApp story counts as finished (`story_quiet_minutes`) | 10 | Settings → «القصص الواردة على واتساب» |
| WhatsApp welcome list with the 8 topics (`story_welcome_enabled`) | **OFF** | same card |
| «وصلتنا حكايتك» acknowledgement with the request number (`story_ack_enabled`) | **OFF** in code (ON in the demo only) | same card; a launch-readiness warning while WhatsApp is connected and it is off |
| Number we call from (`callback_from_number`) | empty = the foundation's phone (`org_phone`) | same card; shown to her verbatim on the call-back success screen |
| Days within which we call (`callback_eta_days`) | 1 working day (1–5) | same card; also promised on the success screen |
| Done words (`story_done_words`), daily cap of automatic Claude runs per request (`story_auto_ai_max_per_day` = 6), referral directory (`story_referrals`, only the foundation's own programmes) | defaults | no settings screen in 9.2 (editors deferred) |
| `stories_since` | the moment 9.2 first started | written once by the migration; automated story messages never reach a conversation older than this |

There are **no new environment variables, no new dependencies and no new required WhatsApp templates** in 9.2 (the
automated story messages are session-only, never templates). What operators must set before launch is in `DEPLOY.md`
«ما الجديد تشغيليًا في 9.2»: the colours, the call-back number and days (the site promises both), and — before turning
on the welcome list or the acknowledgement — the privacy-policy sentence «كل رد يصلك يراجعه شخص مختص ويعتمده قبل
إرساله» in `public/privacy.html` §7 must be changed to exclude fixed automatic messages.

### What the integration gate fixed before release

After the three lanes, four independent reviewers tested 9.2 end to end (beneficiary and staff journeys in a browser at
360, 390 and 1366 px, a security/privacy probe, a regression run, and an Arabic copy and accessibility review). Two
fixers then closed the findings:

- **Privacy — the name on a website request is only what that submission typed.** A website request with no name on a
  phone number that already belongs to a client no longer inherits the owner's name or governorate (her `/p/` page, the
  drafts and every automated message say «أهلًا بيكي» instead). A client created from an unconfirmed website form gets
  `name_source='website_unverified'`: that name is never used in WhatsApp drafts or automated messages until the number
  is confirmed (then it becomes `website`).
- **Split rules.** Messages from before the file was opened, from two different files, or website messages of a file
  whose number is unconfirmed cannot be split; a split request keeps the sender's verification, so it appears on her
  full follow-up page and staff replies reach her.
- **Call-back with a couple of words.** A call-back request with no audio and fewer than 10 letters stays a call-back
  with no story: the canned line, then her words on a new line for staff only, outside facts and analysis.
- **After a call note** the card shows the track's action instead of «اتصل بها» again, and the spoken call script drops
  chat-only sentences (send / photograph / links).
- **Lawyer text.** `facts_for_lawyer` and `brief_for_lawyer` drop confirmation codes and request codes and mask a house
  number and street («12 شارع النصر» → «[عنوان مخفي]»).
- **Analysis.** Two clicks (or two colleagues) on «لخّصها الآن» join one running analysis; a result that arrives after
  staff already decided the request is discarded; re-saving the same transcript changes nothing; transcript edits on
  decided requests or files are logged; «حلّل الآن» has a per-user limit (60/hour).
- **Analyser quality.** More Egyptian dispute markers (e.g. «حقي», «يبيعوا», «مش بيدفع») so disputes go to a consultation or
  court matter rather than «ترد الإدارة»; the «ترد الإدارة» draft comes from the foundation's quick reply in the same legal
  area as the topic she picked.
- **Staff UI.** Her number is shown as `01XXXXXXXXX` (`tel:` links keep `+20`); staff labels switch to the masculine form
  when the address form says so («اتصل به»); on screens ≤ 640 px every staff button, link and summary is ≥ 44 px.
- **Beneficiary UI.** Tile height `clamp(72px, (100svh − 236px)/4, 140px)` so tiles and the ways row fit 360×512; the
  button reads «إيقاف الصوت» while speaking; the «كمان سؤالين» card (titled «سؤال كمان» when only one question is
  left) is read aloud; the call-back number is spoken digit by digit; the skip link reads «انتقال إلى المحتوى»; inside
  Facebook/Instagram only one big WhatsApp button remains; the «مش عارفة» pictogram was redrawn as a shrug.
- **Colours.** Cached `/app` pages follow a colour change on the first reload; legal-page headers keep white text for
  any brand colour.

The gate's own tests are `test/v92-gate-public.test.js` and `test/v92-gate-admin.test.js`.

### Deferred to 9.3 (designed, not built)

- **Google Speech-to-Text** drafts of voice notes (needs a privacy-policy decision first). The transcript table has no
  status CHECK, so 9.3 can add `queued` / `auto_draft` / `failed` without rebuilding it. In 9.2 staff type every
  transcript.
- **Logo upload and display**, and favicon / app-manifest / share-image colours (9.2 only suggests colours from a logo
  picture on the admin's device).
- `BRAND_*` environment-variable defaults for the colours.
- Editors for the referral directory and the done words.
- A dashboard «جاهزة للقرار» tile, and a «من إحنا» section on the site.
- Merging two open requests of the same client (9.2 only warns: `other_open_request`).

### Open decisions and known limitations

The foundation's open decisions for 9.2 are items 12–24 of §11 (item 24 lists the wording and ordering questions the
final review left open). Known limitations left on purpose:
- Staff wording turns masculine only from a «أبو …» kunya or an address form set by staff; there is no male-first-name
  detection (it would risk misgendering women), so a man who writes under his own name shows as feminine until staff set
  the address form.
- At 320 px width, starting the listening aid wraps the home heading and shifts the tiles down about 24 px while it
  speaks (360 px and wider are fine).
- In the inbox triage, call-back requests are ordered oldest first within their group (FIFO), not by the time of day she
  asked to be called.
- The tile home page is the only home page in 9.2 (there is no switch back to the 9.1 home), so the picture-recognition
  test of §11 item 20 has to happen before the public launch.


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
- 9.2 additions: voice-note transcripts, call notes, call attempts, the website picture answers (`form_answers`) and the
  draft question for the lawyer (`brief_draft`) are staff-only (never in lawyer views or her page; included in the admin
  full export); what reaches a lawyer is stripped of codes and of house number and street; every AI draft goes through
  the editable «اعمله طلب» sheet before it is sent; automated story messages are fixed texts, session-only and
  WhatsApp-first only, and off by default; the reply route ignores client-supplied `meta`; a website request's name is
  only what that submission typed; every new endpoint is staff-only on the server and audited.

---

## 8. Technology (for technical readers)

- Node.js 22, **zero runtime dependencies** (only the optional official Anthropic SDK). Built-in SQLite database
  (one file), file uploads on disk. Runs anywhere Node or Docker runs.
- Arabic right-to-left single-page web app (no framework), mobile-first: checked at 360 and 390 px wide (and 1366 px
  for staff and lawyer pages). Since 9.1 the Arabic font (IBM Plex Sans Arabic, SIL Open Font License) is served by the
  platform itself, JS/CSS are versioned and cached for a year, and responses are Brotli-compressed.
- 809 automated tests (`npm test`, all passing at version 10.0.0; 809 at 9.2.0, 648 at 9.1.0, 411 at 9.0), plus the 9.0 browser tour of
  158 page views and, in 9.1 and 9.2, a browser usability run per lane at phone widths (including a simulated slow 3G
  network for the beneficiary pages). In 9.2 an integration gate added end-to-end beneficiary and staff journeys at
  360, 390 and 1366 px, a security/privacy probe, a regression run and an Arabic copy and accessibility review.
- Key folders: `src/` (server: services, routes, channels/WhatsApp, ai/, schema.d/ database extensions,
  `seed-v91-*.js` and `seed-v92-*.js` demo stories), `public/` (website, staff app, portal, `assets/fonts/`),
  `scripts/` (admin, backup, restore, demo reset), `test/` (`v91-*.test.js` for the 9.1 lanes, `v92-*.test.js` for 9.2).
- 9.2 key files: `public/assets/js/public/topics.js` (the single topic catalogue, imported by the browser and by the
  server for the site, the WhatsApp list and the analyser), `pictos.js` (pictograms), `listen.js` (read-aloud),
  `src/services/stories.js` (story state, triage view `STORY_VIEW_SQL`, proposal, accept, call notes, split),
  `src/services/voice.js` (transcripts), `src/brand.js` + `public/assets/js/lib/brand-color.js` (colour generator),
  `public/assets/js/app/components/story-sheet.js` («اعمله طلب»). Schema: `src/schema.d/78-v92-stories.*` and
  `79-v92-public.columns.json` (additive only).
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

**Version 9.2 stories in the demo** (fictional numbers; built with the real services in `src/seed-v92-public.js` and
`src/seed-v92-stories.js`). The «وصلتنا حكايتك» acknowledgement is on in the demo only; the welcome list stays off as in
production. Log in as `manager` and open the inbox (cards view):

| Number (who) | What to try |
|---|---|
| `01092000101` (أم يوسف) | Website: inheritance (husband; inheritance certificate «مش عارفة»), asked for a morning call, no story → «طلبت مكالمة» card: «لم ترد», then «سجّل المكالمة». |
| `01092000102` (أم ريم) | Website: housing (old rent; someone wants to evict her) with a written story; the picture answers under «اختيارات ضغطت عليها في الموقع (قد تكون غير دقيقة)». |
| `01092000103` (no name) | «إحنا نكلمك» from the home page, any time: «محتاجين حد يكلمنا — أي وقت». |
| `01092000201` (أم مروان) | WhatsApp: pension; a voice note typed by منى السيد and a photo of a paper → recommended «استشارة». |
| `01092000202` (أم كريم) | WhatsApp: custody hearing at «محكمة الأسرة بالمطرية» → «قضية / ملف مستمر»; one untyped voice note. |
| `01092000203` (سعاد) | WhatsApp: inheritance certificate → «ترد الإدارة» with the foundation's quick reply on that topic. |
| `01092000204` (أم سارة) | WhatsApp: surgery costs → «توجيه لجهة أخرى» (the foundation's other programmes). |
| `01092000205` (منى ع.) | WhatsApp: «حاجة تانية» from the topic list → «نسألها الأول». |
| `01092000206` (أم حسن) | WhatsApp: still «القصة لسه بتتكتب…»; it becomes ready a few minutes after start (or press «لخّصها الآن»). |

Also try the WhatsApp simulator (test voice note, photo, «خلاص», topic list buttons), «اعمل منها طلب جديد» under the
messages of an open file, and Settings → «ألوان المؤسسة», then open `/` and `/app`.

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
- **9.2 operations notes:** no new environment variables, dependencies or required WhatsApp templates; the database
  migration only adds columns and two tables, and every older request is treated as "ready and analysed" (no Claude
  call and no automated message because of the upgrade). Before launch an admin sets «ألوان المؤسسة», the call-back
  number and days in Settings → «القصص الواردة على واتساب» (the site promises both to the beneficiary), and keeps the
  welcome list and the acknowledgement off until the privacy-policy sentence about human review is changed. The
  scheduler must stay on (job «تلخيص القصص المكتملة», every minute). See `DEPLOY.md` «ما الجديد تشغيليًا في 9.2».
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
24. **(9.2) Wording and ordering left open by the final review** (each departs from the reviewed spec copy, so the
    foundation decides): the relation option «وصية على أيتام» (proposed «وصية على العيال»; «وصية» stays ambiguous);
    «احك{ي} لنا» in the WhatsApp welcome and topic nudge (in Egyptian «احكي» serves both genders); the staff warning
    «كل رسائلها صوتية — غالبًا مش بتقرا؛ الأفضل تكلّمها.» (colloquial in a staff screen); call-back requests ordered
    oldest first in the inbox (FIFO) rather than by the time she asked to be called; and whether staff wording should
    guess a man from his first name (today only a «أبو …» kunya or an address form set by staff does).

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
- **Version 9.2:** the user asked (in Egyptian Arabic) for picture tiles on entry for low-literacy users, the
  foundation's colours, and AI that turns a WhatsApp or website story into a request. Three design documents were
  merged into one spec (two adversarial reviews — one for beneficiaries, one for admin/security — were applied before
  any code), then three lanes built it in parallel (public tiles and form, admin story-to-request, colours), each with
  its own review and browser usability run. An integration gate then ran beneficiary and staff journeys, a security and
  privacy probe, a regression run and an Arabic copy and accessibility review; two fixers closed the findings (most
  importantly: a website request with no name never shows the phone owner's name, and split requests keep the sender's
  verification) before the version became 9.2.0.
- **Version 10.0:** the user asked for an Apple-style design in royal green and gold, the name «Emam Legal and
  Consultancy» in the user experience only, and company accounts for an outsourced in-house counsel service. Three
  design documents (experience, B2B server, B2B UX) were merged into one spec, revised after a client/operations critique
  and a security critique, then built by four lanes (experience, b2b-server, b2b-portal, b2b-staff) followed by an
  integration gate.
