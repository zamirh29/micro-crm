export interface TaxBand {
  label: string
  from: number
  to: number | null
  rate: number
}

export interface TaxYearInfo {
  key: string
  label: string
  start: Date
  end: Date
  bands: TaxBand[]
}

export interface TaxBandRow {
  band: TaxBand
  taxable: number
  tax: number
}

export interface IncomeTaxResult {
  gross: number
  totalTax: number
  effectiveRate: number
  rows: TaxBandRow[]
}

export interface MtdStage {
  assessmentYear: string
  threshold: number
  mtdStart: string
  description: string
}

const BANDS_2026 = [
  { label: "Personal Allowance (0%)", from: 0, to: 12570, rate: 0 },
  { label: "Basic rate (20%)", from: 12570, to: 50270, rate: 0.2 },
  { label: "Higher rate (40%)", from: 50270, to: 125140, rate: 0.4 },
  { label: "Additional rate (45%)", from: 125140, to: null, rate: 0.45 },
] satisfies TaxBand[]

export const UK_TAX_YEARS: TaxYearInfo[] = [
  {
    key: "2026-27",
    label: "2026/27",
    start: new Date(Date.UTC(2026, 3, 6)),
    end: new Date(Date.UTC(2027, 3, 6)),
    bands: BANDS_2026,
  },
  {
    key: "2027-28",
    label: "2027/28",
    start: new Date(Date.UTC(2027, 3, 6)),
    end: new Date(Date.UTC(2028, 3, 6)),
    bands: BANDS_2026,
  },
  {
    key: "2028-29",
    label: "2028/29",
    start: new Date(Date.UTC(2028, 3, 6)),
    end: new Date(Date.UTC(2029, 3, 6)),
    bands: BANDS_2026,
  },
]

export function getTaxYearForDate(date: Date = new Date()): TaxYearInfo {
  const currentYear = date.getFullYear()
  const apr6ThisYear = new Date(Date.UTC(currentYear, 3, 6))
  let startYear = currentYear
  if (date < apr6ThisYear) startYear = currentYear - 1
  const key = `${startYear}-${String(startYear + 1).slice(2)}`
  return UK_TAX_YEARS.find((y) => y.key === key) ?? UK_TAX_YEARS[0]
}

export function computeIncomeTax(grossIncome: number): IncomeTaxResult {
  const year = getTaxYearForDate()
  let totalTax = 0
  const rows: TaxBandRow[] = year.bands.map((band) => {
    const upper = band.to ?? grossIncome
    const taxable = Math.max(0, Math.min(grossIncome, upper) - band.from)
    const tax = Math.round(taxable * band.rate)
    totalTax += tax
    return { band, taxable, tax }
  })

  return {
    gross: grossIncome,
    totalTax,
    effectiveRate: grossIncome > 0 ? totalTax / grossIncome : 0,
    rows,
  }
}

export const MTD_INCOME_TAX_SCHEDULE: MtdStage[] = [
  {
    assessmentYear: "2024/25",
    threshold: 50000,
    mtdStart: "6 April 2026",
    description:
      "Self-employment and property income over £50,000 in 2024/25 means MTD for Income Tax applies from 6 April 2026.",
  },
  {
    assessmentYear: "2025/26",
    threshold: 30000,
    mtdStart: "6 April 2027",
    description:
      "Income over £30,000 in 2025/26 means MTD for Income Tax applies from 6 April 2027.",
  },
  {
    assessmentYear: "2026/27",
    threshold: 20000,
    mtdStart: "6 April 2028",
    description:
      "Income over £20,000 in 2026/27 means MTD for Income Tax applies from 6 April 2028.",
  },
]

export interface MtdAssessment {
  liable: boolean
  stage: MtdStage | null
  nextStage: MtdStage | null
}

export function assessMtdLiability(grossIncome: number): MtdAssessment {
  // Liability is assessed per tax year against the previous year's return,
  // so we evaluate against each stage threshold in order.
  for (const stage of MTD_INCOME_TAX_SCHEDULE) {
    if (grossIncome > stage.threshold) {
      return { liable: true, stage, nextStage: null }
    }
  }
  return {
    liable: false,
    stage: null,
    nextStage: MTD_INCOME_TAX_SCHEDULE[MTD_INCOME_TAX_SCHEDULE.length - 1],
  }
}

export function formatPounds(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount)
}