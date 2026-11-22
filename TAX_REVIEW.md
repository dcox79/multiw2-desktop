# 2026 tax engine review

Reviewed September 11, 2026. The public source snapshot passed 107 tests across 12 files. Raw migration runner logs are omitted because they contain workstation metadata; the regression tests themselves are included. This validates the implemented federal planning tables and the specific calculations below. It does not certify a complete tax return.

## Source verification

| Data used by the app | Verified 2026 value | Official source |
|---|---|---|
| Single bracket boundaries | 12,400; 50,400; 105,700; 201,775; 256,225; 640,600 | [Rev. Proc. 2025-32, section 4.01 Table 3](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32) |
| Joint bracket boundaries | 24,800; 100,800; 211,400; 403,550; 512,450; 768,700 | Same, Table 1 |
| Separate bracket boundaries | 12,400; 50,400; 105,700; 201,775; 256,225; 384,350 | Same, Table 4 |
| Head-of-household boundaries | 17,700; 67,450; 105,700; 201,750; 256,200; 640,600 | Same, Table 2; its 24%/32% thresholds differ from single by $25 |
| Marginal rates | 10%, 12%, 22%, 24%, 32%, 35%, 37% | Same, Tables 1-4 |
| Basic standard deductions | Single/separate $16,100; joint $32,200; head of household $24,150 | Same, section 4.14 |
| Child tax credit | $2,200 per eligible child | Same, section 4.05 |
| Other dependent credit / combined phaseout | $500; $50 per $1,000 or fraction over $200,000 ($400,000 joint) | [Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8), statutory rules retained for 2026 by Rev. Proc. 2025-32 |
| Social Security | $184,500 wage base; 6.2% employee; $11,439 maximum per person | [SSA contribution and benefit base](https://www.ssa.gov/oact/cola/cbb.html) |
| Medicare | 1.45%; additional 0.9% above $200,000 single/HOH, $250,000 joint, $125,000 separate; employer withholding threshold $200,000 | [IRS Topic 560](https://www.irs.gov/taxtopics/tc560), [Publication 15](https://www.irs.gov/publications/p15) |
| Retirement | $24,500 employee deferral; $72,000 total additions; $8,000 ordinary age-50 catch-up | [IRS Notice 2025-67](https://www.irs.gov/irb/2025-49_IRB), [IRS contribution limits](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits) |
| HSA | $4,400 self-only; $8,750 family | [Rev. Proc. 2025-19](https://www.irs.gov/pub/irs-drop/rp-25-19.pdf) |
| Estimated payments | April 15, June 15, September 15, 2026; January 15, 2027; 90% current-year alternative; at least $1,000 balance threshold | [2026 Form 1040-ES, pages 1, 4-5, 12](https://www.irs.gov/pub/irs-pdf/f1040es.pdf) |
| Prior-year high-income threshold | Prior-year AGI above $150,000, or $75,000 if current-year separate; 110% of actual prior-year tax | Same. A current-year tax estimate cannot supply prior-year tax. |
| SE tax | 92.35% net profit factor; 12.4% Social Security; 2.9% Medicare; employer-equivalent deduction excludes Additional Medicare Tax | [IRS Topic 554](https://www.irs.gov/taxtopics/tc554), [Schedule SE lines 4, 10-13](https://www.irs.gov/pub/irs-pdf/f1040sse.pdf); the retrieved Schedule SE is the 2025 form, used only for these unchanged formula rules, not its wage base |

Pay frequencies (52/26/24/12) are application assumptions, not a claim about a particular employer's payroll calendar.

## Baseline and deliberate corrections

The unchanged original suite passed **96 tests in 8 files** before editing tax code. Baseline test output and three complete synthetic calculation inputs/outputs preserve that evidence.

| Synthetic case, standard deduction | Old ordinary income tax | Reviewed 2026 result |
|---|---:|---:|
| Single, $165,000 + $145,000 | $72,552.25 | $71,634.25 |
| Joint, $200,000, two eligible children | $22,920.00 | $21,940.00 |
| Separate, $400,000 | $104,222.25 | $103,134.25 |

The old file contained 2025 brackets under a projected 2026 label. Its basic deductions and $2,000 child credit were also wrong for 2026. The MFS $400,000 case now remains in the 35% bracket after the $16,100 deduction; its taxable income is below $384,350. The retirement total-additions and catch-up amounts changed from $70,000/$7,500 to $72,000/$8,000. SS and HSA amounts were already numerically right and now have verified sources.

The intermediate report retains **17 failed assertions** after correcting behavior but before reviewing old expectations. No historical failure evidence was overwritten. That run also includes one independently added desktop test. Old CTC/bracket expectations were updated to the cited amounts; SS salary-based tests now explicitly use estimated paystub input, while new W-2 tests prove actual Box 4 handling. Quarterly assertions now check the 90% current-year target and unknown prior-year status, replacing the invented current-tax-times-110% amount and fixed 8% penalty rate.

Other narrow repairs:

- W-2 Box 3/5 are optional explicit payroll wage inputs. Actual Box 4 determines W-2 withholding and possible multi-employer credit. One employer's overcollection is excluded from the credit and its graph; [IRS Topic 608](https://www.irs.gov/taxtopics/tc608) requires recovery from the employer instead.
- Shared assembly filters W-2 and snapshots to the selected year and finds the newest in-year snapshot even if rows are unsorted. Snapshot/manual salaries are gross paystub amounts, so their pretax deductions apply.
- A 1099 scenario prorates its net profit, excludes it from employee payroll calculations, retains gross income, and deducts only half regular SE tax. Medicare uses Medicare wages independently of capped Social Security wages.
- Benefits subtract all employer HSA contributions before assigning employee room. Matching favors the higher match rate and employee allocations cannot exceed entered salary.
- A quarterly payment remains available through the local due date. The planning target starts at a $1,000 balance, not above it. Timing risk and unavailable prior-return liability are disclosed.

## Verification and scope

`npm test -- --reporter=json --outputFile=findings/tax/reviewed-tests.json` passed **104 tests**: 103 tax tests across 9 files and one desktop test. Final test report. Focused ESLint passed for all tax files and changed tests. New tests independently transcribe the IRS published cumulative tax at all 24 bracket boundaries and check the three numerical examples, payroll boxes, same-employer overcollection graph, mixed-year input, unsupported-year rejection, due-date boundary, 1099 tax, and cross-employer HSA/match allocation.

The implementing agent requested an independent parent-agent tax review. That review agreed on the 2026 constants and found the SS graph inconsistency; the graph correction and a regression assertion were added. Full application build/integration verification is recorded separately by the migration owner.

**Supported calculation year: 2026 only.** Entry and import may retain historical records; attempting a calculation with an explicit unsupported year throws a `RangeError`. APIs choose the reviewed year explicitly. Legacy saved inputs with no year remain compatible with 2026; their saved output is historical evidence, not a newly reviewed result. Prior-year safe harbor remains unavailable without the actual prior return; entering only a 2025 W-2 does not establish its tax liability.

These are retained planning limits, which must be visible with results:

- All entered jobs must belong to **one taxpayer at distinct employers** for the SS credit. Spouse income allocation, same-employer duplicate W-2s, railroad tax, and noncovered employment are not modeled. Joint-vs-separate output is an illustrative bracket comparison, not a filing-status recommendation.
- Missing W-2 Box 3/5 uses Box 1 plus traditional 401(k) as an approximation. Use actual boxes for reliable payroll wages. Payroll HSA entries are assumed to be eligible cafeteria-plan contributions. Medicare per-job withholding rows and monthly timelines are models; aggregate W-2 Box 6 is actual withholding.
- Federal income tax excludes AMT, investment/state taxes, refundable credits, QBI, special age/blind/dependent deductions, and other income or deductions. Entered itemized deductions must already be allowable; the app does not determine component limits or eligibility. Dependent counts must already meet IRS eligibility rules.
- Retirement calculations assume age below 50 and full-year self-only HSA eligibility. Family, catch-up and age-60-through-63 limits are not selected by the calculator. Employer plan/payroll restrictions and vesting still apply. Benefits savings use a constant marginal rate approximation.
- Direct calculation combines entered annual salary with the supplied withholding/contributions; partial-year data is not a year-end projection. Projections extrapolate a snapshot at a constant pace, cap implausible extrapolations and assume entered extra W-4 withholding is a new change. Existing extra withholding already reflected in that snapshot must not be entered again as a new change.
- W-4 suggestions divide the income-tax gap across a full year's pay periods. W-4 and quarterly outputs are income-tax planning amounts, not complete tax-return payment instructions, and exclude the separately shown 1099 SE tax. Quarterly payment totals do not establish whether earlier installments were paid on time.

The reviewed tables remove the known unverified-value blocker. These explicit scope limits remain; a passing migration test is not evidence that the app replaces return preparation.

## Final scenario correction

API review found that selecting December as a quit month removed the job's entire annual income. December now leaves the input unchanged, retaining full annual income, withholding and contributions including cents. Omitting the month deliberately models removing the job for the full year, and the selector's empty label must state that behavior.

The revised December regression failed before the initial engine correction: before-fix evidence. The independent API reviewer then caught rounding of fractional amounts in that initial correction. A stronger exact-input-preservation regression failed before the cents fix. After the final unchanged-input branch, all **9 scenario tests passed** and focused ESLint passed: final after-fix evidence. A separate regression retains the omitted-month full-year-removal contract. The original incorrect December expectation and intermediate results remain recorded in the baseline artifacts above.


## November 2026 follow-up

The 2026 ordinary-income rate schedules and basic deductions were already correct in the desktop app. The earlier website figures did not apply to this source. The regression suite retains all 24 bracket boundaries and checks that two W-2s totaling $100,000 produce $13,170 using the basic single deduction and the rate schedules. This is regular income-tax planning, not the Form 1040 tax-table amount for filing. 2026 remains the only calculation year; historical documents are retained.

The follow-up limits or corrects these modeled outputs:

- Combined employer and employee HSA amounts still count for contribution tracking, but are not deducted from gross or payroll wages without a separate employee pretax amount. Existing imported totals are not reinterpreted as employee contributions.
- Dependent records do not establish Schedule 8812 eligibility. Only confirmed CTC/ODC counts enter the regular-tax model, applied nonrefundable credits cannot exceed modeled regular tax, and refundable credits are not calculated.
- Year-end snapshot projections use the latest matching-year record. They avoid adding an existing W-4 amount a second time, never cap wages or withholding below entered amounts, and do not annualize former jobs. The projection warns when a job has no matching snapshot or the HSA split is unknown.
- A W-4 suggestion needs an explicit forecast and remaining checks; an annualized pay-frequency count or a final W-2 is not enough. Entered estimated payments reduce the modeled gap. The current UI does not collect exact remaining checks; use the IRS estimator rather than treating a historical or projected number as an instruction.
- General quarterly dates and the 90% regular-income planning benchmark remain. The app does not allocate a gap across installments or determine penalties without the prior return and payment dates. A spouse-by-spouse filing recommendation does not appear without separate spouse inputs.

Sources: [2026 IRS rate schedules](https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32), [IRS Pub. 969](https://www.irs.gov/publications/p969), [Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8), [IRS Form W-4](https://www.irs.gov/pub/irs-pdf/fw4.pdf), [Form 2210 instructions](https://www.irs.gov/instructions/i2210).
