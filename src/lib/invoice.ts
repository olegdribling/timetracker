import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
import type { InvoiceProfile } from '../types'
import type { PeriodRange } from './calculations'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${m}m`
}

const money = (amount: number) =>
  amount.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const wrapText = (text: string, limit = 40) => {
  if (!text) return []
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > limit && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  })
  if (current) lines.push(current)
  return lines
}

export async function generateInvoicePdf(params: {
  profile: InvoiceProfile
  period: PeriodRange
  invoiceNumber: number
  itemLabel: string
  unitPrice: number
  quantityMinutes: number
  subtotal: number
  gst?: number
  balanceDue?: number
}) {
  const {
    profile,
    period,
    invoiceNumber,
    itemLabel,
    unitPrice,
    quantityMinutes,
    subtotal,
    gst = 0,
    balanceDue = subtotal + gst,
  } = params

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4 portrait
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const { height, width } = page.getSize()

  const margin = 40
  const line = 16

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean } = {},
  ) => {
    page.drawText(text, {
      x,
      y,
      size: opts.size ?? 12,
      font: opts.bold ? bold : font,
      color: rgb(0, 0, 0),
    })
  }

  const rightX = width - margin - 170
  let y = height - margin

  // Header: Sender (left) and Invoice info (right)
  y -= line * 0.7
  drawText(profile.fullName || 'Your name', margin, y, { bold: true, size: 14 })
  y -= line * 1.2
  const addressLines = wrapText(profile.address || 'Your address')
  addressLines.forEach((addrLine, idx) => {
    drawText(addrLine, margin, y)
    y -= idx === addressLines.length - 1 ? line : line
  })
  /* drawText(profile.speciality || '', margin, y) */
  y -= line
  drawText(`ABN: ${profile.abn || '—'}`, margin, y)

  const rightStartY = height - margin - 10
  drawText('TAX Invoice', rightX, rightStartY, { bold: true, size: 14  })
  drawText(`Invoice # ${String(invoiceNumber).padStart(3, '0')}`, rightX, rightStartY - line * 1.2, { bold: true })
  drawText(`Date  ${formatShortDate(period.end)}`, rightX, rightStartY - line * 2.4, { bold: true })
  drawText(`Period  ${formatDate(period.start)} — ${formatDate(period.end)}`, rightX, rightStartY - line * 3.6, { size: 10 })

  // Bill to placeholder
  y -= line * 4
  drawText('Bill to:', margin, y, { bold: true })
  y -= line * 1.2
  drawText('Client name', margin, y, { bold: true })
  y -= line
  drawText('Client company / address', margin, y)
  y -= line
  drawText('City / Country', margin, y)

  // Table
  y -= line * 2
  const tableTop = y
  const tableHeightPerRow = 24
  const colWidths = [220, 90, 80, 120]
  const colX = [margin, margin + colWidths[0], margin + colWidths[0] + colWidths[1], margin + colWidths[0] + colWidths[1] + colWidths[2]]
  const headers = ['Item', 'Unit Price', 'Qty', 'Subtotal']

  const rows = [
    {
      item: itemLabel || 'Service',
      unit: `$${money(unitPrice)}`,
      qty: formatDuration(quantityMinutes),
      subtotal: `$${money(subtotal)}`,
    },
  ]

  const footerRows = [
    { item: '10% GST', unit: '', qty: '', subtotal: gst ? `$${money(gst)}` : '' },
    { item: 'Balance Due:', unit: '', qty: '', subtotal: `$${money(balanceDue)}` },
  ]

  const allRows = [
    headers,
    ...rows.map((r) => [r.item, r.unit, r.qty, r.subtotal]),
    ...footerRows.map((r) => [r.item, r.unit, r.qty, r.subtotal]),
  ]

  allRows.forEach((cells, idx) => {
    const isHeader = idx === 0
    const rowY = tableTop - tableHeightPerRow * idx
    page.drawRectangle({
      x: margin,
      y: rowY - tableHeightPerRow,
      width: colWidths.reduce((a, b) => a + b, 0),
      height: tableHeightPerRow,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
      color: isHeader ? rgb(0.95, 0.95, 0.95) : undefined,
    })

    cells.forEach((text, cIdx) => {
      const x = colX[cIdx] + 6
      const textY = rowY - tableHeightPerRow + 7
      drawText(String(text), x, textY, { bold: isHeader })
    })
  })

  const tableBottom = tableTop - tableHeightPerRow * (allRows.length - 1) - tableHeightPerRow
  let afterTableY = tableBottom - line * 2

  // Payment details
  drawText('Preferred Payment Method: EFT', margin, afterTableY, { bold: true })
  afterTableY -= line * 1.5
  drawText(`Account Name: ${profile.fullName || '—'}`, margin, afterTableY)
  afterTableY -= line * 1.2
  drawText(`BSB:            ${profile.bsb || '—'}`, margin, afterTableY)
  afterTableY -= line * 1.2
  drawText(`ACCOUNT:   ${profile.accountNumber || '—'}`, margin, afterTableY)

  const pdfBytes = await pdfDoc.save()
  const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  saveAs(blob, `Invoice-${invoiceNumber}-${period.start}-to-${period.end}.pdf`)
}
