# Slovak Learn — What's Been Done

- **Live site**: https://slovaklearn.netlify.app
- **GitHub repo**: https://github.com/preston100/slovak-learn

## What it is

A password-protected website for learning Slovak, with three main sections:

- **Grammar** — expandable topic cards (noun gender, the six cases, pronouns, question words, demonstratives, and full verb conjugation tables).
- **Vocabulary** — word lists grouped by topic (greetings, family, food, places, adjectives, time, numbers, common verbs, useful phrases, etc.), all transcribed from the study sheets you sent.
- **Tests** — generates a 5-question quiz, either from a topic you pick or from a file you upload, using Google's Gemini AI.
- **Add Content** — upload photos of notes, and Gemini pulls out new vocab/grammar and adds it permanently to the site for you, after you review and approve it.

Nobody sees anything until they enter the correct 4-digit code on the lock screen, and that check happens on the server, not just in the browser — so it can't be bypassed.

## Everything that happened, in order

1. **Built the whole site from scratch**: the page itself, the password gate, all three original sections, and the two Netlify functions that talk to Gemini — then tested the entire flow locally before handing it to you.
2. **Walked you through deployment**: pushing to GitHub, connecting it to Netlify, and setting up the `SITE_PASSWORD` and `GEMINI_API_KEY` secrets in the Netlify dashboard.
3. **You sent 5 photos of your Slovak notes** — I transcribed all of it (family, food, places, adjectives, time, numbers, verb conjugations, useful phrases, everyday phrases) into the Grammar and Vocabulary sections.
4. **Fixed a bug where quizzes stopped working entirely**: Google had retired the AI model the site was using. Switched it to an alias that auto-updates itself, so this specific failure shouldn't happen again.
5. **Built the "Add Content" feature you asked for**: upload a photo, Gemini reads it and proposes new vocab/grammar, you check off what you want, and it gets saved permanently to the site (this required setting up a GitHub access token so the site is allowed to save changes to itself).
6. **Chased down a string of "AI is busy" errors** you kept hitting, and fixed the real causes one by one:
   - Netlify (the hosting) kills any request that takes longer than 10 seconds — my first fix didn't account for that and made things worse. Rewrote it to respect that limit properly.
   - Added an automatic fallback to a second, usually-less-busy AI model when the main one is overloaded or rate-limited.
   - Added retrying from your browser too (which isn't stuck with that 10-second limit), so a busy moment now quietly retries a few times before ever showing you an error.

## Where things stand now

The site is live and working. Grammar and Vocabulary are plain files on the site itself, so they can never "go down." Tests and Add Content depend on Google's free Gemini API, which is now much more resilient to hiccups than it was, but can't be made 100% failure-proof since it's a free third-party service outside my control — if it ever fails now, it should be a rare, short-lived blip rather than a broken feature.

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

## Quick reference

- **To add content later**: edit `data/grammar.json` / `data/vocab.json` directly and push to GitHub, or use the Add Content tab on the site itself.
- **To change the password**: Netlify → Site configuration → Environment variables → edit `SITE_PASSWORD` → Trigger deploy.
- **To publish any local change**: `git add -A`, `git commit -m "..."`, `git push` from the project folder — Netlify redeploys automatically within about a minute.
