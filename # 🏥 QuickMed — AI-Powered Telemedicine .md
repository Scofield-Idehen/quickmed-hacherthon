# 🏥 QuickMed — AI-Powered Telemedicine on WhatsApp

> **Built for the Stellar WA Build Residency 2025**
> Live demo: [quick-med.xyz/chat](https://quick-med.xyz/chat)
> Test the bot directly on WhatsApp → **+234 811 273 5098**

---

## What Is QuickMed?

QuickMed is a full-stack telemedicine platform that runs entirely inside WhatsApp. No app to download. No account to create. No portal to navigate. A patient in Lagos types a message and within minutes they are booked with a verified Nigerian doctor, have paid, and have a video consultation link in their hands.

We built this because Nigerian healthcare access has a last-mile problem that isn't about hospitals — it's about friction. People know they need a doctor. They don't go because the process of finding one, paying one, and sitting in a waiting room is prohibitive. WhatsApp has 97% penetration in urban Nigeria. We put the clinic inside the app everyone already has open.

QuickMed is not a chatbot that books appointments. It is a complete healthcare operating system: AI triage, emergency detection, real-time doctor matching, payment processing, video consultation, AI-generated medical reports, PDF health records with blockchain verification, pharmacy integration, lab test booking, corporate health coverage, automated health tips, and crisis intervention — all delivered through conversational messages.

---

## Table of Contents

1. [Try It Live](#try-it-live)
2. [The Problem We're Solving](#the-problem-were-solving)
3. [System Architecture Overview](#system-architecture-overview)
4. [Core Features](#core-features)
   - [Smart Booking Flow](#1-smart-booking-flow)
   - [Real Doctor Matching & Slot Engine](#2-real-doctor-matching--slot-engine)
   - [Payment Processing](#3-payment-processing)
   - [Video Consultation System](#4-video-consultation-system)
   - [AI Medical Reports](#5-ai-medical-reports)
   - [Emergency Detection & Crisis Response](#6-emergency-detection--crisis-response)
   - [Mental Health & Suicide Prevention](#7-mental-health--suicide-prevention)
   - [AI Health Assistant](#8-ai-health-assistant)
   - [Medicine Safety Checker](#9-medicine-safety-checker)
   - [Medical Records & Blockchain Verification](#10-medical-records--blockchain-verification)
   - [Lab Test Booking](#11-lab-test-booking)
   - [Pharmacy & Drug Delivery](#12-pharmacy--drug-delivery)
   - [Automated Health Tips](#13-automated-health-tips)
   - [Corporate Health Coverage](#14-corporate-health-coverage)
   - [Doctor Portal](#15-doctor-portal)
   - [Voice Note Support](#16-voice-note-support)
   - [Support Ticket System](#17-support-ticket-system)
   - [Patient Consultation History](#18-patient-consultation-history)
   - [Appointment Management](#19-appointment-management)
   - [Refund System](#20-refund-system)
5. [Stellar & Zero Knowledge Integration](#stellar--zero-knowledge-integration)
6. [What We're Building at the Residency](#what-were-building-at-the-residency)
7. [The Numbers](#the-numbers)
8. [Team](#team)

---

## Try It Live

**No installation. No signup. Just WhatsApp.**

👉 Open [quick-med.xyz/chat](https://quick-med.xyz/chat) on your phone — it will redirect you directly into a WhatsApp conversation with our bot.

Or save this number and send any message: **+234 811 273 5098**

Try typing any of the following to explore:
- `book` — start booking a doctor
- `help` — see the full menu
- `check paracetamol` — test the medicine checker
- `my record` — see the medical record flow
- `lab` — explore lab test booking
- `I have a headache and fever` — trigger the AI health assistant

> ⚠️ The platform is live and serves real patients. The doctors are real Nigerian medical professionals. You can explore all flows without completing payment — just drop out before the Paystack step.

---

## The Problem We're Solving

Nigeria has **1 doctor for every 6,000 people**. The WHO recommends 1 per 600. The gap is not purely a supply problem — a significant portion of that gap is a distribution and access problem.

- A patient in Surulere, Lagos can reach a doctor on their phone in 4 minutes. They don't because the process is opaque.
- A patient with hypertension who needs a routine check-in skips it because they'd need to take half a day off work to sit in a clinic.
- A Nigerian in the UK or Canada needs to consult a Nigerian doctor who understands their context, food, medication availability, and cultural nuance — and has no way to do that.
- A company with 200 employees has no scalable way to offer health coverage that actually gets used.

QuickMed collapses all of these problems into a single WhatsApp conversation.

---

## System Architecture Overview

QuickMed runs on three interconnected systems:

**Patient System** — The main WhatsApp bot that handles all patient interactions. Built on Node.js with Express, connected to the WhatsApp Business API via Meta's Graph API. Every patient message flows through a layered handler: emergency check → active session check → command routing → AI fallback. Nothing reaches the AI until all structured handlers have had a chance to intercept it.

**Doctor System** — A separate WhatsApp number and webhook exclusively for doctors. Doctors register via a WhatsApp Flow (a native form experience inside WhatsApp), manage their schedule, view earnings, handle appointment rejections, and receive patient briefs before each consultation.

**Consultation Layer** — A web-based video consultation interface at `web3tribe.xyz/consult/:appointmentId` that both doctor and patient access via unique role-based links. The consultation room handles live video, real-time transcription, AI report generation, prescription flow, and automatic post-consultation messaging.

**Data layer:** Supabase (PostgreSQL) for all persistent data. In-memory session management for active booking flows. Paystack for payment processing. Groq (LLaMA) for AI responses. Deepgram for voice transcription.

---

## Core Features

---

### 1. Smart Booking Flow

The booking flow is the heart of QuickMed. It is a stateful, multi-step conversational flow that handles the full journey from "I need a doctor" to "your consultation link is ready."

**The flow:**

1. Patient types `book`
2. System checks for an existing active appointment — if one exists, blocks double-booking and shows current details
3. If the patient has a consultation history, the system offers to rebook their previous doctor with a single tap
4. Patient selects specialty from a dynamic list (only specialties with currently active doctors are shown — no dead options)
5. Patient selects an available date from a real-time calendar of the next 3 days
6. Patient selects a time slot — showing doctor name alongside each slot
7. Payment is initiated
8. Booking is confirmed and both patient and doctor are notified

**What makes this non-trivial:**

The specialty menu is dynamic. If no General Practitioner is active that day, it doesn't appear. The date list is computed in real time from actual doctor schedules. The time slots are 30-minute windows derived from each doctor's working hours and existing bookings — not a static list. The doctor assigned to a time slot is locked at the moment the patient selects it, not at payment — preventing the race condition where two patients select the same slot.

**Rebook flow:** If a patient has seen a doctor before, they are offered the choice to rebook that same doctor directly — skipping specialty and jumping straight to date selection for that doctor's schedule.

**Corporate flow:** If the patient is a registered corporate employee, the payment step is skipped entirely. They select who the appointment is for (themselves, spouse, or child) and go straight to confirmation.

---

### 2. Real Doctor Matching & Slot Engine

Behind every time slot selection is a slot engine that operates on real doctor availability data.

Each doctor registers with a schedule: working days (e.g. Monday, Wednesday, Friday) and time periods (Morning 06:00–12:00, Afternoon 12:00–17:00, Evening 17:00–21:00, Night 21:00–02:00 — including overnight shifts). The slot engine generates 30-minute appointment windows from these periods, then subtracts already-booked slots to produce available windows.

When a patient selects a time slot, the doctor shown in that slot is encoded directly into the slot ID. This means the patient always sees exactly who they're booking with, and the confirmed doctor is the one they selected — not the result of a re-run algorithm at payment time.

**Fair distribution:** When multiple doctors of the same specialty share a time slot, the engine distributes bookings fairly — a doctor with fewer bookings that day is shown first. This prevents one doctor from being flooded while others sit idle.

**Slot taking:** When a slot is confirmed, it is immediately marked as booked in the database. If two patients select the same slot simultaneously, the second patient sees a "slot just taken" message and is redirected to refreshed availability.

---

### 3. Payment Processing

QuickMed uses Paystack for all Nigerian Naira transactions, with a dual-confirmation architecture.

**Initialization:** When a patient selects a time slot, a Paystack payment is initialized server-side. The patient receives a payment link via a pre-approved WhatsApp template with a tap-to-pay button.

**Dual confirmation paths:**

*Path A — Webhook (automatic):* Paystack sends a `charge.success` webhook to QuickMed immediately after payment. The webhook verifies the HMAC signature using the raw request body, finds the matching in-memory booking session by payment reference, and completes the booking automatically. The patient never needs to tap anything.

*Path B — Manual verify:* Thirty seconds after sending the payment link, the bot sends a "Verify Payment" button. If the patient tapped it, paid, and the webhook fired, the session is already gone and the bot shows their confirmed booking details. If the webhook hasn't fired yet, tapping the button triggers a manual Paystack API verification.

**Stale session cleanup:** A background process runs every 5 minutes and expires payment sessions older than 20 minutes, notifying the patient that their session timed out and they need to rebook.

**Link renewal:** If a patient's Paystack link expires (15-minute expiry), they can type `new link` to generate a fresh payment initialization for the same slot without restarting the booking flow.

**Payment reference integrity:** Every session stores the Paystack reference. Every webhook is matched by reference. There is no scenario where a payment succeeds but the booking session can't be found — a Trello support ticket is auto-raised as a P1 incident if this happens.

---

### 4. Video Consultation System

Consultations happen on a custom web interface accessible via unique links. Each appointment generates two links from the appointment UUID:

- `web3tribe.xyz/consult/:id?role=patient` — patient's link
- `web3tribe.xyz/consult/:id?role=doctor` — doctor's link

Both links are sent to the respective parties via WhatsApp at booking confirmation. The doctor's link is sent to the doctor's separate WhatsApp number through the doctor notification system.

The consultation interface handles:
- Live video connection
- Real-time transcription of the conversation
- Post-consultation AI report generation from the transcript
- Prescription flow initiated by the doctor
- Patient brief shown to the doctor when they open their link (pulled from patient history)

---

### 5. AI Medical Reports

After every consultation, QuickMed generates a structured medical report using AI analysis of the consultation transcript.

The report extracts and structures:
- **Chief Complaint** — what brought the patient in
- **Symptoms** — all symptoms mentioned during the call
- **Medical History** — relevant history discussed
- **Diagnosis** — the doctor's assessment
- **Treatment Plan** — prescribed medications and recommendations
- **Follow-up Instructions** — next steps and timelines
- **Lifestyle Recommendations** — diet, exercise, behavioural changes
- **Red Flags / Warning Signs** — symptoms that should prompt immediate attention

The report is generated as a PDF using pdf-lib, formatted with professional medical structure, and sent directly to the patient's WhatsApp. The doctor receives a summary. The report is also stored and referenced in future consultations — when a doctor opens a patient brief, they see summaries from previous visits.

---

### 6. Emergency Detection & Crisis Response

This is one of the most important systems in QuickMed and one that most telemedicine platforms don't attempt.

Every single patient message — before it reaches any booking flow, any AI handler, or any command router — passes through the emergency detection system. This is not a keyword list. It is a pattern recognition system that identifies multiple categories of medical emergency:

**Cardiac:** chest pain, heart attack indicators, left arm pain with shortness of breath
**Respiratory:** can't breathe, choking, severe asthma attacks
**Neurological:** stroke symptoms, sudden severe headache, facial drooping, slurred speech
**Trauma:** accident, serious injury, heavy bleeding
**Allergic:** anaphylaxis, severe allergic reaction, throat closing
**Obstetric:** pregnancy emergencies, labour complications
**Poisoning:** ingestion of toxic substances, overdose

When an emergency is detected, the system immediately:
1. Acknowledges the emergency and provides immediate safety instructions relevant to the specific emergency type
2. Asks for the patient's location (accepts either typed address or a WhatsApp location pin)
3. Provides the nearest relevant emergency services (Lagos State Emergency number: 767, LASEMA: 112, specific hospital recommendations)
4. Keeps the patient engaged with step-by-step guidance while they wait for help
5. Flags the conversation in the admin system

The emergency session takes priority over everything. If a patient is in an active emergency session, their subsequent messages — including location pins — are routed exclusively to the emergency handler. No booking flow, no AI deflection, no command routing interrupts it.

**Location pin handling:** When a patient in an emergency sends a WhatsApp location, the system extracts the GPS coordinates and address, and provides directions to the nearest emergency facility based on their actual position.

---

### 7. Mental Health & Suicide Prevention

QuickMed has a dedicated mental health detection layer that operates separately from the general emergency system.

When a patient's message contains indicators of suicidal ideation, self-harm intent, severe depression, or psychological crisis, the system does not route them to book a psychiatrist. It responds immediately with:

- Direct acknowledgment of what they're going through, without clinical detachment
- Crisis line numbers (SURPIN Nigeria: 0800-SURPIN-1, international lines for diaspora users)
- A calm, present response that doesn't escalate or interrogate
- Gentle redirection toward professional support — both the crisis line and the option to speak with one of our psychiatrists
- A follow-up message sent after a delay to check in

The system distinguishes between someone mentioning mental health in passing ("I've been feeling anxious lately") and someone expressing acute crisis ("I don't want to be here anymore"). The former triggers a softer response and an offer to book a psychiatrist. The latter triggers the full crisis protocol.

The philosophy here mirrors clinical guidelines: don't ask direct "are you thinking of suicide" interrogation questions in a text interface, don't promise things about confidentiality you can't guarantee, and don't push the person away by being clinical when they need to feel heard.

---

### 8. AI Health Assistant

When a patient sends a health question that doesn't match any command — "I've had a headache for three days," "is it normal to feel tired all the time," "what does it mean if my urine is dark" — the AI health assistant responds.

The assistant is powered by Groq's LLaMA model with a contextual prompt that includes:
- The patient's name and consultation history
- Their recent message history in the conversation (last 20 messages)
- Their known health tags (conditions detected from previous conversations)
- QuickMed's operational context (so the AI knows to refer to booking, labs, etc.)

The AI response is followed automatically by three quick-reply buttons: **Book Doctor**, **Book Lab Test**, **More Options**. This means AI responses never end in a dead end — there's always a clear action available.

**Dead-end detection:** If the AI produces a response that contains phrases like "I'm not able to access" or "I cannot view," a dead-end detector replaces it with the help menu instead. The AI should never tell a patient it can't help when the booking system can.

**Silent health tagging:** When a patient describes symptoms in a non-booking context ("my blood pressure has been high lately"), the system silently extracts health condition tags (hypertension, diabetes, cardiology, etc.) and stores them against the patient profile. These tags inform future AI responses and are shown to doctors in the patient brief.

---

### 9. Medicine Safety Checker

Patients can check whether a medication is safe, what it's used for, potential side effects, dangerous interactions, and whether it's appropriate for their situation.

**Text trigger:** Any message starting with "check [drug name]", "is [drug] safe", "can I take [drug]", or "what is [drug] for" routes to the medicine checker.

**Image trigger:** If a patient sends a photo of a medication package, the system uses vision AI to identify the drug from the packaging and runs the same safety analysis — without the patient needing to type the drug name. This is particularly useful for patients who can't read the small print or who have a medication with a name they can't spell.

The checker provides:
- What the drug is and what it treats
- Standard dosage information
- Common side effects
- Serious side effects to watch for
- Drug interactions (especially with common medications in the Nigerian context)
- Whether it requires a prescription
- A recommendation on whether to consult a doctor before taking it

The medicine checker maintains session state — if a patient asks a follow-up question about the same drug, the context is preserved so they don't have to repeat the drug name.

---

### 10. Medical Records & Blockchain Verification

Patients who have completed at least one consultation can request a comprehensive medical record PDF.

**What the record contains:**
- Full consultation history with doctor notes and AI-generated summaries
- Identified health conditions and tags from consultation history
- AI narrative summary of the patient's medical journey
- Verification QR code

**The verification system:**

Every generated record is assigned a unique Record ID and a SHA256 hash of its contents. The record is stored in the database with:
- The patient's name
- The hash of the record contents
- The generation timestamp
- A count of consultations included

The verification page at `web3tribe.xyz/verify/:recordId` displays the record as verified — showing the patient name, consultation count, generation date, and the SHA256 hash. Any hospital, employer, insurer, or medical professional can scan the QR code on the PDF and see this verification page without accessing the record contents.

**The ZK angle (what we're extending at the residency):**

Currently, this verification depends on QuickMed's database. If our server is down, the verification fails. If someone questions whether we manipulated the database, there's no trustless proof. The Stellar integration we're building will anchor the record hash to the Stellar blockchain at the moment of generation — making the verification trustless, permanent, and independent of our infrastructure.

**Payment:** The medical record costs ₦1,000. Payment is processed via Paystack with the same dual-confirmation architecture as consultation booking.

---

### 11. Lab Test Booking

Patients can book laboratory tests directly through the bot without going through a doctor consultation first.

The lab booking flow uses WhatsApp Flows — a native form experience that renders inside WhatsApp — to collect:
- Type of test needed (blood panel, malaria, HIV, diabetes screening, etc.)
- Preferred location (uses the patient's shared location or typed address)
- Preferred date and time

The system identifies available labs near the patient's location, confirms the booking, sends the patient a reference number, and notifies the lab.

Lab results are sent back through the platform when they're ready — the patient receives them on WhatsApp and they are also stored against their patient profile for the doctor to reference in future consultations.

A patient can check the status of their lab booking at any time by typing `my lab`.

---

### 12. Pharmacy & Drug Delivery

After a doctor issues a prescription during a consultation, the prescription can be routed directly to a partner pharmacy for fulfillment and delivery.

The pharmacy flow:
1. Doctor generates prescription in the consultation interface
2. Patient receives the prescription on WhatsApp
3. Patient can tap to order the prescribed medications
4. System collects delivery address (patient types it or sends a location pin)
5. Order is sent to the nearest partner pharmacy
6. Patient receives delivery confirmation and tracking

The pharmacy handler maintains session state during address collection — if a patient sends their location as a pin during the drug order flow, the coordinates are captured and converted to a readable address automatically.

---

### 13. Automated Health Tips

Every registered patient who hasn't opted out receives daily health tips via WhatsApp.

Tips are personalised based on the patient's health tags. A patient tagged with `hypertension` receives tips about blood pressure management, sodium intake, and exercise. A patient tagged with `diabetes` receives tips about blood sugar monitoring and diet. A patient with no specific tags receives general wellness content.

**Scheduling:** Tips are sent at a consistent morning time via a background job that runs on server startup. The system checks each patient's opt-in status before sending.

**Opt-out/in:** Patients can type `stop tips` to unsubscribe and `start tips` to resubscribe at any time. Both commands are always available regardless of what other flow the patient is in — they are intercepted before the session handler.

**Non-intrusive design:** Tips are sent as plain text messages with no interactive elements — they are informational, not action-demanding. The patient can ignore them without the bot interpreting silence as a command.

---

### 14. Corporate Health Coverage

Companies can partner with QuickMed to provide health coverage for their employees and dependants.

**Company registration:** Companies are registered in the admin system with a unique company code. Employees register themselves by entering the company code in the bot. Once registered, all their consultations are covered — no payment step.

**Dependant management:** Each employee can register up to 3 family members: one spouse and up to two children. When a covered employee books an appointment, they are asked who the booking is for — themselves, their spouse, or a named child.

**Billing:** Corporate accounts are billed monthly. A background job runs on the 1st of each month at 8AM WAT and calculates the total consultations used by each company's employees and dependants, generating an invoice.

**Corporate booking flow difference:** Corporate patients go through the same specialty/date/time selection, but the payment step is replaced with an instant confirmation. The booking is tagged with the company ID and the name of the covered person (employee or dependant).

---

### 15. Doctor Portal

Doctors have their own dedicated WhatsApp number and a full portal accessible through it.

**Registration:** Doctors register via a WhatsApp Flow — a multi-screen form experience that collects personal details, specialty, medical license number, bank account details for payouts, working days, and availability periods. Before the form, doctors are asked to send a profile photo that is saved permanently (not subject to WhatsApp's 5-minute media URL expiry — we download and re-upload it to permanent storage at registration time).

**Registration verification:** All doctor applications are reviewed by the QuickMed admin team within 24-48 hours. Disapproved doctors can re-register with corrected information. Suspended or removed doctors receive specific messages explaining the status.

**Doctor commands:**
- `profile` — full profile including schedule, fee, rating, and total earnings
- `appointments` — upcoming confirmed bookings with patient names and consultation links
- `earnings` — detailed breakdown: this month, last month, all-time, last payout date, next payout date (20th of each month)
- `reject` or `reject QM12345` — reject an appointment (triggers automatic reassignment to another doctor of the same specialty; if no replacement is available, the patient is notified to rebook)
- `patient +2348012345678` — look up a patient's health record and consultation history
- `update name` — change display name (with confirmation step)
- `report problem` — open a support ticket

**Doctor earnings:** QuickMed takes a 30% platform fee. Doctors receive 70% of each consultation fee. Payouts are processed on the 20th of each month.

**Post-consultation notes:** After each consultation, the doctor receives a prompt to add any additional notes that weren't captured in the AI report. These notes are stored and included in the patient's record.

**Rating system:** After each consultation, patients rate their doctor. Ratings are aggregated and displayed on the doctor's profile. The system prevents gaming — a rating prompt is only sent once per consultation.

---

### 16. Voice Note Support

Patients can send voice notes instead of typing. The system transcribes voice notes using Deepgram's Nova-2 speech recognition model and processes the transcript exactly as if the patient had typed it.

This means every feature — booking, emergency detection, medicine checker, AI health assistant, appointment queries — works via voice. A patient who can't type (due to disability, age, or simply preference) has full access to the platform.

**Transcription feedback:** When a voice note is transcribed, the bot sends a brief confirmation showing what it heard: *"🎙️ Voice note received: 'I need to see a doctor today for chest pain...'"* This lets the patient verify the transcription was accurate before the system acts on it.

**Failure handling:** If a voice note can't be transcribed (silence, background noise, very low quality), the patient receives a friendly message asking them to try again in a quieter environment or type their message instead.

**Emergency interception:** Voice notes pass through emergency detection exactly like text messages. A patient who says "I'm having chest pains" in a voice note triggers the full emergency response.

---

### 17. Support Ticket System

When a patient has a problem — payment went through but no booking, video call didn't work, wrong doctor notified — they can type `report issue` to open a support ticket.

The support system is backed by Trello. Each ticket creates a Trello card with:
- Patient name and phone number
- The issue description
- Any subsequent messages from the patient as comments on the card

**Operator response:** When a support agent responds on the Trello card, the response is automatically forwarded to the patient's WhatsApp via a Trello webhook. The patient sees a WhatsApp message from the bot containing the agent's response.

**Active ticket behavior:** While a patient has an open ticket, their messages are routed to the Trello card as comments rather than being processed as bot commands. System commands (`book`, `cancel`, `lab`) still work — the patient can continue using the platform while their issue is being resolved. The only exception is images — if a patient sends an image while in a support ticket session, the Trello card receives a note that an image was sent (since WhatsApp doesn't forward images to webhooks).

**Resolution:** Patients can close their ticket by typing `resolved`. The Trello card is updated and the patient receives a confirmation.

**Doctors have the same system** — they can raise support tickets from their portal and receive responses via their WhatsApp.

**P1 auto-tickets:** The system raises automatic Trello P1 tickets when a payment is confirmed but booking fails — ensuring no patient loses money without resolution.

---

### 18. Patient Consultation History

Patients can view a summary of their past consultations at any time.

Typing `my history` (and many variations — `past visits`, `my records`, `previous consultations`) returns the last 5 consultations showing:
- Date and time
- Doctor name and specialty
- Booking ID
- A 2-3 line excerpt from the consultation notes or medical report

This history is also used to power the rebook flow and the doctor brief. When a doctor opens a patient consultation link, they see the patient's last 3 consultations before they join the call.

---

### 19. Appointment Management

Patients can check, reschedule, and cancel appointments through the bot.

**Check:** Typing `appointment` (and all common misspellings — the system handles "appiontment", "appointement", "appoitment", and similar) returns full appointment details including the consultation link. If the appointment has already passed, the system tells them it's expired and offers to book a new one.

**Expired appointments:** If a patient tries to book a new appointment but has an expired confirmed booking in the database, the system auto-clears it and starts the new booking flow — no manual cleanup required.

**Cancel:** Typing `cancel` triggers the cancellation and refund flow. The doctor is notified of the cancellation on their WhatsApp. The freed slot becomes immediately available to other patients.

---

### 20. Refund System

When a patient cancels a paid appointment, the refund eligibility is calculated based on how far in advance the cancellation is made.

The refund policy:
- Cancelled more than 24 hours before the appointment → full refund
- Cancelled less than 24 hours before → partial refund (platform reserves a cancellation fee)
- No-show (appointment time passed without joining) → handled separately

Refunds are processed back to the original payment method via Paystack's refund API. The patient receives a clear WhatsApp message explaining what they'll receive back and when to expect it.

---

## Stellar & Zero Knowledge Integration

### What We're Adding at the Residency

QuickMed already has a working verification system for medical records. We are extending it with two things at the Stellar WA Build Residency:

**1. On-Chain Record Anchoring**

When a patient's medical record PDF is generated, its SHA256 hash will be published to the Stellar blockchain — either as a Soroban smart contract call or a transaction memo. The record's verification page will display the Stellar transaction ID alongside the hash, allowing anyone to independently verify on the Stellar network that this hash existed at this timestamp — without depending on QuickMed's database.

This transforms the verification from *"QuickMed says this is real"* to *"Stellar's immutable ledger says this hash existed on this date."*

**2. Stellar Payments for Diaspora Patients**

A parallel payment rail using USDC on Stellar will be added alongside Paystack. When a patient selects a doctor, they will be offered two payment options:

- **Paystack** (Naira) — for patients in Nigeria paying by card, bank transfer, or USSD
- **USDC on Stellar** — for diaspora patients in the UK, US, Canada, or anywhere Paystack doesn't operate

The Stellar payment flow generates a payment request with a unique memo (matching the role of Paystack's reference). The booking session is held while payment is pending. Confirmation is verified by querying Horizon for a transaction with that memo to the receiving address.

Both Paystack and Stellar bookings complete through the same confirmation flow — the patient gets the same WhatsApp confirmation, the doctor gets the same notification, and the booking lands in the same database.

**Why This Matters**

The combination of these two features means:
- A Nigerian nurse in London can pay her mother's doctor in Lagos in USDC with near-zero fees
- That doctor's consultation notes become a verifiable, trustless health credential
- A hospital or insurer anywhere in the world can verify the credential on Stellar without calling QuickMed

This is the only telemedicine platform in Africa doing this.

---

## What We're Building at the Residency

**Sprint: April 14–18, 2025**

We are not starting from scratch. We are extending a live, production system. Here is exactly what gets built during the sprint:

| Component | What It Does | Status |
|---|---|---|
| `stellarService.js` | Stellar SDK wrapper — submit hashes, query Horizon, generate payment requests | Building |
| `stellarPaymentService.js` | Initialize and verify USDC payments on Stellar | Building |
| `medicalRecordService.js` extension | After PDF generation, call stellarService to anchor hash | Extending |
| Verify page extension | Display Stellar transaction ID alongside SHA256 hash | Extending |
| Booking flow payment selection | Add "Pay with USDC" option before Paystack link | Extending |
| ZK identity integration | ZK proof that patient owns the record without revealing contents | Building (using Stellar workshop tooling) |

**What we're not touching:** The emergency system, the AI assistant, the doctor portal, the lab flow, corporate coverage, the support system — all of this is production-ready and stays as is.

---

## The Numbers

QuickMed is not a demo. It is a live service.

- **Specialties available:** 15 (General Practice, Cardiology, Pediatrics, Dermatology, Gynecology, Neurology, Orthopedics, Psychiatry, Ophthalmology, ENT, Urology, Dentistry, Endocrinology, Gastroenterology, Pulmonology)
- **Booking flow completion time:** Under 4 minutes from "book" to confirmed appointment
- **Emergency response time:** Under 3 seconds from message receipt to emergency protocol activation
- **Voice note transcription:** Deepgram Nova-2, typically under 2 seconds per note
- **Payment confirmation:** Automatic via webhook, no patient action required in most cases
- **Doctor payout:** 70% of consultation fee, paid monthly on the 20th

---

## Why WhatsApp?

Every other telemedicine platform in Nigeria requires a patient to:
1. Find the app
2. Download it
3. Create an account
4. Verify their email
5. Fill in a profile
6. Find a doctor
7. Navigate a UI they've never seen

WhatsApp has 97% penetration in urban Nigeria. It is the app Nigerians already use to talk to their family, their bank, their pastor, and their employer. Putting healthcare in WhatsApp removes every barrier between a sick person and a doctor. There is no step 1 through 5. There is only: "send a message."

---

## Note on Open Source

This repository contains documentation only. The QuickMed codebase is proprietary — we are not open-sourcing the implementation because we are a live healthcare service with real patients and real doctors. Releasing the source would expose our infrastructure, our patient data architecture, and our payment integration details.

If you are a developer, researcher, or health organisation who wants to explore a partnership or integration, reach out at **support@quick-med.xyz**.

If you want to experience what we've built, open [quick-med.xyz/chat](https://quick-med.xyz/chat) on your phone right now.

---

## Team

Built by the QuickMed team for the **Stellar WA Build Residency 2025**.

For questions, partnerships, or support: **support@quick-med.xyz**

---

*QuickMed — Healthcare made accessible in Nigeria.*
*Built on WhatsApp. Powered by AI. Verified on Stellar.*