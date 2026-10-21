# Slovak Learn — What's Been Done

- **Live site**: https://slovaklearn.netlify.app
- **GitHub repo**: https://github.com/preston100/slovak-learn

## What it is (as of October 2026)

A website for learning Slovak from scratch to the end of **A1**, behind two locks: a shared site code (checked on the server), then a personal account (email + password). Each account's progress is saved on the server, so it follows you between devices.

- **Profile** — progress ring, streak, daily goal, badges, leaderboard, and an "Up next" card that takes you to where you left off.
- **Learn** — one path through the course, split into levels: **A1.1** (alphabet → basics) and **A1.2** (numbers, dates, food, town, health, past & future). Every section is Learn → Practice → Voice → Quiz and needs 80% to unlock the next. A checkpoint test every 10 sections (70%), and a **final test** at the end of each level (80%) that opens the next one. **Word Lists** shows every word, by level.
- **Grammar Guide** — every grammar section in course order, by level: tables, examples and the explanation, with a "Practice this" button. *The Six Cases* sits at the end as reference only.
- **Tests** — an AI-written quiz (Gemini) on any topic, free practice rounds per word topic, and **Revise** for words you keep missing.
- **Add Content** — upload a photo of notes; Gemini proposes vocab/grammar, you approve it, and it appears under "My additions" for your account only. Also home to the **pronunciation audio** generator.

**Dev accounts** (`prestonandersen100@gmail.com`, `mravikovamartina@gmail.com`) see every section unlocked, and can press **P** in a lesson to skip a question. Tapping the elephant on the Profile switches **student view** on and off (locks and no P-skip, exactly as a student sees it; remembered on that device).

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

**For the teacher to check** — the new notes (first time these explanations appear on the site):

| Phrase | Note |
|---|---|
| dobrú noc | noc is feminine, and a wish ends in -ú: dobrá noc → (prajem) dobrú noc. |
| Dobrú chuť! | A wish, so -ú: dobrá chuť → (prajem) dobrú chuť. |
| Šťastnú cestu! | A wish: šťastná cesta → (prajem) šťastnú cestu. |
| Idem do obchodu. | do (to) changes the ending: obchod → do obchodu. Compare v obchode (in the shop). |
| Platím kartou. | kartou = by card: karta → kartou (paying with something). |
| Platím v hotovosti. | hotovosť (cash) → v hotovosti after v. |
| Tašku si neprosím. | taška → tašku: the thing you ask for (or don't) changes -a to -u. |
| Záleží od počasia. | počasie (weather) → od počasia after od. |
| Teší ma. // Rád Vás / ťa spoznávam. | Rád if you're a man, rada if you're a woman. Vás is formal, ťa informal. |
| Ja mám osemnásť. | Age is said with mať (to have): literally "I have eighteen". |
| Koľko máš rokov? | Literally "how many years do you have?" — after koľko, rok becomes rokov. |
| Volám sa... | Literally "I call myself…" (volať sa). |
| Som unavený. / Som plný. | unavený / plný if you're a man, unavená / plná if you're a woman. |
| Už si to povedala. | Said to a woman. To a man: Už si to povedal. |
| s ľadom / bez ľadu | s (with) / bez (without) change the ending: ľad → s ľadom, bez ľadu. |
| o jednej | hodina (hour) is left out: o jednej (hodine). The other hours work the same way. |
| Učím sa po slovensky. | po slovensky = in Slovak, like hovorím po anglicky (I speak English). |
| Môžeš / Môžete … | Môžeš is informal, Môžete formal. |

## Quick reference

- **To add content later**: edit `data/grammar.json` / `data/vocab.json` directly and push to GitHub, or use the Add Content tab on the site itself. Any word can take an optional `"note": "..."` next to `"sk"` and `"en"`.
- **Two voices**: recordings use Google's Slovak voice (female). Anything without a recording yet falls back to the browser's own voice, which varies by device and is often male — Add Content → "Check & Generate Missing Audio" replaces it. Slashes in entries (*ujo / strýko*) are spoken as a pause, not "lomka".
- **Levels**: every entry in `data/curriculum.json` has a `level` (`"A1.1"`, `"A1.2"`…). Checkpoints and each level's final test are generated from that — nothing else to set.
- **To change the password**: Netlify → Site configuration → Environment variables → edit `SITE_PASSWORD` → Trigger deploy.
- **To publish any local change**: `git add -A`, `git commit -m "..."`, `git push` from the project folder — Netlify redeploys automatically within about a minute.
