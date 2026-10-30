import type { Band, Settings, Shift, Workplace } from '../types';
import { bandAt, calcShift, isUntaxed, summarize, taxableGross } from '../lib/pay';
import { bandLabel, messageRate } from '../lib/defaults';
import { weeklyWithholding } from '../lib/tax';
import { addDays, fmtDateShort, fmtDuration, fmtMoney, fmtTime, weekStartOf } from '../lib/time';

interface Props {
  shift: Shift;
  wp: Workplace;
  workplaces: Workplace[];
  /** Every saved shift, used to work out this shift's share of the week's tax */
  allShifts: Shift[];
  settings: Settings;
}

/** "5.25h" style hours, trimmed to at most 3 decimals */
const hours = (min: number) => `${+(min / 60).toFixed(3)}h`;

export default function PayBreakdown({ shift, wp, workplaces, allShifts, settings }: Props) {
  const c = calcShift(shift, wp, 'effective');
  const rate = wp.baseRate;
  // For Tanda shifts, also work the pay out from the rate so the two can be compared
  const base = c.fromTanda ? calcShift({ ...shift, tandaPay: undefined }, wp, 'effective') : c;
  const tandaTotal = c.fromTanda ? shift.tandaPay!.pay + c.missedPay : 0;
  const matchesTanda = c.fromTanda && Math.abs(base.pay - tandaTotal) < 0.01;

  // Band minutes without the missed-break and minimum-engagement extras, which get their own lines
  const worked: Partial<Record<Band, number>> = { ...base.minutesByBand };
  if (base.missedBreakMinutes) worked[base.missedBand] = (worked[base.missedBand] ?? 0) - base.missedBreakMinutes;
  const firstBand = bandAt(shift.date, base.start, !!shift.publicHoliday, wp);
  if (base.topUpMinutes) worked[firstBand] = (worked[firstBand] ?? 0) - base.topUpMinutes;
  const bandRows = (Object.entries(worked) as [Band, number][]).filter(([, m]) => m > 0);
  const bandPay = (band: Band, min: number) => (min * rate * wp.multipliers[band]) / 60;
  const calculated =
    bandRows.reduce((a, [b, m]) => a + bandPay(b, m), 0) +
    (base.topUpMinutes ? bandPay(firstBand, base.topUpMinutes) : 0) +
    base.missedPay +
    base.allowance;

  // Tax is withheld on the whole week's pay, so a shift's tax is its share of the week's estimate
  const weekStart = weekStartOf(shift.date, settings.weekStartDay);
  const weekEnd = addDays(weekStart, 6);
  const week = allShifts.filter((s) => s.id !== shift.id && s.date >= weekStart && s.date <= weekEnd).concat(shift);
  const weekSum = summarize(week, workplaces, 'effective');
  const weekTaxable = taxableGross(weekSum);
  const weekTax = weeklyWithholding(weekTaxable, settings.taxMode);
  const untaxed = isUntaxed(shift);
  const share = untaxed || weekTaxable <= 0 ? 0 : c.pay / weekTaxable;
  const tax = Math.round(weekTax * share * 100) / 100;
  const superAmt = untaxed ? 0 : Math.round(c.pay * settings.superRate * 100) / 100;

  return (
    <div className="breakdown-box">
      <div className="group-title">How this pay is worked out</div>

      <div className="bd-section">
        <div className="bd-head">Time</div>
        <div className="bd-row">
          <span>
            {c.usedActual ? 'Worked' : 'Rostered'} {fmtTime(c.start)}–{fmtTime(c.end)}
          </span>
          <span>{fmtDuration(c.span)}</span>
        </div>
        <div className="bd-row">
          <span>Paid break (still paid)</span>
          <span>{c.paidBreak}m</span>
        </div>
        <div className="bd-row">
          <span>Unpaid meal break</span>
          <span>−{c.unpaidBreak}m</span>
        </div>
        <div className="bd-row strong">
          <span>Paid time</span>
          <span>
            {fmtDuration(c.workedMinutes)}
            {c.workedMinutes % 60 !== 0 && ` (${hours(c.workedMinutes)})`}
          </span>
        </div>
      </div>

      <div className="bd-section">
        <div className="bd-head">Pay</div>
        {c.flat ? (
          <div className="bd-row">
            <span>
              Message roster: flat rate
              <br />
              <small>
                {hours(c.workedMinutes)} × {fmtMoney(messageRate(wp))} (no weekend rates, allowances or missed-break extras)
              </small>
            </span>
            <b>{fmtMoney(c.pay)}</b>
          </div>
        ) : (
          <>
        {bandRows.map(([band, min]) => (
          <div className="bd-row" key={band}>
            <span>
              {bandLabel(band, wp)}
              <br />
              <small>
                {hours(min)} × {fmtMoney(rate)}
                {wp.multipliers[band] !== 1 && ` × ${Math.round(wp.multipliers[band] * 100)}%`}
              </small>
            </span>
            <b>{fmtMoney(bandPay(band, min))}</b>
          </div>
        ))}
        {base.topUpMinutes > 0 && (
          <div className="bd-row">
            <span>
              Minimum paid time
              <br />
              <small>
                +{hours(base.topUpMinutes)} × {fmtMoney(rate)}
              </small>
            </span>
            <b>{fmtMoney(bandPay(firstBand, base.topUpMinutes))}</b>
          </div>
        )}
        {base.missedBreakMinutes > 0 && (
          <div className="bd-row">
            <span>
              Missed break ({base.missedBreakMinutes}m, paid on top)
              <br />
              <small>
                {base.missedHours}h × {fmtMoney(rate)}
                {wp.multipliers[base.missedBand] !== 1 && ` × ${Math.round(wp.multipliers[base.missedBand] * 100)}%`}
              </small>
            </span>
            <b>{fmtMoney(base.missedPay)}</b>
          </div>
        )}
        {base.allowance > 0 && (
          <div className="bd-row">
            <span>Laundry allowance</span>
            <b>{fmtMoney(base.allowance)}</b>
          </div>
        )}
        {Math.abs(calculated - base.pay) >= 0.01 && (
          <div className="bd-row muted">
            <span>Rounding</span>
            <span>{fmtMoney(base.pay - calculated)}</span>
          </div>
        )}
        {c.fromTanda && (
          <>
            <div className="bd-row strong">
              <span>Worked out from your rate</span>
              <span>{fmtMoney(base.pay)}</span>
            </div>
            <div className="bd-row">
              <span>
                Tanda pay
                <br />
                <small>{shift.tandaPay!.hours} hrs as shown in Tanda</small>
              </span>
              <b>{fmtMoney(shift.tandaPay!.pay)}</b>
            </div>
            {c.missedPay > 0 && (
              <div className="bd-row">
                <span>Break missed since Tanda's figure</span>
                <b>{fmtMoney(c.missedPay)}</b>
              </div>
            )}
            <p className={matchesTanda ? 'small match' : 'small mismatch'}>
              {matchesTanda
                ? '✓ Matches Tanda to the cent'
                : `Tanda is ${fmtMoney(Math.abs(tandaTotal - base.pay))} ${tandaTotal > base.pay ? 'higher' : 'lower'}. Tanda's figure is used. Check the rate, laundry allowance and breaks in your workplace settings.`}
            </p>
          </>
        )}
          </>
        )}
        <div className="bd-row total">
          <span>Pay before tax</span>
          <b>{fmtMoney(c.pay)}</b>
        </div>
      </div>

      <div className="bd-section">
        <div className="bd-head">Tax &amp; super</div>
        {untaxed ? (
          <p className="small muted">Message roster: no tax or super taken off. The button below switches this shift to award pay with tax.</p>
        ) : (
          <>
            <div className="bd-row">
              <span>
                Est. tax (PAYG)
                <br />
                <small>
                  Week {fmtDateShort(weekStart)}–{fmtDateShort(weekEnd)}: {fmtMoney(weekTax)} on {fmtMoney(weekTaxable)}. This shift is{' '}
                  {Math.round(share * 100)}% of that
                </small>
              </span>
              <b>−{fmtMoney(tax)}</b>
            </div>
            <div className="bd-row">
              <span>
                Super (paid by employer, not taken off)
                <br />
                <small>
                  {fmtMoney(c.pay)} × {Math.round(settings.superRate * 1000) / 10}%
                </small>
              </span>
              <span>{fmtMoney(superAmt)}</span>
            </div>
          </>
        )}
        <div className="bd-row total">
          <span>Est. take-home</span>
          <b>{fmtMoney(c.pay - tax)}</b>
        </div>
      </div>
    </div>
  );
}
