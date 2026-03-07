# Vaidyah Mobile Apps — Development Testing Flows

Manual testing guide for **nurse-tablet** and **patient-mobile** React Native/Expo apps.
Run each flow on both iOS and Android. Mark pass/fail per platform.

---

## Table of Contents

- [Setup](#setup)
- [Nurse Tablet Flows](#nurse-tablet-flows)
  - [N1: Login & MFA](#n1-login--mfa)
  - [N2: Dashboard](#n2-dashboard)
  - [N3: Patient Intake — ABDM Lookup](#n3-patient-intake--abdm-lookup)
  - [N4: Patient Intake — Manual Entry](#n4-patient-intake--manual-entry)
  - [N5: Consultation — Recording & Transcription](#n5-consultation--recording--transcription)
  - [N6: Vitals Entry](#n6-vitals-entry)
  - [N7: Triage Result](#n7-triage-result)
  - [N8: SOAP Summary & Finalization](#n8-soap-summary--finalization)
  - [N9: Emergency Alert](#n9-emergency-alert)
  - [N10: Session Completion](#n10-session-completion)
  - [N11: Offline Mode](#n11-offline-mode)
  - [N12: Language Toggle (EN/HI)](#n12-language-toggle-enhi)
  - [N13: Auth Token Refresh](#n13-auth-token-refresh)
  - [N14: Error Boundary](#n14-error-boundary)
- [Patient Mobile Flows](#patient-mobile-flows)
  - [P1: Login — Phone + OTP](#p1-login--phone--otp)
  - [P2: Home — Trial Matches](#p2-home--trial-matches)
  - [P3: Trial Search & Pagination](#p3-trial-search--pagination)
  - [P4: Trial Detail](#p4-trial-detail)
  - [P5: Notifications](#p5-notifications)
  - [P6: Profile & Settings](#p6-profile--settings)
  - [P7: Save & Dismiss Matches](#p7-save--dismiss-matches)
  - [P8: OTP Resend Countdown](#p8-otp-resend-countdown)
  - [P9: Auth Token Refresh](#p9-auth-token-refresh)
  - [P10: Logout & Data Cleanup](#p10-logout--data-cleanup)
  - [P11: Language Toggle (EN/HI)](#p11-language-toggle-enhi)
  - [P12: Deep Link to Trial Detail](#p12-deep-link-to-trial-detail)
- [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Setup

### Prerequisites

```bash
# Install dependencies from monorepo root
npm install

# Start nurse-tablet
cd apps/nurse-tablet
npx expo start

# Start patient-mobile (in separate terminal)
cd apps/patient-mobile
npx expo start
```

### Test Environments

| Environment | API Base URL                          | Notes                  |
|-------------|---------------------------------------|------------------------|
| Local       | `http://localhost:3000/v1`            | Needs local backend    |
| Staging     | `https://staging-api.vaidyah.health/v1` | Shared test data    |
| Production  | `https://api.vaidyah.health/v1`      | Read-only testing only |

Set via `EXPO_PUBLIC_API_URL` in `.env` or EAS build config.

### Test Accounts

| App            | Credentials                                      |
|----------------|--------------------------------------------------|
| Nurse Tablet   | Staff ID: `nurse001` / Password: `test1234` / Center: any available |
| Patient Mobile | Phone: `+919999900001` / OTP: `123456` (staging) |

---

## Nurse Tablet Flows

### N1: Login & MFA

**Route:** `LoginScreen`
**Store:** `authStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Launch app | Loading spinner, then login screen appears | | |
| 2 | Verify language chips (EN / हिं) visible | Both chips render, EN is default active | | |
| 3 | Tap हिं chip | Form labels switch to Hindi | | |
| 4 | Tap EN chip | Form labels switch to English | | |
| 5 | Leave Staff ID empty, tap Login | Validation error shown | | |
| 6 | Enter valid Staff ID + wrong password | API error: "Invalid credentials" shown | | |
| 7 | Verify center dropdown loads | `fetchCenters()` populates list | | |
| 8 | Select a center | Center name appears in selector | | |
| 9 | Enter valid Staff ID + correct password, tap Login | If MFA enabled: OTP input appears. If no MFA: navigates to Dashboard | | |
| 10 | (MFA) Enter wrong OTP | Error: "Invalid OTP" | | |
| 11 | (MFA) Enter correct OTP | Navigates to Dashboard | | |
| 12 | Kill app, relaunch | Auto-login via `loadStoredAuth()` — Dashboard appears without login | | |

**Edge cases:**
- [ ] Network timeout during login — error shown, not stuck on spinner
- [ ] Rapid double-tap on Login button — only one request fires

---

### N2: Dashboard

**Route:** `DashboardScreen`
**Store:** `sessionStore`, `authStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Land on Dashboard | Greeting shows nurse name, today's date | | |
| 2 | Verify stats cards | Patients Seen, Pending Triage, Emergencies Today, Avg Session Time shown (or dashes if API unavailable) | | |
| 3 | Pull to refresh | Stats reload, spinner shows briefly | | |
| 4 | Tap "New Patient" quick action | Navigates to PatientIntakeScreen | | |
| 5 | Tap "Emergency" quick action | Navigates to EmergencyAlertScreen with fallback IDs | | |

**Edge cases:**
- [ ] Stats API down — cards show dashes, no crash
- [ ] Pull-to-refresh while already loading — no duplicate requests

---

### N3: Patient Intake — ABDM Lookup

**Route:** `PatientIntakeScreen`
**Store:** `sessionStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Navigate to Patient Intake | ABDM lookup tab active, recent patients loading | | |
| 2 | Enter valid ABDM ID | Spinner shows during search | | |
| 3 | ABDM result found | Patient card appears with name, age, gender, phone | | |
| 4 | Tap "Start Consultation" on ABDM result | Session created, navigates to ConsultationScreen | | |
| 5 | Enter invalid ABDM ID | "Patient not found" message | | |
| 6 | Network error during ABDM search | Error displayed, can retry | | |

**Edge cases:**
- [ ] Recent patients list loads on first visit, not on subsequent revisits (recentLoaded flag)
- [ ] On API failure for recent patients, retry is allowed (recentLoaded resets)

---

### N4: Patient Intake — Manual Entry

**Route:** `PatientIntakeScreen`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Switch to manual entry mode | Form fields appear: name, age, gender, phone, address, blood group, allergies, conditions | | |
| 2 | Submit with empty required fields (name, age, phone) | Validation prevents submission | | |
| 3 | Enter age = 0 or age = 200 | Validation rejects out-of-range age | | |
| 4 | Enter age = NaN (letters) | Validation rejects non-numeric | | |
| 5 | Fill all required fields, tap Start | Session created via API, navigates to Consultation | | |
| 6 | API fails on session creation | Alert: "Failed to start consultation. Please try again." | | |

**Edge cases:**
- [ ] Keyboard dismisses on submit
- [ ] Scroll works when keyboard is open

---

### N5: Consultation — Recording & Transcription

**Route:** `ConsultationScreen` (params: `{ sessionId }`)
**Store:** `sessionStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | Split layout: transcription panel (left), clinical panel (right) | | |
| 2 | Tap record button | Recording starts, timer increments every second | | |
| 3 | Verify timer accuracy | Timer counts 1s intervals smoothly, no jumps | | |
| 4 | Tap record button again | Recording stops, timer pauses | | |
| 5 | Verify transcription entries appear | Speaker-attributed text with colors (patient=blue, nurse=green) | | |
| 6 | Verify symptoms section | Detected symptoms appear with severity badges | | |
| 7 | Verify emotions section | Distress/Pain/Anxiety bars update | | |
| 8 | Verify contradictions section | Contradictions alert when data conflicts detected | | |
| 9 | Tap "Add Vitals" in bottom bar | Navigates to VitalsEntryScreen | | |
| 10 | Tap "Run Triage" in bottom bar | Triage request fires, loading indicator shows | | |
| 11 | Tap "Emergency" in bottom bar | Navigates to EmergencyAlertScreen | | |

**Edge cases:**
- [ ] Screen wrapped in ErrorBoundary — crash shows retry UI, not white screen
- [ ] Navigate away while recording — timer cleans up (no memory leak)
- [ ] Session ID missing — navigation guard prevents broken state

---

### N6: Vitals Entry

**Route:** `VitalsEntryScreen` (params: `{ sessionId }`)
**Store:** `sessionStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | All vital input fields visible with normal range hints | | |
| 2 | Enter temperature 98.6 F | Field shows green/normal indicator | | |
| 3 | Enter temperature 103.5 F | Field shows red/critical indicator | | |
| 4 | Toggle F → C | Value converts correctly (98.6F → 37.0C) | | |
| 5 | Toggle C → F | Value converts back correctly | | |
| 6 | Enter BP 120/80 | Normal indicator | | |
| 7 | Enter SpO2 = 88 | Critical/red indicator | | |
| 8 | Enter pulse = 72 | Normal indicator | | |
| 9 | Submit vitals | Vitals saved, navigates back to Consultation | | |
| 10 | Submit with null session | Error thrown: "Session or vitals data missing" (Alert shown) | | |
| 11 | API fails on submit | Alert: "Failed to submit vitals. Please try again." | | |

**Edge cases:**
- [ ] Non-numeric input rejected
- [ ] Rapid toggle F↔C doesn't corrupt values

---

### N7: Triage Result

**Route:** `TriageResultScreen` (params: `{ sessionId }`)
**Store:** `sessionStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads with triage data | Level badge (A=red/B=amber/C=green), confidence %, urgency score | | |
| 2 | Verify differential diagnoses | List with confidence bars | | |
| 3 | Verify recommended actions | Nurse protocol, prescription suggestions visible | | |
| 4 | Tap "Generate SOAP Note" | Loading indicator, then navigates to SOAPSummary | | |
| 5 | SOAP generation fails | Alert: "Failed to generate SOAP note. Please try again." | | |
| 6 | Tap "Trigger Emergency" | Navigates to EmergencyAlert with session + patient IDs | | |
| 7 | No triage result | Empty state: "No triage result available" | | |

**Edge cases:**
- [ ] Null session when generating SOAP — throws error, Alert shown
- [ ] Null session/patient on emergency trigger — silent no-op (guard)

---

### N8: SOAP Summary & Finalization

**Route:** `SOAPSummaryScreen` (params: `{ sessionId }`)
**Store:** `sessionStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | 4 SOAP sections displayed (Subjective, Objective, Assessment, Plan) | | |
| 2 | Verify status badge | Shows "Draft" initially | | |
| 3 | Tap edit mode | Fields become editable TextInputs | | |
| 4 | Modify Subjective text | Text updates in state | | |
| 5 | Save edits | Updated SOAP saved, exits edit mode | | |
| 6 | Tap "Finalize & Send" | Confirmation Alert appears | | |
| 7 | Confirm finalize | `finalizeSoapNote()` called, status changes to "Finalized" | | |
| 8 | Finalize fails (API error) | Alert: "Failed to finalize SOAP note. Please try again." | | |
| 9 | Finalize with null SOAP | Error thrown: "Session or SOAP note not found" | | |
| 10 | Tap "Complete Session" (post-finalize) | Session completed, reset, navigate to Dashboard | | |
| 11 | Complete session fails (API error) | Alert: "Failed to complete session. Please try again." | | |

**Edge cases:**
- [ ] Unknown SOAP status — fallback to "draft" config (no crash)
- [ ] Editing then canceling — values revert to original

---

### N9: Emergency Alert

**Route:** `EmergencyAlertScreen` (params: `{ sessionId, patientId }`)

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | Emergency header, patient info, vitals summary | | |
| 2 | Verify 7 emergency types | Cardiac, Respiratory, Stroke, Trauma, Obstetric, Snakebite, Other | | |
| 3 | Select emergency type | Type highlighted/selected | | |
| 4 | Tap "ALERT AMBULANCE" | API call fires, status updates (sending → pending → dispatched) | | |
| 5 | Verify ETA displayed | After dispatch, estimated time shown | | |
| 6 | Tap "NOTIFY REFERRAL HOSPITAL" | Requires: emergencyId exists AND selectedType is not null | | |
| 7 | Notify without selectedType | Button disabled or early return (no API call) | | |
| 8 | Hospital notify fails | Alert: "Could not notify the referral hospital." | | |
| 9 | Tap "CALL EMERGENCY CONTACT" | Phone dialer opens with contact number | | |
| 10 | No emergency contact on patient | Alert: "No emergency contact available" | | |
| 11 | Linking.openURL fails | Alert: "Unable to initiate call. Please dial manually." | | |

---

### N10: Session Completion

**Full flow integration test:**

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Start from Dashboard → New Patient | PatientIntake opens | | |
| 2 | Enter patient → Start Consultation | ConsultationScreen with session | | |
| 3 | Record → Add Vitals → Run Triage | Triage result displayed | | |
| 4 | Generate SOAP → Finalize | SOAP status = Finalized | | |
| 5 | Complete Session | Session reset, back to Dashboard | | |
| 6 | Verify Dashboard stats updated | Patient count incremented | | |
| 7 | Start another consultation | Fresh session, no remnants of previous | | |

---

### N11: Offline Mode

**Store:** `offlineStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Enable airplane mode | App detects offline (`isOnline: false`) | | |
| 2 | Create new patient + session | Session created with `offline_` prefix ID | | |
| 3 | Record vitals | Vitals stored locally | | |
| 4 | Submit vitals | Operation queued in `pendingSyncs` | | |
| 5 | Verify sync badge/indicator | Shows pending sync count | | |
| 6 | Disable airplane mode | Auto-sync triggers (`setOnlineStatus(true)`) | | |
| 7 | Verify sync completes | Pending items synced, queue cleared | | |
| 8 | Verify synced data matches | Session, vitals, patient data on server | | |
| 9 | Sync fails for one item | Retry count incremented, item stays in queue | | |
| 10 | Max retries exceeded | Item removed from queue, error logged | | |

**Edge cases:**
- [ ] Toggle airplane mode rapidly — `syncAll` guard prevents concurrent syncs
- [ ] App killed while offline — AsyncStorage preserves pending syncs on restart

---

### N12: Language Toggle (EN/HI)

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Set language to Hindi on Login | Login labels in Hindi | | |
| 2 | Login, verify Dashboard | Greeting in Hindi | | |
| 3 | Navigate through all screens | All user-facing text in Hindi | | |
| 4 | PatientIntakeScreen form labels | Hindi labels | | |
| 5 | VitalsEntryScreen hints | Hindi hints | | |
| 6 | Emergency types | Hindi text | | |
| 7 | Switch back to English | All text reverts to English | | |

---

### N13: Auth Token Refresh

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Login successfully | Token stored in SecureStore | | |
| 2 | Wait for token expiry (or manually expire) | Next API call returns 401 | | |
| 3 | Verify automatic refresh | New token obtained via `/auth/refresh` | | |
| 4 | Verify original request retried | Data loads successfully | | |
| 5 | Multiple concurrent 401s | Requests queued, all retried with new token | | |
| 6 | Refresh token also expired | User logged out, redirected to LoginScreen | | |

---

### N14: Error Boundary

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Trigger render error in ConsultationScreen | ErrorBoundary catches, shows fallback UI | | |
| 2 | Verify fallback message | "The consultation screen encountered an error..." | | |
| 3 | Tap "Retry" | Component remounts, error cleared | | |
| 4 | Error in other screens (no boundary) | Standard React Native error screen | | |

---

## Patient Mobile Flows

### P1: Login — Phone + OTP

**Route:** `LoginScreen`
**Store:** `authStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Launch app | Loading spinner, then login screen | | |
| 2 | Verify language toggle (EN / हिं) | Toggle visible, EN default | | |
| 3 | Enter phone with < 10 digits | Validation prevents OTP send | | |
| 4 | Enter valid phone, tap "Send OTP" | Spinner, then OTP input appears | | |
| 5 | Verify "Change Number" button | Tapping resets OTP flow, shows phone input again | | |
| 6 | Enter wrong 6-digit OTP | Error: "Invalid OTP" or similar | | |
| 7 | Enter correct OTP | Navigates to Home (MainTabs) | | |
| 8 | API error on send OTP | Error message shown, form stays on phone step | | |
| 9 | API error on verify OTP | Error message shown, OTP input stays | | |
| 10 | Kill app, relaunch | Auto-login via `loadStoredAuth()` — Home appears | | |

---

### P2: Home — Trial Matches

**Route:** `HomeScreen` (Tab: Home)
**Store:** `trialStore`, `authStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Land on Home | Greeting: "Hello, {name}" or "नमस्ते, {name}" (or just "Hello" / "नमस्ते" if no name) | | |
| 2 | Matches load | FlatList shows matched trials | | |
| 3 | Verify match score colors | Green badge ≥70%, Amber 40-69%, Red <40% | | |
| 4 | Verify trial card content | Title, summary (language-aware), phase, location | | |
| 5 | Location fallback | If no location: shows "India" (EN) or "भारत" (HI) | | |
| 6 | Pull to refresh | `fetchMatches()` re-fires, spinner shows | | |
| 7 | Tap trial card | Navigates to TrialDetail with `trialId` | | |
| 8 | No matches | Empty state: "No matches yet. Complete your profile." | | |
| 9 | Notification badge | Unread count badge shown in header | | |
| 10 | Dismissed matches hidden | `matches.filter(m => !m.dismissed)` applied | | |

**Edge cases:**
- [ ] API returns non-array for matches — `Array.isArray()` fallback to `[]`
- [ ] API returns non-number for total — `typeof` check fallback to `matches.length`

---

### P3: Trial Search & Pagination

**Route:** `TrialSearchScreen` (Tab: Trials)
**Store:** `trialStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | Search bar visible, empty state message | | |
| 2 | Type query, tap search | Results load with spinner | | |
| 3 | Verify result count | "{N} results" header shown | | |
| 4 | Verify trial cards | Title, summary, phase tag, status tag, location tag | | |
| 5 | Scroll to bottom | `loadMoreResults()` fires, footer spinner shows | | |
| 6 | Verify new results appended | Page 2 data added below page 1 | | |
| 7 | Already at total | `loadMoreResults()` no-ops (no extra request) | | |
| 8 | Loading more guard | Rapid scroll doesn't fire duplicate requests (`isLoadingMore` check) | | |
| 9 | Tap trial card | Navigates to TrialDetail | | |
| 10 | Search with no results | Empty state shown (no crash) | | |
| 11 | Network error | Error message in store, displayed to user | | |

**Edge cases:**
- [ ] Empty query submitted — `if (query.trim())` prevents empty search
- [ ] API returns non-array trials — `Array.isArray()` guard

---

### P4: Trial Detail

**Route:** `TrialDetailScreen` (params: `{ trialId }`)
**Store:** `trialStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | Loading spinner while fetching | | |
| 2 | Trial loads | Title, phase badge, status badge | | |
| 3 | Verify summary | Language-aware (EN or Hindi based on preference) | | |
| 4 | Verify conditions | Bullet list with `?? []` fallback | | |
| 5 | Verify eligibility | Age range, inclusion (checkmarks), exclusion (X marks) | | |
| 6 | Eligibility with null data | `eligibility?.ageMin`, `?? []` on criteria — no crash | | |
| 7 | Verify locations | Facility, city/state, distance in km | | |
| 8 | Locations empty | `(trial.locations ?? [])` — section renders empty | | |
| 9 | Verify sponsor | Sponsor name displayed | | |
| 10 | Contact button (phone) | `tel:` URL opens dialer | | |
| 11 | Contact button (email) | `mailto:` URL opens email client | | |
| 12 | Linking fails | `.catch(() => {})` — silent, no crash | | |
| 13 | No contact info | Contact button hidden | | |
| 14 | API error loading trial | Error text + Retry button shown (not infinite spinner) | | |
| 15 | Tap Retry | `clearError()` + `getTrialDetail()` re-fires | | |

**Edge cases:**
- [ ] Navigate to detail with stale data — `selectedTrial: null` set immediately on load
- [ ] Individual Zustand selectors — no unnecessary re-renders

---

### P5: Notifications

**Route:** `NotificationsScreen` (Tab: Alerts)
**Store:** `trialStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | Notifications fetch, list renders | | |
| 2 | Unread notifications | Left blue border + dot indicator | | |
| 3 | Read notifications | Normal card style | | |
| 4 | Verify notification content | Title + body (language-aware), relative timestamp | | |
| 5 | Hindi timestamps | `formatDistanceToNow` uses `hi` locale when Hindi active | | |
| 6 | Invalid date in createdAt | Try-catch returns empty string — no crash | | |
| 7 | Tap notification with trialId | Marks read + navigates to TrialDetail | | |
| 8 | Tap notification without trialId | Marks read only (no navigation) | | |
| 9 | Pull to refresh | `fetchNotifications()` re-fires | | |
| 10 | No notifications | Empty state: "No notifications yet." / Hindi equivalent | | |
| 11 | Tab badge updates | Unread count reflected on Alerts tab badge | | |

**Edge cases:**
- [ ] `fetchNotifications` clears error on success (`error: null` in success path)
- [ ] `markNotificationRead` silently ignores failures (non-critical)

---

### P6: Profile & Settings

**Route:** `ProfileScreen` (Tab: Profile)
**Store:** `authStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Screen loads | Avatar, name, phone displayed | | |
| 2 | Verify ABDM ID | Shown if present, dash if not | | |
| 3 | Verify age, gender, location | Displayed or dash fallback | | |
| 4 | Verify conditions list | Bullet items or "No conditions added" | | |
| 5 | Verify medications list | Bullet items or "No medications added" | | |
| 6 | Null user | All fields show fallback values (no crash) | | |
| 7 | Language toggle to Hindi | Profile labels switch, active button highlighted | | |
| 8 | Language toggle to English | Labels revert to English | | |
| 9 | Tap Log Out | Confirmation Alert appears | | |
| 10 | Cancel logout | Alert dismissed, stays on Profile | | |
| 11 | Confirm logout | Tokens cleared, trial data cleared, navigates to Login | | |

---

### P7: Save & Dismiss Matches

**Store:** `trialStore`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | On HomeScreen, trigger save on a match | `saveMatch(matchId)` — API call, local `saved: true` | | |
| 2 | API save fails | Error message set in store, match not marked saved | | |
| 3 | Dismiss a match | `dismissMatch(matchId)` — API call, local `dismissed: true` | | |
| 4 | Dismissed match hidden | HomeScreen filters out `dismissed` matches | | |
| 5 | API dismiss fails | Error message set, match not marked dismissed | | |

---

### P8: OTP Resend Countdown

**Route:** `LoginScreen`

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Send OTP | Resend button shows "Resend in 30s" | | |
| 2 | Watch countdown | Decrements smoothly: 30, 29, 28... 1, 0 | | |
| 3 | At 0 | Resend button becomes tappable | | |
| 4 | Tap Resend | New OTP sent, countdown restarts at 30 | | |
| 5 | Navigate away during countdown | Interval cleaned up (no memory leak) | | |
| 6 | Multiple resends | Each resets countdown to 30 | | |

**Edge cases:**
- [ ] Countdown uses `useRef` for interval — cleanup in `useEffect` return
- [ ] `[resendCountdown > 0]` dep — boolean flips only on start/stop, not each tick

---

### P9: Auth Token Refresh

**Config:** `api.ts` interceptor

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Make API call with expired token | 401 response intercepted | | |
| 2 | Refresh fires | `POST /auth/refresh` with refresh token | | |
| 3 | New tokens stored | SecureStore updated | | |
| 4 | Original request retried | Data loads transparently | | |
| 5 | Multiple concurrent 401s | Queued requests all retried after refresh | | |
| 6 | Queued request has `_retry = true` | Prevents infinite retry loop | | |
| 7 | Refresh response missing tokens | `throw new Error('Invalid refresh response')` — logout | | |
| 8 | Refresh token expired | Tokens cleared, user logged out to Login | | |

---

### P10: Logout & Data Cleanup

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Log in as User A | Matches, notifications load | | |
| 2 | Log out | Confirm dialog → logout | | |
| 3 | Verify token cleared | SecureStore: `vaidyah_auth_token` = null | | |
| 4 | Verify trial data cleared | `matches: [], notifications: [], unreadCount: 0, selectedTrial: null` | | |
| 5 | Log in as User B | Fresh data loads — no User A data visible | | |
| 6 | Verify User B matches | Different matches from User A | | |

**Critical:** This test verifies no data leakage between users on shared devices.

---

### P11: Language Toggle (EN/HI)

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | Set to Hindi on Profile | Profile labels switch to Hindi | | |
| 2 | Navigate to Home | Greeting in Hindi, trial summaries use `summaryHi` | | |
| 3 | Navigate to Search | Placeholder text in Hindi | | |
| 4 | Navigate to Notifications | Title/body use Hindi fields, timestamps use `hi` locale | | |
| 5 | View Trial Detail | Summary, section titles in Hindi | | |
| 6 | Switch back to English | All screens revert to English | | |
| 7 | Kill and restart app | Language preference persisted (SecureStore) | | |

---

### P12: Deep Link to Trial Detail

| Step | Action | Expected Result | iOS | Android |
|------|--------|-----------------|-----|---------|
| 1 | From HomeScreen, tap trial card | TrialDetail opens as modal | | |
| 2 | From NotificationsScreen, tap notification | TrialDetail opens with correct trialId | | |
| 3 | From SearchScreen, tap result | TrialDetail opens with correct trialId | | |
| 4 | Navigate back from TrialDetail | Returns to originating screen | | |

---

## Cross-Cutting Concerns

### Safe Area Handling

| Check | Expected | iOS | Android |
|-------|----------|-----|---------|
| All screens use `SafeAreaView` from `react-native-safe-area-context` | No content under notch/status bar | | |
| Screens with `ScrollView` | Content scrolls within safe area | | |
| Bottom tabs | Not overlapping home indicator (iOS) | | |

### Keyboard Behavior

| Check | Expected | iOS | Android |
|-------|----------|-----|---------|
| Login forms (both apps) | Keyboard doesn't cover input fields | | |
| Search input (patient) | Keyboard dismiss on submit | | |
| Vitals entry (nurse) | Numeric keyboard for number fields | | |
| SOAP editing (nurse) | Multiline input with scroll | | |

### Network Error Handling

| Scenario | Nurse Tablet | Patient Mobile |
|----------|-------------|----------------|
| No internet on launch | Offline mode activates, cached auth loads | Auth loads from SecureStore, API calls fail gracefully |
| Connection lost mid-session | Operations queued to offlineStore | Error messages shown per action |
| Server returns 500 | Catch blocks show error messages | Catch blocks show error messages |
| Request timeout (30s) | Axios timeout triggers catch block | Axios timeout triggers catch block |

### Memory & Performance

| Check | Expected |
|-------|----------|
| Navigate through all screens 10 times | No memory leak (intervals cleaned up) |
| FlatList with 100+ items | Smooth scroll, no frame drops |
| Recording timer runs for 30 min | Accurate time, no drift |
| Background app for 5 min, resume | State preserved, no crash |

### Accessibility

| Check | Expected | iOS | Android |
|-------|----------|-----|---------|
| Touch targets ≥ 48dp | All buttons/cards meet minimum | | |
| Screen reader labels | `accessibilityLabel` on key inputs | | |
| Color contrast | Text readable on all backgrounds | | |
| Font scaling | Layout doesn't break at 1.5x font | | |

---

## Test Result Template

```
Date: ___________
Tester: ___________
App Version: ___________
Device: ___________
OS Version: ___________

Flow ID | Result | Notes
--------|--------|------
N1      | PASS/FAIL |
N2      | PASS/FAIL |
...     |        |
P1      | PASS/FAIL |
P2      | PASS/FAIL |
...     |        |
```
