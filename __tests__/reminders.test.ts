import { expect, test } from 'vitest';
import { buildReminderCalendar } from '@/components/dashboard/reminders';

test('calendar exports the four reviewed 2026 due dates with stable IDs and seven-day reminders', () => {
  const calendar = buildReminderCalendar(new Date('2026-09-11T12:00:00Z'));
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  expect(calendar.match(/TRIGGER:-P7D/g)).toHaveLength(4);
  for (const date of ['20260415', '20260615', '20260915', '20270115']) expect(calendar).toContain(`DTSTART;VALUE=DATE:${date}\r\n`);
  expect(calendar).toContain('DTSTAMP:20260911T120000Z\r\n');
  expect(calendar).toContain('UID:multiw2-2026-q4@local\r\n');
  expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
});
