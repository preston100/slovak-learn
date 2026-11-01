# Slovak Learn — What's Been Done

- **Live site**: https://slovaklearn.netlify.app
- **GitHub repo**: https://github.com/preston100/slovak-learn

## What it is (as of November 2026)

A website for learning Slovak from scratch to the end of **A1**. Visitors land on a sign-up screen: **create an account** (name, email, password, agree to the Terms) or **sign in**, then pick a plan — the **Free Preview** (sections 1–5), or full access with a **beta/dev access code**. Paid plans (Monthly €11.99, Annual €79) are shown but checkout isn't live yet. Each account's progress is saved on the server, so it follows you between devices.

- **Profile** — progress ring, streak, daily goal, badges, leaderboard, and an "Up next" card that takes you to where you left off.
- **Learn** — one path through the course, split into levels: **A1.1** (alphabet → basics) and **A1.2** (numbers, dates, food, town, health, past & future). Every section is Learn → Practice → Voice → Quiz and needs 80% to unlock the next. A checkpoint test every 10 sections (70%), and a **final test** at the end of each level (80%) that opens the next one. **Word Lists** shows every word, by level.
- **Grammar Guide** — every grammar section in course order, by level: tables, examples and the explanation, with a "Practice this" button. *The Six Cases* sits at the end as reference only.
- **Tests** — an AI-written quiz (Gemini) on any topic, free practice rounds per word topic, and **Revise** for words you keep missing.
- **Add Content** *(dev accounts only)* — upload a photo of notes; Gemini proposes vocab/grammar, you approve it, and it appears under "My additions". Also home to the **pronunciation audio** generator.
- **Analytics** *(dev accounts only)* — accounts by plan, active learners, API usage and cost, every learner's progress, where people get stuck, the most-missed words.

**Dev accounts** (`prestonandersen100@gmail.com`, `mravikovamartina@gmail.com`) see every section unlocked, see Add Content and Analytics, and can press **P** in a lesson to skip a question. Tapping the elephant on the Profile switches **student view** on and off (locks and no P-skip, exactly as a student sees it; remembered on that device).

**Content lives in plain files** in `data/`: `curriculum.json` (the order of the course and each unit's level), `vocab.json`, `grammar.json`, `dialogues.json`, `alphabet.json`, plus `audio-manifest.json` → the clips in `audio/`.

## How it started (September 2026)

1. **Built the whole site from scratch**: the page itself, the password gate, all three original sections, and the two Netlify functions that talk to Gemini — then tested the entire flow locally before handing it to you.
2. **Walked you through deployment**: pushing to GitHub, connecting it to Netlify, and setting up the `SITE_PASSWORD` and `GEMINI_API_KEY` secrets in the Netlify dashboard.
3. **You sent 5 photos of your Slovak notes** — I transcribed all of it (family, food, places, adjectives, time, numbers, verb conjugations, useful phrases, everyday phrases) into the Grammar and Vocabulary sections.
4. **Fixed a bug where quizzes stopped working entirely**: Google had retired the AI model the site was using. Switched it to an alias that auto-updates itself, so this specific failure shouldn't happen again.
5. **Built the "Add Content" feature you asked for**: upload a photo, Gemini reads it and proposes new vocab/grammar, you check off what you want, and it gets saved permanently to the site (this required setting up a GitHub access token so the site is allowed to save changes to itself).
6. **Chased down a string of "AI is busy" errors** you kept hitting, and fixed the real causes one by one:
   - Netlify (the hosting) kills any request that takes longer than 10 seconds — my first fix didn't account for that and made things worse. Rewrote it to respect that limit properly.
   - Added an automatic fallback to a second, usually-less-busy AI model when the main one is overloaded or rate-limited.
   - Added retrying from your browser too (which isn't stuck with that 10-second limit), so a busy moment now quietly retries a few times before ever showing you an error.

## Teacher's review, round 2 (September 2026)

Changes from "Slovak – notes 2" (section numbers are the roadmap numbers at the time, checkpoints included):

- **Visual**: every grammar section now has a table (conjugations, pronoun sets, possessive forms…), with the changing ending highlighted. Explanations support **bold**, *italic* and bullet lists. Authored in `data/grammar.json` as a `tables` field plus light markup in `explanation`.
- **Greetings (10)**: one `ahoj` (hi) and one `prepáčte` (sorry / excuse me); "bye" is now `čau / maj sa`.
- **Everyday phrases (12)**: `Dovidenia` marked as goodbye (formal).
- **Family, food, adjectives, places, time**: no capital letters on single words.
- **Pronouns (25)**: pronouns are normally dropped unless stressed, with her example sentences.
- **"This" (26)**: accusative forms (tohto, túto) removed; just tento / táto / toto.
- **Possessives (27)**: explains that môj / moja / moje follows the gender of the owned noun, with a full table.
- **Question words (28)**: moved to after the verb conjugation sections.
- **Useful phrases (30)**: one `Na zdravie!` covering both meanings.
- **Food / fruit / places (34–40)**: Fruit is its own topic; Places and Things at Home are split; bus stop / elevator glossed "at the bus stop", "in the elevator".
- **Common verbs (47–48)**: infinitives only, no first-person forms in brackets.
- **Present tense + key verbs (49–52)**: the three patterns (-ám / -ím / -em) in a table, clearer conjugation tables, more examples.
- **Six cases (54)**: removed from the Learn path (still readable in the Grammar Guide).
- **Time (60–61)**: repeated numbers and duplicate time words removed.

Follow-up after her answers:

- **vy**: described as "formal, or a group of people" — she confirmed her original "informal" was a slip.
- **Six cases**: stays in the Grammar Guide, at the end, marked as reference only.
- **ujo / strýko**: one entry, "uncle" — either side of the family.
- **páčiť sa**: replaces the incorrect "páčiť sa mi"; notes *páči sa mi* = I like it.
- **New section 27, Adjectives: dobrý / dobrá / dobré** — adjective endings follow the noun's gender (*moja dobrá sestra*), right after possessives.

Word progress (stats and mastered words) is carried over automatically for words whose spelling only changed in capitalisation or lost a bracketed extra. New and reworded phrases need audio: Add Content → Pronunciation audio → "Check & Generate Missing Audio".

## Levels: A1.1 and A1.2 (September – October 2026)

The Learn roadmap is split into levels. Everything that existed before is **A1.1**; **A1.2** was added on top.

- **A1.1 additions**, each where it fits: *dobré ráno / dobrý večer / dobrú noc* in Greetings (now two parts), a new **Negation** section right after "To Be", and **Koľko je hodín?** inside Telling Time.
- **A1.1 Final Test** at the end of the level: 15 words + 10 grammar questions from the whole of A1.1, needs **80%**. Passing it opens A1.2. Checkpoints inside a level stay at 70% and cover the last 10 sections.
- **No more re-locking**: a section stays open if you've cleared it or anything after it, so adding sections to the middle never locks anyone out.
- **Duplicates**: *Ahoj* / *Dovidenia* removed from Everyday Phrases (taught in Greetings). Formal/informal pairs stay, labelled: *Nemáš za čo* (informal) / *Nemáte za čo* (formal). *Nech sa páči* is now "Here you are / Go ahead".
- *perlivá / neperlivá* (water) moved from Adjectives to Food & Drink.
- **Add Content** sections sit under "My additions" at the end of the roadmap — outside the levels, untested, always open.
- **Word Lists** (was Browse All) is vocab only; grammar lives in the Grammar Guide.

### A1.2 (built October 2026 — waiting for the teacher's review)

50 sections, in this order: bigger numbers & prices → days, months, seasons & dates → colors → countries, languages & jobs, *sa* verbs (*volám sa*), where you're from → everyday food, objects (*Chcem kávu*), likes (*Mám rád / rada*) → around town, transport & directions, *Kde? / Kam?* (*v škole / do školy*), *môcť / musieť* → rooms, clothes, body & health (*Bolí ma…*) → weather → past tense (*robil som*) → future (*budem*, *pôjdem*). Four checkpoints and the **A1.2 Final Test**.

- **Dialogues** are a new kind of section: a short scene shown as a chat (each speaker on one side, audio on every line), then comprehension questions. Five of them: meeting someone, at the café, asking the way, at the doctor, the weekend. Stored in `data/dialogues.json`.
- Moved into A1.2: the directions (*vpravo, vľavo, vonku…*) from Adjectives, *leto* from Time (now with the other seasons), *učiteľ / učiteľka* from Family (now in Jobs).
- *pomaranč* / *oranžový* are labelled "orange (fruit)" / "orange (colour)" so a quiz can't mix them up.
- Verb aspect (why *prídem* already means "I will come") is deliberately left for A2.

Also in this round: on phones the tabs read "Guide" and "Add" so the bar fits (nothing scrolls sideways at 375px or 320px), Grammar Guide explanations start open, the Guide and Word Lists are split into A1.1 / A1.2, and "Up next" points to where you left off rather than to a section added behind you.

## Teacher's review, round 3 (October 2026)

- **"Hear it in a sentence", Tests quizzes and Add Content timing out**: Google moved the `gemini-flash-latest` alias to Gemini 3.8 Flash, which "thinks" at a medium level by default — slow enough to blow Netlify's 10-second limit, and the first model was allowed the whole budget so the fallback never ran. Now Flash is asked for `thinkingLevel: "low"`, 3 seconds are always kept for the Flash-Lite fallback, sentences try Flash-Lite first, the deprecated `temperature` setting is gone, and "Hear it in a sentence" retries quietly like the quiz does. If a future model rejects the thinking setting, the request is retried without it. (`netlify/functions/lib/shared.js`)
- **Voice check accepted a wrong number** (*osemdesiat* for *sedemdesiat*): it allowed a third of the letters to differ and passed any word contained in the other (*mám* for *nemám*). Now words are compared one by one — short words exactly, long words at most one letter off and never in the ending — so wrong numbers, wrong endings and dropped *ne-* fail, while missing accents, split compounds (*tridsať päť*) and digits (*70*) still pass. Slash entries accept either alternative.
- **Numbers (61–64)** in her order: 61 Building Numbers (20–100, no prices/age), 62 Tens & Units (21–99), 63 Hundreds & Thousands (200–1,000), 64 Prices & Age.
- **Days (65–67)**: days of the week | all twelve months | *deň, týždeň, mesiac, rok, ročné obdobie* + the seasons. A vocab topic can now fix its own parts with `"split": [8, 12, 9]` in `vocab.json`. *mesiac* moved here from A1.1's Time.
- **Colours** are listed in the feminine (*červená, modrá…*), because *farba* is feminine; the grammar section explains that and still shows how they match a noun (*červený dom*).

## Round 4: learning improvements (October 2026)

From an outside review of the site, the changes that were worth making:

- **Quizzes test every word**, in random order (it used to be the first five, so July–December were never tested). About half the questions go **English → Slovak** ("How do you say this in Slovak?"), which is harder than recognising a word and closer to speaking. Voice uses 5 random words from the section.
- **Flashcards can be flipped**: a *Slovak → English / English → Slovak* switch above every card (lessons, Tests practice, Revise), remembered on the device.
- **Words mastered** no longer gets stuck: checkpoints and final tests ask words you haven't mastered yet first, so each retake covers new ground, and a word you get right again on a later day counts as mastered too.
- **Learn opens at your next section** instead of section 1, marked *Up next*, with a pinned bar of shortcuts: *Up next · A1.1 · A1.2*. After a lesson you land back on that section (or the next one, if you just opened it).
- **Dialogues: role-play voice.** You take one part (the customer, the patient, the tourist…), hear the other person's line, and say yours.
- **Alphabet: listening questions.** *Which letter do you hear?* plays a word with the letter blanked out (*\_aj* → č). Letters that sound the same (i/y, í/ý, and ä/e, ľ/l for most speakers) are never offered against each other. The letter questions also have a speaker.
- **Notes on phrases**: a word can have a short `note` in `data/vocab.json`, shown on the Learn screen, the back of the card and in Word Lists (searchable).
- **Smaller things**: roadmap titles wrap instead of running sideways, Grammar / Dialogue / Alphabet tags on the roadmap, a daily goal picker (5 / 10 / 20 / 30) instead of a pop-up box, a warmer top bar, a shorter top bar on phones (logo and buttons on one row), short tab names on tablets, and switching tabs starts at the top of the page.

**Checked by the teacher** (October 2026). The notes as they now read on the site:

| Phrase | Note | Teacher |
|---|---|---|
| dobrú noc · Dobrú chuť! · Šťastnú cestu! | It follows prajem (I wish), which takes the accusative: dobrá noc → (prajem) dobrú noc. | Corrected: it's the accusative after "to wish" |
| Idem do obchodu. | do (to) changes the ending: obchod → do obchodu. Compare v obchode (in the shop). | ✓ |
| Platím kartou. | kartou = by card: karta → kartou (paying with something). | ✓ |
| Platím v hotovosti. | hotovosť (cash) → v hotovosti after v. | ✓ |
| Tašku si neprosím. | taška → tašku: the thing you ask for (or don't) changes -a to -u. | ✓ |
| Záleží na počasí. | "It depends on" is záleží na: počasie → na počasí. | Corrected: was *Záleží od počasia*; "od" is common but wrong |
| Teší ma. // Rád Vás / ťa spoznávam. | Rád if you're a man, rada if you're a woman. Vás is formal, ťa informal. | ✓ |
| Ja mám osemnásť. | Age is said with mať (to have): literally "I have eighteen". | ✓ |
| Koľko máš rokov? | Literally "how many years do you have?" — after koľko, rok becomes rokov. | ✓ |
| Som unavený. / Som plný. | unavený / plný if you're a man, unavená / plná if you're a woman. | ✓ (unavený) |
| s ľadom / bez ľadu | s (with) takes the instrumental: ľad → s ľadom. bez (without) takes the genitive: ľad → bez ľadu. | Case names added |
| o jednej | hodina (hour) is left out: o jednej (hodine). The other hours work the same way. | ✓ |
| Môžeš / Môžete … | Môžeš is informal, Môžete formal. | ✓ |

Not in the list she was sent, so not checked yet: *Volám sa...* (literally "I call myself…"), *Už si to povedala.* (said to a woman; to a man: povedal), *Učím sa po slovensky.* (po slovensky = in Slovak, like hovorím po anglicky).

*Záleží na počasí* is new text, so it needs a recording: Add Content → Pronunciation audio → "Check & Generate Missing Audio".

## Polish pass (October 2026)

- **Roadmap path**: the straight dashed line down the middle is now a winding path drawn through every node (an SVG built from where the nodes actually are). Each step leaves a node sideways and drops into the next from above, so it never runs through a title. The stretch you've cleared, up to *Up next*, is drawn in gold. The Tests round picker gets the same path.
- **Only one node pulses**: *Up next* (and the first round still to do in Tests). Other open sections have a calm red-tinted border — before, a dev account had 100+ nodes pulsing at once.
- **Nodes**: a raised-medallion highlight, a breathing ring around *Up next* with its tag gently bobbing, and tinted Grammar (gold) / Dialogue (coral) / Alphabet (sage) pills. Level headers are milestone cards with a progress bar. A locked checkpoint now looks like other locked nodes (it used to be a bare lock).
- **Motion**: roadmap rows slide up into place as they scroll into view; a wrong answer gives a small head-shake, a right one a little spring; a card's answer (and its note) eases in when revealed. All of it is switched off for anyone with "reduce motion" set on their device.
- **Fixes**: in dark mode the patch behind centre titles is gone, and the shortcut bar and card switch are frosted glass like the other surfaces; the roadmap's staggered entrance now actually staggers; renaming a word keeps its first-right day (mastery counts from it); "today" is the learner's own calendar day — it was UTC, so anything done between midnight and 1–2am in Slovakia counted as the day before (streaks, daily goal, mastery).

## Teacher's review, round 4 (November 2026)

From "Slovak website notes 4" (section numbers as she wrote them; from 75 on, everything is now one higher, because Countries & Languages became three sections):

- **Tests → Practice went blank** when you picked another topic in the middle of a round: the round was cleared but the round picker stayed hidden. Fixed; the picked topic is also kept when the topic list reloads.
- **AI quiz**: 10 questions instead of 5, made as two batches at once (translation/meaning questions and fill-in-the-blank/word-form questions), so it takes no longer than before. For a word topic the quiz is built from that topic's words, **not-yet-mastered and most-missed first**, so each quiz covers new ground like the checkpoints. Each answer counts for its word: a miss goes to Revise, and a **right answer masters it, as on a checkpoint**; the score card says how many new words were mastered. A grammar topic's quiz is built from its summary and examples.
- **Voice check accepted *pekný* for *pekné***: the recogniser was being told the expected answer, so it wrote down what it was told to expect. It no longer is (Whisper still gets a Slovak sentence so it stays in Slovak; Google gets no hint). The result line always shows exactly what was recognised ("You said: …"). The check itself is stricter on endings too: a missed accent is forgiven inside a word, but **a final vowel must match exactly** — *pekný / pekná / pekné* are three different answers, and so are *pekné* (nice) and *pekne* (nicely). The trade-off: an unclear recording is more likely to be marked wrong.
- **Explanations vanished too fast** after answering a grammar/alphabet question. Nothing that shows an answer moves on by itself any more: every exercise (they all have an explanation) waits on **Next**, and so do a wrong pick in a quiz (with the right answer highlighted), a wrong or nearly-right typed answer, and a missed voice attempt. Only right answers move on by themselves.
- **Phrase notes** sit in a "Good to know" table above the words on the Learn screen (still under the word in Word Lists and on the back of the card).
- **Grammar Guide**: a **Topic** picker next to the search box, grouped like the page, for students who don't know the grammar terms to search for.
- **Section number** in every lesson's top bar ("Section 54").
- **Time & Daily Routine (54–58)**: clock times | more clock times | *ráno, dopoludnia*, the other parts of the day and *dnes / zajtra / včera* | *čas, sekundy, minúty, teraz, potom, niekedy, nikdy*. *dovolenka* and *prázdniny* removed. (*dopoludnia* moved with *ráno*, as the same kind of word.)
- **Languages, Countries, Nationalities (73–75)**, in that order, each its own section. New: *čeština, maďarčina, poľština, ukrajinčina* and *Čech / Češka, Nemec / Nemka, Rakúšan / Rakúšanka, Maďar / Maďarka, Poliak / Poľka, Ukrajinec / Ukrajinka* — for the teacher to check.
- **Verbs with sa (78)**: sa can change the meaning — *učiť* (to teach) / *učiť sa* (to learn), *volať / volať sa*, *obliekať / obliekať sa*, with two new exercises.
- **Leaderboard**: says what it counts — each person's best streak, the most days in a row they practised.

New Slovak text needs recordings: Add Content → Pronunciation audio → "Check & Generate Missing Audio".

### Her three bigger suggestions (built November 2026, for her to review)

- **Cases**: a new **What Are Cases?** section opens A1.2 (section 61): what a case is, a first table that goes from the everyday question to the case (*Kde?* → v + 6th, *Kam?* → do + 2nd / na + 4th, *Odkiaľ?* → z + 2nd, *Čo? Koho?* → 4th, *S kým?* → s + 7th, *Bez čoho?* → bez + 2nd), the six cases with their own question words (*Kto? Čo?*, *Koho? Čoho?*…), the prepositions that bring each one, and *mama / škola / brat* through all six. Numbered the Slovak school way, **1, 2, 3, 4, 6, 7** (the old 5th, the vocative, left out), to match the Six Cases reference. From there on, the A1.2 sections that use a case say which one in a **"Which case?"** line: prices and degrees (*päť eur* — genitive plural), dates (*v pondelok* — accusative, *v máji* — locative, *prvého mája* — genitive), where from (*z Ameriky* — genitive), objects and likes (accusative), *Kde? / Kam?* (locative / genitive / accusative with *na*, and *autobusom* — instrumental).
- **More kinds of question** in each word section's quiz, next to the two multiple-choice directions:
  - **Write it in Slovak** — about a quarter of the questions, only for short words and phrases. There are buttons for *á ä č ď é í ĺ ľ ň ó ô ŕ š ť ú ý ž*. Capitals and punctuation don't matter; either half of a slash entry counts. Right apart from the accents counts as right, with "Almost — watch the accents" and the correct spelling. A wrong answer shows the spelling and waits on Next.
  - **Which letter is missing?** — a word plays with one of its trickier letters blanked (*spál_a* → ň), with similar letters as the choices (never ones that sound identical). One or two per quiz, for single words that have such a letter.
- **"Use it" sections** after the room and clothes words (sections 100 and 103), with their own blue tag: *Use It: At Home* (*Mám malý byt. V obývačke pozerám televíziu. Nemám televízor.*, and the *v kuchyni / do kuchyne* pairs) and *Use It: What I'm Wearing* (*Mám na sebe…, Nosím čiapku…*). Sentences use only words and grammar taught by then. They're left out of the Grammar Guide (they're practice, not rules) but appear in the AI quiz topics.

Section numbers from 61 on moved again (the cases section, then two Use it sections).

## Subscription launch prep (November 2026)

**Sign-up screen** (replaces the shared site code). Create Account / Sign In tabs; three plan cards; a box for a developer or beta access code. Order: make the account, then either *Start Free Preview* or enter the code. The paid buttons say "Paid subscriptions launching soon!".

**Plans** — decided on the server (`netlify/functions/lib/plans.js`), shown in the account window (person icon, top right):

| Plan | Who | Gets |
|---|---|---|
| Developer | the two dev emails | everything + Add Content + Analytics |
| Beta access | entered the access code (`SITE_PASSWORD`); **also every account made before this update** (they all used the old site code) | everything |
| Pro (paid) | nobody yet — for when Stripe is on | everything |
| Free Preview | new accounts | sections 1–5, Sounds & Spelling in the Grammar Guide, Greetings & Basics and Everyday Phrases in Tests → Practice, 15 voice checks a day. No AI quiz or example sentences. |

Everything locked on Free shows **"Pro Plan Required"** with *Enter a beta code* / *See plans*. Locked sections carry a gold **Pro** tag on the roadmap. The code can be entered on the sign-up screen or later in the account window (10 tries a day per account).

**Cost protection** (limits per account per day, in `lib/plans.js`): voice checks 15 Free / 150 otherwise; AI quizzes 25; new example sentences 100; sentence audio 150. Example sentences are now cached for everyone — a word's sentence is made once and then served free to every learner. Add Content's two AI tools are dev-only on the server, not just hidden.

**Progress sync fix**: the browser's and the server's copies are now *merged* (cleared sections, mastered words and badges combined; counters take the higher value) instead of one replacing the other — so signing in on a fresh phone can no longer wipe progress. Shared code in `js/progress-merge.js`.

**Analytics tab** (dev only): accounts by plan; active learners (7/30 days); sections cleared; API calls today/this month with a cost line ("$0.00 — Within Free Tier" unless Google's speech fallback passes its 60 free minutes); a usage table (incl. the sentence cache hit rate and access-code tries); a learner list (plan, streak, furthest section, cleared, words mastered, last active — the site has no XP); the section funnel; the 25 most-missed words. Counting starts from this update.

**Legal**: Terms, Privacy Policy, Refund & Cancellation, and Pricing open from links on the sign-up screen, the account window and the new footer. Operator name and contact email are in `LEGAL_CONFIG` at the top of `js/app.js` — **swap in a registered business name and address before turning on Stripe**, and have the texts checked.

**Martina's bugs**: the voice check names the gender when only the ending is off ("Almost! We heard 'pekný' (masculine), but this prompt asks for 'pekné' (neuter)."); cleared and locked roadmap nodes show their section number; lesson Practice and Tests → Practice now mix in one *missing letter* and two *write it in Slovak* questions.

## Quick reference

- **To add content later**: edit `data/grammar.json` / `data/vocab.json` directly and push to GitHub, or use the Add Content tab on the site itself. Any word can take an optional `"note": "..."` next to `"sk"` and `"en"`.
- **Two voices**: recordings use Google's Slovak voice (female). Anything without a recording yet falls back to the browser's own voice, which varies by device and is often male — Add Content → "Check & Generate Missing Audio" replaces it. Slashes in entries (*ujo / strýko*) are spoken as a pause, not "lomka".
- **Levels**: every entry in `data/curriculum.json` has a `level` (`"A1.1"`, `"A1.2"`…). Checkpoints and each level's final test are generated from that — nothing else to set.
- **To change the beta/dev access code**: Netlify → Site configuration → Environment variables → edit `SITE_PASSWORD` → Trigger deploy. Accounts already unlocked stay unlocked.
- **Dev emails** are listed twice: `js/app.js` (what's shown) and `netlify/functions/lib/plans.js` (what's allowed). Change both.
- **Plan limits and prices**: limits in `netlify/functions/lib/plans.js`; plan cards (`PLAN_INFO`) and the legal texts at the top of `js/app.js`.
- **To publish any local change**: `git add -A`, `git commit -m "..."`, `git push` from the project folder — Netlify redeploys automatically within about a minute. Production deploys from `main`; other branches don't touch the live site.
