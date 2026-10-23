# ShiftMoney

A shift and weekly pay tracker for part-time/casual fast food workers in Australia. It's a mobile web app — add it to your phone's home screen and use it like a native app.

## Features

- **Workplace setup** — on first launch, set up each workplace with its award (Fast Food Industry Award, General Retail Industry Award, or any other award / enterprise agreement), classification level, employment type and hourly rate. Penalty rates, evening/overnight time bands and break rules come from the award and can be edited. Work more than one job? Add each workplace and every shift is paid at its own workplace's rates.
- **Calendar** — a month view with the money earned on each day (solid = worked, dashed = rostered estimate). Each week row has an *Add roster* button that opens the import for that Monday-to-Sunday week.
- **Import shifts** — paste your Tanda shifts and your manager's messages (or upload screenshots, read in-browser with OCR). Dates, times and breaks are detected and **merged into one roster**.
  - Identical shifts are de-duplicated. When times differ, the preferred source (Settings: Message/Tanda) wins and the other version is kept so you can swap it in from the shift card.
  - Understands e.g. `Monday 27 Oct 9:00am - 3:00pm`, `Mon 9-3`, `Thu 5-11pm`, `27/10 10:00-16:00`, `Break 30m`, and Korean-language messages.
- **Automatic breaks** — paid (10 min) and unpaid (30 min meal) breaks from the shift length, based on the Fast Food Industry Award (editable).
- **Per-minute pay** — weekday, evening (10pm–12am), night (12am–6am), Saturday, Sunday and public holiday multipliers applied minute by minute.
- **Actual hours** — after a shift, enter clock-in/out and break minutes; pay is recalculated and compared with the roster.
- **Tax estimate** — PAYG withholding estimate (2026–27 rates), take-home pay, and how much more you can earn this week before tax kicks in (~$350/week). Working holiday maker (15%) and non-resident modes.
- **Earnings history** — weekly records, mark pay as received and compare with the actual deposit, monthly totals, financial-year (from 1 July) total vs the $18,200 tax-free threshold.
- Data stays in the browser (localStorage) with JSON backup/restore.

> Default penalty rates, break rules and tax are **estimates** based on common rules. Set your own hourly rate and multipliers from your payslip in Settings first.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # pay / parser / merge / tax tests
npm run build    # static build in dist/
```

Merging to `main` deploys to GitHub Pages via GitHub Actions (set repository Settings → Pages → Source to **GitHub Actions**). Open the page on your phone and choose "Add to Home Screen".
