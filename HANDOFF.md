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

**Dev accounts** (`prestonandersen100@gmail.com`, `mravikovamartina@gmail.com`) see every section unlocked, and can press **P** in a lesson to skip a question.

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

## Quick reference

- **To add content later**: edit `data/grammar.json` / `data/vocab.json` directly and push to GitHub, or use the Add Content tab on the site itself.
- **Two voices**: recordings use Google's Slovak voice (female). Anything without a recording yet falls back to the browser's own voice, which varies by device and is often male — Add Content → "Check & Generate Missing Audio" replaces it. Slashes in entries (*ujo / strýko*) are spoken as a pause, not "lomka".
- **Levels**: every entry in `data/curriculum.json` has a `level` (`"A1.1"`, `"A1.2"`…). Checkpoints and each level's final test are generated from that — nothing else to set.
- **To change the password**: Netlify → Site configuration → Environment variables → edit `SITE_PASSWORD` → Trigger deploy.
- **To publish any local change**: `git add -A`, `git commit -m "..."`, `git push` from the project folder — Netlify redeploys automatically within about a minute.
