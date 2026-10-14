import { describe, it, expect } from 'vitest'
import { shouldRemindWithdraw, firstTradingDayOfWeek } from '../withdrawReminder.js'

// Week of Mon Oct 12 – Sun Oct 18, 2026
const day = (d) => new Date(2026, 9, d)
const noHolidays = () => false
const trade = (pnl, date) => ({ pnl, sold_at: `${date}T10:00:00` })

const base = {
  isHoliday: noHolidays,
  threshold: 10000,
  balanceData: { rawStarting: 9000, earliestBalanceDate: '2026-01-02' },
  fundTransactions: [],
  lastShownDate: null,
}

describe('firstTradingDayOfWeek', () => {
  it('is Monday, or the next non-holiday weekday', () => {
    expect(firstTradingDayOfWeek(day(14), noHolidays)).toEqual(day(12))
    const mondayOff = (s) => s === '2026-10-12'
    expect(firstTradingDayOfWeek(day(14), mondayOff)).toEqual(day(13))
  })
})

describe('shouldRemindWithdraw', () => {
  const atTargetBeforeMonday = [trade(1500, '2026-10-09')] // 9000 + 1500 = 10500 going into Mon

  it('toasts on the first trading day when the balance is at target', () => {
    expect(shouldRemindWithdraw({ ...base, today: day(12), trades: atTargetBeforeMonday })).toBe(true)
  })

  it('keeps toasting on later days that week until a withdrawal', () => {
    expect(shouldRemindWithdraw({ ...base, today: day(13), trades: atTargetBeforeMonday, lastShownDate: '2026-10-12' })).toBe(true)
    expect(shouldRemindWithdraw({ ...base, today: day(15), trades: atTargetBeforeMonday })).toBe(true)
  })

  it('stops once a withdrawal dated this week is recorded', () => {
    const funds = [{ date: '2026-10-13', amount: -2000, type: 'withdrawal' }]
    expect(shouldRemindWithdraw({ ...base, today: day(14), trades: atTargetBeforeMonday, fundTransactions: funds })).toBe(false)
  })

  it('never toasts mid-week if the target was only hit after the first trading day', () => {
    const hitWednesday = [trade(500, '2026-10-09'), trade(1500, '2026-10-14')] // 9500 going into Mon
    expect(shouldRemindWithdraw({ ...base, today: day(14), trades: hitWednesday })).toBe(false)
    expect(shouldRemindWithdraw({ ...base, today: day(16), trades: hitWednesday })).toBe(false)
  })

  it('goes by the balance going into Monday, whichever day the app is opened', () => {
    // At target going into Monday, a small loss Monday that stays above it — still "on".
    const smallLoss = [...atTargetBeforeMonday, trade(-200, '2026-10-12')]
    expect(shouldRemindWithdraw({ ...base, today: day(13), trades: smallLoss })).toBe(true)
  })

  it('stops once the balance drops below the target', () => {
    const bigLoss = [...atTargetBeforeMonday, trade(-2000, '2026-10-12')] // 8500 now
    expect(shouldRemindWithdraw({ ...base, today: day(13), trades: bigLoss })).toBe(false)
  })

  it('stays off for the week after dropping below, even if the balance climbs back', () => {
    const dipTuesday = [...atTargetBeforeMonday, trade(-1000, '2026-10-13'), trade(1500, '2026-10-14')]
    expect(shouldRemindWithdraw({ ...base, today: day(15), trades: dipTuesday })).toBe(false)
  })

  it('does not restart mid-week if the balance climbs back above the target', () => {
    // Week was "off" (below on Monday); back above by Thursday — still nothing.
    const below = [trade(500, '2026-10-09'), trade(2000, '2026-10-14')]
    expect(shouldRemindWithdraw({ ...base, today: day(15), trades: below })).toBe(false)
  })

  it('shows at most once per day', () => {
    expect(shouldRemindWithdraw({ ...base, today: day(13), trades: atTargetBeforeMonday, lastShownDate: '2026-10-13' })).toBe(false)
  })

  it('skips weekends and holidays', () => {
    expect(shouldRemindWithdraw({ ...base, today: day(17), trades: atTargetBeforeMonday })).toBe(false)
    const tueOff = (s) => s === '2026-10-13'
    expect(shouldRemindWithdraw({ ...base, isHoliday: tueOff, today: day(13), trades: atTargetBeforeMonday })).toBe(false)
  })

  it('uses the first non-holiday day when Monday is a holiday', () => {
    const mondayOff = (s) => s === '2026-10-12'
    // Trade on Mon (holiday) counts toward the balance going into Tue.
    const trades = [trade(500, '2026-10-09'), trade(1000, '2026-10-12')]
    expect(shouldRemindWithdraw({ ...base, isHoliday: mondayOff, today: day(13), trades })).toBe(true)
  })

  it('does nothing without a valid target', () => {
    expect(shouldRemindWithdraw({ ...base, threshold: 0, today: day(12), trades: atTargetBeforeMonday })).toBe(false)
    expect(shouldRemindWithdraw({ ...base, threshold: NaN, today: day(12), trades: atTargetBeforeMonday })).toBe(false)
  })
})
