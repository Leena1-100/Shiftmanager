# Payslip format manual

The weekly payslip from the employer's payroll always has the same layout. Shift Manager reads it with a
dedicated reader (`src/lib/payslipTemplate.ts`) that takes each figure from one fixed place, instead of
guessing from labels. This page is the reference for that layout and for how each figure is read.

## Layout

```
                                        ┌ Employer name, ABN, address ┐
[logo]                                  └─────────────────────────────┘
Name:      …                             Period Starting   16 Nov 2026
Job Title: FOH                           Period Ending     22 Nov 2026
Address:   …                             Payment Date      24 Nov 2026
                                         Gross Earning         $662.94
                                         Net Pay               $604.94
                                         Superannuation         $79.55

                                  Units      Rate      This Pay        YTD
SALARY & WAGE
  Ordinary Hours                   23.7  $27.81000      $659.10  $2,650.58
  Allowances subject to tax withholding and super
    Laundry                           3   $1.28000        $3.84     $17.92
                                                        $662.94  $2,668.50
TAX
  PAYG                                                   $58.00    $174.00
                                                         $58.00    $174.00
SUPER CONTRIBUTIONS
  Super Guarantee                                        $79.55    $320.22
  <super fund> - <member no.>                            $79.55    $320.22
LEAVE DETAILS                    Accrued (hrs)   Taken (hrs)   Remaining (hrs)
  Annual Leave                        1.82308             0            7.33154
PAYMENT DETAILS                                                         Amount
  (<BSB>) *****<acct>   <name>                                          $604.94
```

## Where each figure comes from

| App field | Read from | Notes |
|---|---|---|
| Pay period from | `Period Starting` | Picks the week the payslip is saved to |
| Pay period to | `Period Ending` | |
| Pay date | `Payment Date` | Usually the Tuesday after the week |
| Gross pay | `Gross Earning` (summary box) | Equals the SALARY & WAGE subtotal, laundry included |
| Tax withheld | `PAYG` line under **TAX**, first amount | First amount is **This Pay**, second is YTD |
| Net pay | `Net Pay` (summary box) | Cross-checked with the PAYMENT DETAILS amount |
| Super | `Superannuation` (summary box), else `Super Guarantee` | Paid by the employer, not taken from pay |
| Hours | Every `… Hours` line under SALARY & WAGE: `This Pay ÷ Rate` | Units are not used (OCR drops their decimal point) |

Columns: **Units · Rate · This Pay · YTD**. Only the **This Pay** column is ever used; YTD is ignored.

## Traps the reader avoids

- **"Allowances subject to tax withholding and super" is a heading**, not the tax or super line. Tax is only
  read from the `PAYG` line. (An earlier version read the Laundry line's `$3.84` as tax because of this heading.)
- **Laundry is an allowance** ($1.28 × shifts). It is part of gross pay, never tax, net or super.
- **OCR slips seen on real screenshots**, all handled:
  - `Gross Eaming` for "Gross Earning"
  - `24Nov 2026` with no space
  - `237` for 23.7 hours
  - `$384` for $3.84, `$7955` for $79.55: every amount on this payslip has a `$` and cents, so a `$`
    amount without a decimal point is read as cents

## Cross-checks

On this payslip there are no deductions besides PAYG, so:

```
Gross Earning − PAYG = Net Pay          662.94 − 58.00 = 604.94
SALARY & WAGE subtotal = Gross Earning  659.10 + 3.84 = 662.94
Net Pay = PAYMENT DETAILS amount        604.94
```

If the tax read doesn't fit `gross − net`, `gross − net` is used. The payslip sheet and the week cards also
show **Check tax** when a saved payslip doesn't add up, with a one-tap fix.

The app then compares **Gross Earning** with its own Tanda total for the week. A difference usually means a
missing or extra shift, a break entered differently, or the laundry allowance switched off in the workplace.

## Adding a payslip in the app

1. This week tab (or a week in Earnings) → **Add payslip**
2. **Read from screenshot**, or paste the text and tap **Find numbers**
3. Check the figures (the sheet says when it recognised this layout) → **Save payslip**

The week then shows **From payslip**: tax withheld and take-home (net pay + cash shifts) come from the payslip
instead of the estimate.

## When the layout changes

If the payroll changes the layout, `isTemplatePayslip` stops matching and the general reader
(`parsePayslip` in `src/lib/payslip.ts`) takes over. Update `parseTemplatePayslip` and the test
"employer payslip layout" in `src/lib/logic.test.ts` with an OCR sample of the new layout, with personal details
(name, address, bank and super member numbers) replaced.
