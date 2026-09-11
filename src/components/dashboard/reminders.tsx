'use client';

import { QUARTERLY_DUE_DATES, TAX_YEAR } from '@/lib/tax/tax-data-2026';

export function buildReminderCalendar(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MultiW2//Local Reminders//EN', 'CALSCALE:GREGORIAN',
    ...QUARTERLY_DUE_DATES.flatMap(({ quarter, isoDate }) => [
      'BEGIN:VEVENT', `UID:multiw2-${TAX_YEAR}-q${quarter}@local`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${isoDate.replaceAll('-', '')}`, `SUMMARY:Review Q${quarter} estimated tax payment`,
      'DESCRIPTION:Review your estimate in MultiW2. This reminder does not mean a payment is due.',
      'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:Review quarterly tax estimate', 'END:VALARM', 'END:VEVENT',
    ]), 'END:VCALENDAR', ''].join('\r\n');
}

export function Reminders() {
  const today = new Date();
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const upcoming = QUARTERLY_DUE_DATES.filter(item => item.isoDate >= date);
  function download() {
    const url = URL.createObjectURL(new Blob([buildReminderCalendar()], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `multiw2-${TAX_YEAR}-reminders.ics`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="rounded-lg border p-4 space-y-2" aria-label="Tax reminders">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">Tax reminders · {TAX_YEAR}</h2>
      <button type="button" className="text-sm underline" onClick={download}>Download calendar (.ics)</button>
    </div>
    <p className="text-sm">{upcoming.length ? `Next review: Q${upcoming[0].quarter} estimated payment — ${upcoming[0].dueDate}.` : `All ${TAX_YEAR} quarterly dates have passed. Review any outstanding payments.`}</p>
    <p className="text-xs text-muted-foreground">Checked when this dashboard opens. Import the calendar file for reminders while the app is closed; the app does not send emails or make payments.</p>
  </section>;
}
